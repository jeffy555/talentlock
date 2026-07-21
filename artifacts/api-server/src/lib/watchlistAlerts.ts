import { db } from "@workspace/db";
import { savedFreelancersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createNotification, NotificationType } from "./createNotification";

export const RATE_CHANGE_THRESHOLD = 0.05;
export const ALERT_DEBOUNCE_MS = 24 * 60 * 60 * 1000;

export type FreelancerSnapshot = {
  isAvailable: boolean;
  hourlyRate: string | null;
  dailyRate: string | null;
  name: string;
};

export function shouldNotifyAvailability(before: FreelancerSnapshot, after: FreelancerSnapshot): boolean {
  return !before.isAvailable && after.isAvailable;
}

export function shouldNotifyRateChange(before: FreelancerSnapshot, after: FreelancerSnapshot): boolean {
  for (const field of ["hourlyRate", "dailyRate"] as const) {
    const oldVal = before[field] ? parseFloat(before[field]!) : null;
    const newVal = after[field] ? parseFloat(after[field]!) : null;
    if (oldVal === null && newVal !== null) return true;
    if (oldVal !== null && newVal !== null && oldVal > 0) {
      const delta = Math.abs(newVal - oldVal) / oldVal;
      if (delta >= RATE_CHANGE_THRESHOLD) return true;
    }
  }
  return false;
}

export function isWithinAlertDebounce(lastAlertAt: Date | null, nowMs = Date.now()): boolean {
  if (!lastAlertAt) return false;
  return nowMs - lastAlertAt.getTime() < ALERT_DEBOUNCE_MS;
}

export async function notifyWatchlistSubscribers(
  freelancerProfileId: number,
  before: FreelancerSnapshot,
  after: FreelancerSnapshot,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  const availability = shouldNotifyAvailability(before, after);
  const rate = shouldNotifyRateChange(before, after);
  if (!availability && !rate) return;

  const message = availability
    ? `${after.name} is now available for new engagements`
    : `${after.name} updated their rate`;

  const savers = await db
    .select({
      id: savedFreelancersTable.id,
      employerUserId: savedFreelancersTable.employerUserId,
      lastAlertAt: savedFreelancersTable.lastAlertAt,
    })
    .from(savedFreelancersTable)
    .where(eq(savedFreelancersTable.freelancerId, freelancerProfileId));

  const now = Date.now();
  for (const saver of savers) {
    if (isWithinAlertDebounce(saver.lastAlertAt, now)) continue;

    await createNotification(db, {
      userId: saver.employerUserId,
      type: NotificationType.WATCHLIST_UPDATE,
      entityType: "freelancer_profile",
      entityId: freelancerProfileId,
      message,
    });

    await db
      .update(savedFreelancersTable)
      .set({ lastAlertAt: new Date() })
      .where(eq(savedFreelancersTable.id, saver.id));
  }
}
