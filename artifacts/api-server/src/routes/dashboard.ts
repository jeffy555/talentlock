import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable, agreementsTable, freelancerProfilesTable, employerProfilesTable, usersTable,
  jobRequirementsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    const role = user?.role ?? "freelancer";

    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const allFreelancers = await db.select().from(freelancerProfilesTable);
    const availableFreelancers = allFreelancers.filter(f => f.isAvailable).length;
    const allJobs = await db.select().from(jobRequirementsTable);
    const openJobRequirements = allJobs.filter(j => j.status === "open").length;

    let activeBookings = 0, completedBookings = 0, pendingAgreements = 0, signedAgreements = 0;
    let totalEarnings: number | null = null, totalSpent: number | null = null;

    if (freelancer) {
      const allBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.freelancerId, freelancer.id));
      activeBookings = allBookings.filter(b => b.status === "active").length;
      completedBookings = allBookings.filter(b => b.status === "completed").length;
      const allAgreements = await db.select().from(agreementsTable).where(eq(agreementsTable.freelancerId, freelancer.id));
      pendingAgreements = allAgreements.filter(a => a.status === "pending_signatures").length;
      signedAgreements = allAgreements.filter(a => a.status === "signed" || a.status === "active").length;
    } else if (employer) {
      const allBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.employerId, employer.id));
      activeBookings = allBookings.filter(b => b.status === "active").length;
      completedBookings = allBookings.filter(b => b.status === "completed").length;
      const allAgreements = await db.select().from(agreementsTable).where(eq(agreementsTable.employerId, employer.id));
      pendingAgreements = allAgreements.filter(a => a.status === "pending_signatures").length;
      signedAgreements = allAgreements.filter(a => a.status === "signed" || a.status === "active").length;
    }

    res.json({
      activeBookings,
      completedBookings,
      pendingAgreements,
      signedAgreements,
      totalEarnings,
      totalSpent,
      availableFreelancers,
      openJobRequirements,
      role,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/activity", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const activities: Array<{ id: string; type: string; description: string; timestamp: Date; metadata: object }> = [];

    if (freelancer) {
      const recentBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.freelancerId, freelancer.id)).limit(5);
      for (const b of recentBookings) {
        const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, b.employerId)).limit(1);
        activities.push({ id: `booking-${b.id}`, type: "booking_created", description: `New booking with ${e?.name ?? "an employer"} from ${b.startDate.toLocaleDateString()} to ${b.endDate.toLocaleDateString()}`, timestamp: b.createdAt, metadata: { bookingId: b.id, status: b.status } });
      }
      const recentAgreements = await db.select().from(agreementsTable).where(eq(agreementsTable.freelancerId, freelancer.id)).limit(5);
      for (const a of recentAgreements) {
        if (a.freelancerSignedAt || a.employerSignedAt) {
          activities.push({ id: `agreement-${a.id}`, type: "agreement_signed", description: `Agreement ${a.status === "signed" ? "fully executed" : "partially signed"}`, timestamp: a.updatedAt, metadata: { agreementId: a.id } });
        }
      }
    }

    if (employer) {
      const recentJobs = await db.select().from(jobRequirementsTable).where(eq(jobRequirementsTable.employerId, employer.id)).limit(5);
      for (const j of recentJobs) {
        activities.push({ id: `job-${j.id}`, type: "job_posted", description: `Posted job: ${j.title} (${j.fieldOfWork})`, timestamp: j.createdAt, metadata: { jobId: j.id } });
      }
      const recentBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.employerId, employer.id)).limit(5);
      for (const b of recentBookings) {
        activities.push({ id: `emp-booking-${b.id}`, type: "booking_created", description: `Booking ${b.status}`, timestamp: b.createdAt, metadata: { bookingId: b.id } });
      }
    }

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    res.json(activities.slice(0, 10));
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
