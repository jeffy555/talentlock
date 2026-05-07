import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usersTable, bookingsTable, freelancerProfilesTable,
  employerProfilesTable, reviewsTable,
} from "@workspace/db";
import { eq, and, gte, desc, count, avg, sum } from "drizzle-orm";

const router = Router();

async function resolveUser(clerkId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

function getMonthsBack(n: number) {
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - i);
    const start = new Date(d);
    const end = new Date(d);
    end.setMonth(end.getMonth() + 1);
    const label = start.toLocaleString("en-US", { month: "short", year: "numeric" });
    months.push({ label, start, end });
  }
  return months;
}

router.get("/analytics/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const months = getMonthsBack(6);
    const sixMonthsAgo = months[0].start;

    if (user.role === "freelancer") {
      const [profile] = await db.select().from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.userId, user.id)).limit(1);
      if (!profile) { res.json({ role: "freelancer", monthly: [], totals: {} }); return; }

      const allBookings = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.freelancerId, profile.id));

      const recentBookings = allBookings.filter(b => new Date(b.createdAt) >= sixMonthsAgo);

      const monthly = months.map(({ label, start, end }) => {
        const inMonth = recentBookings.filter(b => {
          const d = new Date(b.createdAt);
          return d >= start && d < end;
        });
        const earnings = inMonth
          .filter(b => b.status === "completed" && b.rate)
          .reduce((sum, b) => sum + parseFloat(b.rate!), 0);
        return { month: label, bookings: inMonth.length, earnings };
      });

      const [reviewAgg] = await db.select({ avg: avg(reviewsTable.rating), total: count() })
        .from(reviewsTable).where(eq(reviewsTable.revieweeId, user.id));

      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalEarnings = completedBookings.reduce((sum, b) => sum + (b.rate ? parseFloat(b.rate) : 0), 0);

      res.json({
        role: "freelancer",
        monthly,
        totals: {
          totalBookings: allBookings.length,
          activeBookings: allBookings.filter(b => b.status === "active").length,
          completedBookings: completedBookings.length,
          totalEarnings,
          averageRating: reviewAgg.avg ? parseFloat(reviewAgg.avg) : null,
          totalReviews: Number(reviewAgg.total),
        },
      });
    } else {
      const [emp] = await db.select().from(employerProfilesTable)
        .where(eq(employerProfilesTable.userId, user.id)).limit(1);
      if (!emp) { res.json({ role: "employer", monthly: [], totals: {} }); return; }

      const allBookings = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.employerId, emp.id));

      const recentBookings = allBookings.filter(b => new Date(b.createdAt) >= sixMonthsAgo);

      const monthly = months.map(({ label, start, end }) => {
        const inMonth = recentBookings.filter(b => {
          const d = new Date(b.createdAt);
          return d >= start && d < end;
        });
        const spend = inMonth
          .filter(b => b.status === "completed" && b.rate)
          .reduce((sum, b) => sum + parseFloat(b.rate!), 0);
        return { month: label, bookings: inMonth.length, spend };
      });

      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalSpend = completedBookings.reduce((sum, b) => sum + (b.rate ? parseFloat(b.rate) : 0), 0);
      const uniqueFreelancers = new Set(allBookings.map(b => b.freelancerId)).size;

      res.json({
        role: "employer",
        monthly,
        totals: {
          totalBookings: allBookings.length,
          activeBookings: allBookings.filter(b => b.status === "active").length,
          completedBookings: completedBookings.length,
          totalSpend,
          uniqueFreelancers,
        },
      });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to get analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
