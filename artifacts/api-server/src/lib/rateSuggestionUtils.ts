import { and, eq, isNotNull } from "drizzle-orm";
import {
  bookingsTable,
  freelancerProfilesTable,
  type db,
} from "@workspace/db";

type DbClient = Pick<typeof db, "select">;

export type RatePaymentType = "hourly" | "daily" | "fixed";

function rateColumnForPaymentType(paymentType: RatePaymentType) {
  return paymentType === "daily"
    ? freelancerProfilesTable.dailyRate
    : freelancerProfilesTable.hourlyRate;
}

export async function getMarketMedian(
  dbClient: DbClient,
  fieldOfWork: string,
  paymentType: RatePaymentType = "hourly",
): Promise<number | null> {
  if (paymentType === "fixed") return null;

  const rateColumn = rateColumnForPaymentType(paymentType);
  const rates = await dbClient
    .select({ rate: rateColumn })
    .from(freelancerProfilesTable)
    .where(and(
      eq(freelancerProfilesTable.fieldOfWork, fieldOfWork),
      isNotNull(rateColumn),
    ));

  if (rates.length < 3) return null;

  const sorted = rates
    .map((r) => Number(r.rate))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (sorted.length < 3) return null;

  return sorted[Math.floor(sorted.length / 2)];
}

export async function getEmployerHistoricalAvg(
  dbClient: DbClient,
  employerProfileId: number,
  fieldOfWork: string,
): Promise<number | null> {
  const rows = await dbClient
    .select({ rate: bookingsTable.proposedRate })
    .from(bookingsTable)
    .innerJoin(freelancerProfilesTable, eq(freelancerProfilesTable.id, bookingsTable.freelancerId))
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.negotiationStatus, "agreed"),
      eq(freelancerProfilesTable.fieldOfWork, fieldOfWork),
      isNotNull(bookingsTable.proposedRate),
    ));

  if (rows.length < 2) return null;

  const values = rows
    .map((r) => Number(r.rate))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (values.length < 2) return null;

  return Math.round(values.reduce((s, r) => s + r, 0) / values.length);
}
