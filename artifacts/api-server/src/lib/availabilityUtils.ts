import { db } from "@workspace/db";
import {
  availabilityBlocksTable,
  freelancerProfilesTable,
} from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";

type DB = typeof db;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnly(value: Date | string): Date {
  if (typeof value === "string") {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateString(value: Date | string): string {
  if (typeof value === "string") return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calculateNextAvailableDate(
  isAvailable: boolean,
  availableFrom: Date | string | null,
  blocks: { startDate: Date | string; endDate: Date | string }[],
): Date | null {
  if (!isAvailable) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureBlocks = blocks
    .map((b) => ({
      startDate: toDateOnly(b.startDate),
      endDate: toDateOnly(b.endDate),
    }))
    .filter((b) => b.endDate >= today)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const merged: { start: Date; end: Date }[] = [];
  for (const block of futureBlocks) {
    const last = merged[merged.length - 1];
    if (last && block.startDate <= addDays(last.end, 1)) {
      last.end = block.endDate > last.end ? block.endDate : last.end;
    } else {
      merged.push({ start: block.startDate, end: block.endDate });
    }
  }

  let candidate = today;

  if (availableFrom) {
    const from = toDateOnly(availableFrom);
    if (from > candidate) {
      candidate = from;
    }
  }

  for (const block of merged) {
    if (candidate >= block.start && candidate <= block.end) {
      candidate = addDays(block.end, 1);
    }
  }

  return candidate;
}

export async function refreshNextAvailableDate(dbConn: DB, freelancerId: number): Promise<void> {
  const todayStr = toDateString(new Date());

  const [profile] = await dbConn
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, freelancerId))
    .limit(1);

  if (!profile) return;

  const blocks = await dbConn
    .select()
    .from(availabilityBlocksTable)
    .where(
      and(
        eq(availabilityBlocksTable.freelancerId, freelancerId),
        gte(availabilityBlocksTable.endDate, todayStr),
      ),
    );

  const nextDate = calculateNextAvailableDate(
    profile.isAvailable,
    profile.availableFrom,
    blocks,
  );

  await dbConn
    .update(freelancerProfilesTable)
    .set({
      nextAvailableDate: nextDate ? toDateString(nextDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(freelancerProfilesTable.id, freelancerId));
}

export async function createAvailabilityBlock(
  dbConn: DB,
  params: {
    freelancerId: number;
    startDate: Date | string;
    endDate: Date | string;
    reason: "booked" | "holiday" | "unavailable";
    label?: string | null;
    bookingId?: number | null;
  },
) {
  if (params.bookingId) {
    await dbConn
      .delete(availabilityBlocksTable)
      .where(eq(availabilityBlocksTable.bookingId, params.bookingId));
  }

  const [block] = await dbConn
    .insert(availabilityBlocksTable)
    .values({
      freelancerId: params.freelancerId,
      startDate: toDateString(params.startDate),
      endDate: toDateString(params.endDate),
      reason: params.reason,
      label: params.label ?? null,
      bookingId: params.bookingId ?? null,
    })
    .returning();

  await refreshNextAvailableDate(dbConn, params.freelancerId);
  return block;
}

export async function deleteAvailabilityBlockByBookingId(
  dbConn: DB,
  bookingId: number,
): Promise<void> {
  const [existing] = await dbConn
    .select()
    .from(availabilityBlocksTable)
    .where(eq(availabilityBlocksTable.bookingId, bookingId))
    .limit(1);

  if (!existing) return;

  await dbConn
    .delete(availabilityBlocksTable)
    .where(eq(availabilityBlocksTable.bookingId, bookingId));

  await refreshNextAvailableDate(dbConn, existing.freelancerId);
}

/**
 * Exclusive lock when a booking becomes active (confirmation).
 * Primary call site: agreement fully signed → booking status active.
 * Secondary: PATCH /bookings/:id with status active.
 */
export async function lockFreelancerForActiveBooking(
  dbConn: DB,
  booking: {
    id: number;
    freelancerId: number;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  },
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  const endDate =
    booking.endDate == null
      ? null
      : booking.endDate instanceof Date
        ? booking.endDate
        : new Date(booking.endDate);

  await dbConn
    .update(freelancerProfilesTable)
    .set({
      isAvailable: false,
      currentBookingId: booking.id,
      bookingEndDate: endDate,
      updatedAt: new Date(),
    })
    .where(eq(freelancerProfilesTable.id, booking.freelancerId));

  const blockStart = booking.startDate ?? null;
  const blockEnd = booking.endDate ?? null;
  if (blockStart && blockEnd) {
    createAvailabilityBlock(dbConn, {
      freelancerId: booking.freelancerId,
      startDate: blockStart,
      endDate: blockEnd,
      reason: "booked",
      bookingId: booking.id,
    }).catch((err) =>
      log?.warn(
        { err, bookingId: booking.id },
        "auto-block creation failed",
      ),
    );
  } else {
    log?.warn(
      { bookingId: booking.id },
      "auto-block skipped — no date range on booking",
    );
    await refreshNextAvailableDate(dbConn, booking.freelancerId);
  }
}
