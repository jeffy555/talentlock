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
