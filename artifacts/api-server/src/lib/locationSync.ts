import { eq } from "drizzle-orm";
import { db as defaultDb, freelancerProfilesTable, usersTable } from "@workspace/db";

type DB = typeof defaultDb;

export async function syncFreelancerLocationFromUser(dbClient: DB, userId: number): Promise<void> {
  const [user] = await dbClient
    .select({
      countryCode: usersTable.countryCode,
      currencyCode: usersTable.currencyCode,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return;

  await dbClient
    .update(freelancerProfilesTable)
    .set({
      countryCode: user.countryCode,
      currencyCode: user.currencyCode,
      updatedAt: new Date(),
    })
    .where(eq(freelancerProfilesTable.userId, userId));
}
