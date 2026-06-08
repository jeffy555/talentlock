import { db } from "@workspace/db";
import {
  reviewsTable,
  freelancerProfilesTable,
  employerProfilesTable,
  usersTable,
  type Review,
} from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;
export const REVIEW_MAX_COMMENT_LENGTH = 1000;
export const REVIEW_MAX_REPLY_LENGTH = 1000;
export const BOOKING_COMPLETED_STATUS = "completed";

export type PublicReview = {
  id: number;
  rating: number;
  comment: string | null;
  reply: string | null;
  createdAt: string;
  repliedAt: string | null;
  employerDisplayName: string;
};

export function toPublicReview(review: Review, employerDisplayName: string): PublicReview {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    reply: review.reply,
    createdAt: review.createdAt.toISOString(),
    repliedAt: review.repliedAt ? review.repliedAt.toISOString() : null,
    employerDisplayName,
  };
}

/** Resolves display name: companyName → users.name → email local-part. */
export async function resolveEmployerDisplayName(employerUserId: number): Promise<string> {
  const [user] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, employerUserId))
    .limit(1);
  const [employer] = await db
    .select({ companyName: employerProfilesTable.companyName })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.userId, employerUserId))
    .limit(1);

  if (employer?.companyName?.trim()) return employer.companyName.trim();
  if (user?.name?.trim()) return user.name.trim();
  if (user?.email) return user.email.split("@")[0] ?? "Employer";
  return "Employer";
}

/** Recalculates cached rating on freelancer_profiles from reviews.freelancerId (users.id). */
export async function updateFreelancerRating(freelancerUserId: number): Promise<void> {
  const [result] = await db
    .select({
      avg: sql<string>`AVG(${reviewsTable.rating})`,
      reviewCount: count(),
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.freelancerId, freelancerUserId));

  const avg = result?.avg ? parseFloat(result.avg) : null;
  const reviewCount = result?.reviewCount ?? 0;

  await db
    .update(freelancerProfilesTable)
    .set({
      averageRating: avg != null ? avg.toFixed(2) : null,
      reviewCount,
    })
    .where(eq(freelancerProfilesTable.userId, freelancerUserId));
}
