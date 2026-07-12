// agreements.status: draft | redlined | partially_signed | fully_signed

import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  agreementsTable, bookingsTable, freelancerProfilesTable, employerProfilesTable, usersTable,
  jobRequirementsTable,
} from "@workspace/db";
import { eq, or, and, SQL, count } from "drizzle-orm";
import {
  CreateAgreementBody,
  SignAgreementBody,
  ListAgreementsQueryParams,
  PatchAgreementsIdAcceptRedlineBody,
} from "@workspace/api-zod";
import OpenAI from "openai";
import { checkTokenQuota, getUserSubscription } from "../lib/subscriptionGating";
import { logTokenUsage } from "../lib/tokenLogger";
import {
  buildIndustrySection,
  buildCustomClausesSection,
  sanitiseClause,
  VALID_INDUSTRIES,
} from "../lib/industryTemplates";
import {
  createNotification,
  NotificationType,
  userIdFromEmployerProfileId,
  userIdFromFreelancerProfileId,
  freelancerNameForProfile,
  employerCompanyForProfile,
} from "../lib/createNotification";
import { logAudit } from "../lib/auditLogger";
import { sendNotificationEmailAsync } from "../lib/emailService";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseText } from "../lib/sanitise";
import { buildHealthScorePrompt, validateHealthScoreResponse } from "../lib/contractHealthUtils";
import {
  buildSummaryPrompt,
  validateSummaryResponse,
  AGREEMENT_SUMMARY_DISCLAIMER,
} from "../lib/agreementSummaryUtils";
import {
  resolveUserByClerkId,
  canAccessAgreement,
  agreementRoleForUser,
} from "../lib/accessControl";
import {
  type AgreementPdfData,
  preprocessAgreementContent,
  formatSignedAt,
  generateAgreementPdf,
  resolveSignatureImageUrl,
} from "../lib/agreementPdfUtils";
import {
  readCachedAgreementPdf,
  writeCachedAgreementPdf,
} from "../lib/agreementPdfCache";
import { lockFreelancerForActiveBooking } from "../lib/availabilityUtils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

async function activateBookingWithExclusivityLock(
  bookingId: number,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void; info?: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  await db.update(bookingsTable).set({ status: "active" }).where(eq(bookingsTable.id, bookingId));
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) {
    log.warn({ bookingId }, "booking not found after activating — exclusivity lock skipped");
    return;
  }
  await lockFreelancerForActiveBooking(db, booking, log);
}

const REDLINE_SYSTEM_PROMPT = `You are a legal contract reviewer for a freelance platform.
Review the following contract and identify up to 10 improvements.
Focus on: ambiguous language, missing specificity, unusually one-sided terms, and unclear obligations.

Return ONLY a JSON array — no preamble, no markdown fences:
[
  {
    "clauseNumber": "clause identifier or section number",
    "originalText": "exact quote from the contract",
    "suggestedText": "your proposed replacement",
    "reason": "plain English explanation, max 2 sentences"
  }
]

If fewer than 10 improvements are needed, return only the genuine ones — do not pad.
If no improvements are needed, return an empty array: []`;

const router = Router();

function agreementSignStatus(
  freelancerSignedAt: Date | null | undefined,
  employerSignedAt: Date | null | undefined,
): "partially_signed" | "fully_signed" {
  return freelancerSignedAt && employerSignedAt ? "fully_signed" : "partially_signed";
}

async function auditAgreementSigned(
  req: Request,
  agreementId: number,
  signerRole: string,
  agreement: { status: string | null },
  employerId: number,
  freelancerId: number,
): Promise<void> {
  const { userId: clerkId } = getAuth(req);
  let internalUserId: number | null = null;
  if (clerkId) {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    internalUserId = user?.id ?? null;
  }
  if (internalUserId == null) {
    internalUserId = signerRole === "employer"
      ? await userIdFromEmployerProfileId(employerId)
      : await userIdFromFreelancerProfileId(freelancerId);
  }
  logAudit(db, {
    userId: internalUserId,
    action: "agreement.signed",
    entityType: "agreement",
    entityId: String(agreementId),
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      signerRole,
      fullySignedAt: agreement.status === "fully_signed" ? new Date().toISOString() : null,
    },
  }).catch((err) => req.log.warn({ err }, "audit log write failed"));
}

router.get("/agreements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListAgreementsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const params = parsed.data;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const conditions: SQL[] = [];
    if (freelancer && employer) {
      conditions.push(or(eq(agreementsTable.freelancerId, freelancer.id), eq(agreementsTable.employerId, employer.id))!);
    } else if (freelancer) {
      conditions.push(eq(agreementsTable.freelancerId, freelancer.id));
    } else if (employer) {
      conditions.push(eq(agreementsTable.employerId, employer.id));
    }
    if (params.status) conditions.push(eq(agreementsTable.status, params.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, pageSize, offset } = parsePagination(params);

    const [rows, countResult] = await Promise.all([
      db.select().from(agreementsTable).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(agreementsTable).where(whereClause),
    ]);
    const enriched = await Promise.all(rows.map((row) => enrichAgreementForViewer(row, user?.role)));
    const total = Number(countResult[0]?.count ?? 0);
    res.json(paginatedResponse(enriched, total, page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list agreements");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, parsed.data.bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const quota = await checkTokenQuota(db, user.id);
    if (!quota.allowed) {
      res.status(402).json({
        error: "Monthly AI token limit reached",
        code: "TOKEN_LIMIT",
        planNeeded: quota.planNeeded,
      });
      return;
    }

    // Block agreement generation until rate negotiation is complete
    if (booking.negotiationStatus === "negotiating") {
      res.status(400).json({ error: "Rate negotiation must be completed before generating an agreement.", code: "NEGOTIATION_PENDING" }); return;
    }
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);

    const industry = parsed.data.industry ?? "general";
    if (!VALID_INDUSTRIES.includes(industry as (typeof VALID_INDUSTRIES)[number])) {
      res.status(400).json({ error: "Invalid industry value" });
      return;
    }

    const customClauses = parsed.data.customClauses ?? [];
    if (customClauses.length > 0) {
      const sub = await getUserSubscription(user.id);
      if (sub.plan.id !== "employer_enterprise") {
        res.status(403).json({
          error: "Custom clauses require Enterprise plan",
          code: "PLAN_LIMIT",
          planNeeded: "employer_enterprise",
        });
        return;
      }
      if (customClauses.length > 5) {
        res.status(400).json({ error: "Maximum 5 custom clauses allowed" });
        return;
      }
      for (const clause of customClauses) {
        if (clause.trim().length < 20) {
          res.status(400).json({ error: "Clause must be at least 20 characters", code: "CLAUSE_TOO_SHORT" });
          return;
        }
        if (clause.length > 500) {
          res.status(400).json({ error: "Clause must be 500 characters or fewer", code: "CLAUSE_TOO_LONG" });
          return;
        }
      }
    }

    const sanitised = customClauses.map(sanitiseClause);
    const industrySection = buildIndustrySection(industry);
    const customSection = buildCustomClausesSection(sanitised);

    const startDate = booking.startDate.toISOString().split("T")[0];
    const endDate = booking.endDate.toISOString().split("T")[0];
    const rateDisplay = booking.rate
      ? `${booking.paymentType === "hourly" ? `USD ${booking.rate} per hour` : booking.paymentType === "daily" ? `USD ${booking.rate} per day` : `USD ${booking.rate} fixed price`}`
      : "as mutually agreed in writing";

    // ── Duration-based clause parameters ────────────────────────────────────
    const durationDays = Math.max(1, Math.round(
      (booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)
    ));
    const durationWeeks = durationDays / 7;
    const durationMonths = durationDays / 30.44;

    // Human-readable duration label
    const durationLabel = durationDays < 14
      ? `${durationDays} day${durationDays > 1 ? "s" : ""}`
      : durationDays < 60
      ? `${Math.round(durationWeeks)} week${Math.round(durationWeeks) > 1 ? "s" : ""}`
      : `${Math.round(durationMonths)} month${Math.round(durationMonths) > 1 ? "s" : ""}`;

    // Termination notice: min of 25% of engagement or 14 days, but at least 3 days
    const noticeDays = Math.max(3, Math.min(14, Math.round(durationDays * 0.25)));
    const noticeLabel = noticeDays === 1 ? "one (1) calendar day" : `${noticeDays} calendar day${noticeDays > 1 ? "s" : ""}`;

    // Invoicing cadence
    const invoicingCadence = durationDays <= 14
      ? "at the completion of the engagement"
      : durationDays <= 31
      ? "weekly, submitted each Friday for work performed that week"
      : durationDays <= 90
      ? "bi-weekly (every two weeks), submitted on the 1st and 15th of each month or nearest business day"
      : "monthly, submitted on the last business day of each calendar month";

    // Late payment dispute notice window
    const disputeNoticeLabel = durationDays <= 14 ? "two (2) business days" : "five (5) business days";

    // Non-solicitation post-engagement period
    const nonSolicitMonths = durationMonths < 1 ? 1
      : durationMonths < 3 ? 3
      : durationMonths < 6 ? 6
      : durationMonths < 12 ? 9
      : 12;
    const nonSolicitLabel = nonSolicitMonths === 1 ? "one (1) month" : `${nonSolicitMonths} months`;

    // Liability cap: expressed as equivalent period of fees
    const liabilityCapMonths = durationMonths < 1 ? "the total Fees paid or payable under this Agreement"
      : durationMonths < 2 ? "the total Fees paid or payable under this Agreement"
      : durationMonths < 4 ? "the total Fees paid or payable in the two (2) months preceding the event giving rise to the claim"
      : "the total Fees paid or payable in the three (3) months preceding the event giving rise to the claim";

    // Force majeure termination trigger
    const fmDays = durationDays < 14 ? 5 : durationDays < 30 ? 10 : 30;
    const fmLabel = `${fmDays} consecutive calendar day${fmDays > 1 ? "s" : ""}`;

    // Confidentiality survival
    const confSurvivalYears = durationMonths < 3 ? 2 : durationMonths < 12 ? 3 : 5;
    const confSurvivalLabel = `${confSurvivalYears} year${confSurvivalYears > 1 ? "s" : ""}`;
    // ── End duration parameters ──────────────────────────────────────────────

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a senior commercial attorney drafting a binding freelance services agreement on behalf of TalentLock, a secure freelancer booking platform. You write precise, enforceable legal contracts — not templates, not samples. Every clause must contain complete, substantive legal language. Do NOT include placeholder text such as "[insert…]", "TBD", or "to be agreed". Where jurisdiction-specific details are unavailable, default to the laws of the State of Delaware, USA, and US federal law. Write in formal legal English.${industrySection}${customSection}`,
        },
        {
          role: "user",
          content: `Draft a complete, binding FREELANCE SERVICES AGREEMENT for the following engagement. Include every numbered clause and sub-clause listed. Do not summarise or abbreviate any clause. Use proper legal numbering (1., 1.1, 1.2, 2., 2.1 … etc.).

═══════════════════════════════════════════════
ENGAGEMENT PARTICULARS
═══════════════════════════════════════════════
Client / Employer     : ${employer?.companyName ?? "The Client"} (${employer?.industry ?? "General"} industry)
Service Provider      : ${freelancer?.name ?? "The Freelancer"}, ${freelancer?.fieldOfWork ?? "Professional Services"}
Core Competencies     : ${freelancer?.skills?.join(", ") ?? "as described in Schedule A"}
Engagement Start      : ${startDate}
Engagement End        : ${endDate}
Engagement Duration   : ${durationLabel} (${durationDays} calendar days)
Compensation Type     : ${booking.paymentType}
Compensation Rate     : ${rateDisplay}
Platform              : TalentLock (talentlock.app)
─────────────────────────────────────────────
PRE-COMPUTED CLAUSE PARAMETERS (use these exact values — do not substitute your own):
Invoicing cadence     : ${invoicingCadence}
Termination notice    : ${noticeLabel}
Dispute hold notice   : ${disputeNoticeLabel} of invoice receipt
Liability cap         : ${liabilityCapMonths}
Non-solicitation      : ${nonSolicitLabel} post-engagement
Force majeure trigger : ${fmLabel}
Confidentiality survival: ${confSurvivalLabel} post-termination
═══════════════════════════════════════════════

Generate the agreement using EXACTLY this structure. Every sub-clause must contain complete substantive legal text — no placeholders, no bullets in place of prose:

FREELANCE SERVICES AGREEMENT

[Open with a formal preamble: date of agreement, full legal names/designations of both parties, recitals establishing the commercial background, and a statement that the parties agree as follows.]

1. DEFINITIONS AND INTERPRETATION
   1.1 Define: Agreement, Engagement Period, Services, Deliverables, Confidential Information, Intellectual Property Rights, Work Product, Fees, Effective Date, Force Majeure Event, TalentLock Platform.
   1.2 Interpretation rules (singular/plural, headings, "includes", statutory references).

2. ENGAGEMENT AND SCOPE OF SERVICES
   2.1 The Client hereby engages the Service Provider as an independent contractor to perform the services within the field of ${freelancer?.fieldOfWork ?? "professional services"}, utilising skills including ${freelancer?.skills?.slice(0, 5).join(", ") ?? "as agreed"}, for the Engagement Period commencing ${startDate} and ending ${endDate}.
   2.2 Detailed description of deliverables and performance standards.
   2.3 Change of scope — written change order requirement.
   2.4 Service Provider's obligation to provide own tools/equipment.

3. INDEPENDENT CONTRACTOR STATUS
   3.1 Explicit statement that the Service Provider is an independent contractor, not an employee, agent, partner, or joint-venture partner of the Client.
   3.2 No entitlement to employee benefits, social security, workers' compensation, or unemployment insurance.
   3.3 Service Provider's sole responsibility for all applicable taxes, levies, and national insurance contributions on Fees received.
   3.4 Service Provider's authority: no authority to bind the Client contractually.

4. COMPENSATION AND PAYMENT TERMS
   4.1 The Client shall pay the Service Provider ${rateDisplay} for the Services rendered during the ${durationLabel} engagement.
   4.2 Invoicing cadence: Service Provider shall submit invoices ${invoicingCadence}, each invoice containing invoice number, description of services performed, period covered, and bank or payment details.
   4.3 Payment due within fourteen (14) calendar days of receipt of a valid, undisputed invoice.
   4.4 Late payment interest at the rate of 1.5% per month (or the maximum rate permitted by applicable law, whichever is lower) shall accrue on overdue amounts from the due date until payment in full.
   4.5 Expense reimbursement: pre-approved, documented out-of-pocket expenses only, submitted with receipts alongside the relevant invoice.
   4.6 Withholding: Client may withhold payment only for documented, good-faith disputes notified in writing within ${disputeNoticeLabel} of invoice receipt.

5. INTELLECTUAL PROPERTY AND WORK PRODUCT
   5.1 Work-for-hire: All Work Product created by the Service Provider in the course of performing the Services shall, to the maximum extent permitted by law, be deemed a "work made for hire" for the Client under applicable copyright law.
   5.2 Assignment: To the extent any Work Product does not qualify as a work made for hire, the Service Provider hereby irrevocably assigns, transfers, and conveys to the Client all right, title, and interest in and to such Work Product, including all Intellectual Property Rights therein, in perpetuity and throughout the universe.
   5.3 Moral rights waiver: The Service Provider waives, to the fullest extent permitted by law, all moral rights in the Work Product.
   5.4 Pre-existing IP: The Service Provider retains ownership of all pre-existing tools, methodologies, frameworks, and know-how. The Service Provider grants the Client a non-exclusive, royalty-free, perpetual licence to use such pre-existing IP solely to the extent incorporated in the Deliverables.
   5.5 Service Provider warrants that the Work Product shall not infringe any third-party Intellectual Property Rights.

6. EXCLUSIVITY
   6.1 During the Engagement Period, the Service Provider shall not accept, solicit, or perform any engagement, contract, or project for any person or entity that is in direct competition with the Client's core business within the same industry vertical, without the Client's prior written consent.
   6.2 The TalentLock Platform shall record and enforce this exclusivity by issuing a "LOCKED IN" status badge to the Service Provider's profile for the duration of the Engagement Period.
   6.3 Breach of this clause shall entitle the Client to seek injunctive relief in addition to damages and to terminate this Agreement immediately pursuant to Clause 10.2.

7. CONFIDENTIALITY AND DATA PROTECTION
   7.1 Definition of Confidential Information and its broad scope (business data, technical data, personnel data, financial data, trade secrets, client lists, and any information marked confidential or which a reasonable person would consider confidential).
   7.2 Non-disclosure obligation: The Service Provider shall not, during or after the Engagement Period, disclose, publish, or permit the disclosure of any Confidential Information to any third party without the prior written consent of the Client.
   7.3 Use restriction: Confidential Information shall be used solely to perform the Services.
   7.4 Standard of care: at least the same degree of care the Service Provider uses to protect its own confidential information, but no less than reasonable care.
   7.5 Carve-outs: information that is publicly known (not through breach), independently developed, received from a third party without restriction, or required to be disclosed by law (with prompt prior written notice to the Client where legally permissible).
   7.6 Data protection compliance: Each party shall comply with all applicable data protection and privacy laws (including, where applicable, GDPR, CCPA, and equivalent legislation) with respect to any personal data processed in connection with this Agreement.
   7.7 Return or destruction of Confidential Information upon termination or request.
   7.8 Survival: This clause shall survive termination for a period of ${confSurvivalLabel}.

8. REPRESENTATIONS AND WARRANTIES
   8.1 Each party represents and warrants that: (a) it has full legal capacity and authority to enter into this Agreement; (b) this Agreement constitutes a legal, valid, and binding obligation; (c) entering into this Agreement does not violate any other agreement or obligation.
   8.2 Service Provider additionally warrants: (a) the Services will be performed with professional skill and care; (b) the Work Product will be original and free from material defects; (c) the Service Provider holds all licences and permits required to perform the Services; (d) the Service Provider's identity, qualifications, and compliance documents have been verified through TalentLock's AI verification system prior to the Effective Date.

9. INDEMNIFICATION
   9.1 Service Provider indemnification: The Service Provider shall indemnify, defend, and hold harmless the Client and its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) the Service Provider's breach of this Agreement; (b) the Service Provider's gross negligence or wilful misconduct; (c) any claim that the Work Product infringes a third party's Intellectual Property Rights.
   9.2 Client indemnification: The Client shall indemnify, defend, and hold harmless the Service Provider from and against any claims arising out of the Client's material breach of this Agreement or the Client's gross negligence or wilful misconduct.
   9.3 Indemnification procedure: The indemnified party shall (a) promptly notify the indemnifying party in writing; (b) grant control of the defence to the indemnifying party; and (c) provide reasonable cooperation at the indemnifying party's expense.

10. LIMITATION OF LIABILITY
    10.1 Neither party shall be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including loss of profits, loss of revenue, loss of data, or loss of goodwill, even if advised of the possibility of such damages.
    10.2 Each party's total cumulative liability under or in connection with this Agreement shall not exceed ${liabilityCapMonths}.
    10.3 The foregoing limitations shall not apply to: (a) either party's fraud or fraudulent misrepresentation; (b) death or personal injury caused by negligence; (c) a party's wilful misconduct; or (d) the Service Provider's obligations under Clause 6 (Exclusivity) or Clause 7 (Confidentiality).

11. TERM AND TERMINATION
    11.1 This Agreement shall commence on ${startDate} and, unless earlier terminated pursuant to this Clause, shall expire on ${endDate}.
    11.2 Termination for convenience: Either party may terminate this Agreement upon not less than ${noticeLabel}' prior written notice to the other party.
    11.3 Termination for cause: Either party may terminate this Agreement immediately upon written notice if the other party: (a) commits a material breach that is incapable of remedy, or that remains unremedied for ${noticeLabel} after written notice; (b) becomes insolvent or makes an assignment for the benefit of creditors; (c) is the subject of bankruptcy, administration, or liquidation proceedings.
    11.4 Consequences of termination: (a) Client shall pay all Fees due for Services properly rendered up to the termination date; (b) Service Provider shall promptly deliver all Work Product and Deliverables in their current state; (c) each party shall return or destroy the other party's Confidential Information; (d) the Service Provider's exclusivity obligation shall cease.
    11.5 Survival: Clauses 5 (IP), 7 (Confidentiality), 8 (Representations), 9 (Indemnification), 10 (Limitation of Liability), 12 (Non-Solicitation), 14 (Dispute Resolution), and 15 (General Provisions) shall survive termination.

12. NON-SOLICITATION
    12.1 During the Engagement Period and for ${nonSolicitLabel} thereafter, the Service Provider shall not, directly or indirectly, solicit or induce any employee, contractor, or consultant of the Client to terminate their relationship with the Client.
    12.2 During the Engagement Period and for ${nonSolicitLabel} thereafter, neither party shall solicit the other party's clients or customers introduced through TalentLock without the prior written consent of the other party.

13. FORCE MAJEURE
    13.1 Neither party shall be in breach of or liable under this Agreement for any failure or delay in performance caused by a Force Majeure Event (including acts of God, war, terrorism, pandemic, government action, natural disaster, or failure of third-party infrastructure) provided the affected party: (a) gives prompt written notice to the other party; (b) takes all reasonable steps to mitigate the effects; and (c) resumes performance as soon as reasonably practicable.
    13.2 If a Force Majeure Event continues for more than ${fmLabel}, either party may terminate this Agreement on written notice without liability (other than for Fees due for work already performed).

14. DISPUTE RESOLUTION AND GOVERNING LAW
    14.1 Good-faith negotiation: In the event of any dispute, the parties shall first attempt to resolve the matter through good-faith negotiations for a period of twenty-one (21) days from the date of written notice of the dispute.
    14.2 Mediation: If the dispute is not resolved through negotiation, either party may refer the dispute to non-binding mediation administered by a mutually agreed mediator, costs shared equally.
    14.3 Arbitration: If mediation fails or is not pursued within sixty (60) days of the dispute notice, the dispute shall be finally resolved by binding arbitration under the rules of the American Arbitration Association (AAA), conducted before a single arbitrator in Delaware, USA, in the English language. The arbitrator's award shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.
    14.4 Governing Law: This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, USA, without regard to its conflict-of-law provisions.
    14.5 Injunctive relief: Notwithstanding the foregoing, either party may seek interim or injunctive relief from a court of competent jurisdiction to prevent irreparable harm.

15. GENERAL PROVISIONS
    15.1 Entire Agreement: This Agreement, together with any schedules or addenda, constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior negotiations, representations, warranties, and understandings.
    15.2 Amendments: No amendment to this Agreement shall be effective unless in writing and signed by authorised representatives of both parties.
    15.3 Waiver: No failure or delay by a party in exercising any right under this Agreement shall operate as a waiver of that right.
    15.4 Severability: If any provision is found invalid or unenforceable, that provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall continue in full force and effect.
    15.5 Assignment: The Service Provider may not assign or subcontract any obligations under this Agreement without the Client's prior written consent. The Client may assign this Agreement in connection with a merger, acquisition, or sale of all or substantially all of its assets.
    15.6 Notices: All formal notices must be in writing and delivered by email with read receipt or by registered mail to the addresses on record with TalentLock.
    15.7 Counterparts and Electronic Signatures: This Agreement may be executed in counterparts, each of which shall be deemed an original. Electronic signatures applied through the TalentLock Platform shall have the same legal effect as handwritten signatures pursuant to applicable e-signature law (including the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Uniform Electronic Transactions Act (UETA)).
    15.8 Third-Party Rights: Nothing in this Agreement confers any right or remedy on any person other than the parties and their permitted successors and assigns.
    15.9 Relationship of Parties: The parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, agency, franchise, or employment relationship.

16. PLATFORM VERIFICATION AND COMPLIANCE
    16.1 The Service Provider acknowledges that TalentLock's AI-powered verification system has reviewed and authenticated the Service Provider's identity documents, professional qualifications, and compliance certifications prior to the Effective Date. This Agreement is contingent upon successful verification and shall be void if verification is subsequently found to be fraudulent.
    16.2 Both parties consent to TalentLock recording the digital signatures, timestamps, and IP addresses associated with execution of this Agreement for audit and legal purposes.

═══════════════════════════════════════════════
EXECUTION
═══════════════════════════════════════════════

IN WITNESS WHEREOF, the parties have executed this Freelance Services Agreement as of the date first written above.

FOR AND ON BEHALF OF THE CLIENT
Company: ${employer?.companyName ?? "The Client"}
Authorised Signatory: ___________________________
Printed Name:         ___________________________
Title / Position:     ___________________________
Date:                 ___________________________
Digital Signature (TalentLock): [Pending]

FOR AND ON BEHALF OF THE SERVICE PROVIDER
Name:                 ${freelancer?.name ?? "The Service Provider"}
Signature:            ___________________________
Printed Name:         ___________________________
Date:                 ___________________________
Digital Signature (TalentLock): [Pending]

───────────────────────────────────────────────
This agreement was generated and is administered through the TalentLock Platform. Both digital signatures are cryptographically timestamped upon execution.
───────────────────────────────────────────────`,
        },
      ],
      max_completion_tokens: 4096,
    });

    if (completion.usage) {
      await logTokenUsage(db, user.id, "agreement_generation", completion.usage);
    } else {
      req.log.warn({ userId: user.id, feature: "agreement_generation" }, "token usage unavailable on response");
    }

    const content = completion.choices[0]?.message?.content ?? "Agreement content could not be generated.";
    const [agreement] = await db.insert(agreementsTable)
      .values({
        bookingId: booking.id,
        freelancerId: booking.freelancerId,
        employerId: booking.employerId,
        content,
        status: "draft",
      })
      .returning();

    const readyMsg = "An agreement is ready for your signature";
    const employerUserId = await userIdFromEmployerProfileId(booking.employerId);
    const freelancerUserId = await userIdFromFreelancerProfileId(booking.freelancerId);
    for (const userId of [employerUserId, freelancerUserId]) {
      if (userId) {
        createNotification(db, {
          userId,
          type: NotificationType.AGREEMENT_READY,
          entityType: "agreement",
          entityId: agreement.id,
          message: readyMsg,
        }).catch((err) => req.log.warn({ err, agreementId: agreement.id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, userId, "Agreement ready on TalentLock", readyMsg,
          `/agreements/${agreement.id}`, req.log,
        );
      }
    }

    res.status(201).json(await enrichAgreementForViewer(agreement, user.role));
  } catch (err) {
    req.log.error({ err }, "Failed to create agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agreements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessAgreement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Agreement not found" : "Forbidden" });
      return;
    }
    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }
    res.json(await enrichAgreementForViewer(agreement, user.role));
  } catch (err) {
    req.log.error({ err }, "Failed to get agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements/:id/redline", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can request contract redlining" });
      return;
    }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    if (agreement.freelancerSignedAt || agreement.employerSignedAt) {
      res.status(409).json({
        error: "Cannot redline a partially or fully signed agreement",
        code: "AGREEMENT_SIGNED",
      });
      return;
    }

    const sub = await getUserSubscription(user.id);
    if (!["employer_growth", "employer_enterprise"].includes(sub.plan.id)) {
      res.status(402).json({
        error: "Contract redlining requires Growth plan or higher",
        code: "PLAN_LIMIT",
        planNeeded: "employer_growth",
      });
      return;
    }

    const quota = await checkTokenQuota(db, user.id);
    if (!quota.allowed) {
      res.status(402).json({
        error: "Monthly AI token limit reached",
        code: "TOKEN_LIMIT",
        planNeeded: quota.planNeeded,
      });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: REDLINE_SYSTEM_PROMPT },
        { role: "user", content: agreement.content },
      ],
      max_completion_tokens: 2000,
    });

    if (completion.usage) {
      await logTokenUsage(db, user.id, "contract_redlining", completion.usage);
    } else {
      req.log.warn({ userId: user.id, feature: "contract_redlining" }, "token usage unavailable on response");
    }

    const rawContent = completion.choices[0]?.message?.content ?? "[]";
    try {
      const suggestions = JSON.parse(rawContent);
      if (!Array.isArray(suggestions)) throw new Error("Not an array");
      res.status(200).json({ suggestions });
    } catch {
      req.log.warn({ agreementId: id }, "redline JSON parse failed");
      res.status(200).json({ suggestions: [], parseError: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to redline agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/agreements/:id/accept-redline", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PatchAgreementsIdAcceptRedlineBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can accept redline changes" });
      return;
    }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    if (agreement.freelancerSignedAt || agreement.employerSignedAt) {
      res.status(409).json({
        error: "Cannot redline a partially or fully signed agreement",
        code: "AGREEMENT_SIGNED",
      });
      return;
    }

    const { newContent } = parsed.data;
    await db.transaction(async (tx) => {
      await tx.update(agreementsTable)
        .set({ content: newContent, updatedAt: new Date() })
        .where(eq(agreementsTable.id, id));
      await tx.update(agreementsTable)
        .set({
          freelancerSignedAt: null,
          employerSignedAt: null,
          status: "redlined",
          updatedAt: new Date(),
        })
        .where(eq(agreementsTable.id, id));
    });

    // Invalidate health score and freelancer summary caches — content changed by redline acceptance
    await db.update(agreementsTable)
      .set({
        healthScore: null,
        healthScoreDetail: null,
        healthScoredAt: null,
        freelancerSummary: null,
        freelancerSummaryScoredAt: null,
      })
      .where(eq(agreementsTable.id, id));

    res.status(200).json({ success: true, status: "redlined" });
  } catch (err) {
    req.log.error({ err }, "Failed to accept redline");
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
 * POST /agreements/:id/health-score — codebase inspection (Task 1.1):
 * - healthScore / healthScoreDetail / healthScoredAt: added to agreementsTable (nullable)
 * - Party columns: direct employerId + freelancerId on agreements (no booking join for auth)
 * - content column: agreementsTable.content
 * - accept-redline: db.transaction then cache invalidation outside transaction
 * - contract_health_score: TokenFeature in tokenLogger.ts
 */
router.post("/agreements/:id/health-score", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const forceRefresh = req.query.force === "true";

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can score contract health" });
      return;
    }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    const access = await canAccessAgreement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Agreement not found" : "Forbidden" });
      return;
    }

    if (
      !forceRefresh &&
      agreement.healthScore !== null &&
      agreement.healthScoreDetail !== null &&
      agreement.healthScoredAt !== null
    ) {
      const detail = agreement.healthScoreDetail as Record<string, unknown>;
      res.status(200).json({
        parseError: false,
        cached: true,
        truncated: false,
        totalScore: agreement.healthScore,
        ...detail,
        healthScoredAt: agreement.healthScoredAt.toISOString(),
      });
      return;
    }

    const quota = await checkTokenQuota(db, user.id);
    if (!quota.allowed) {
      res.status(402).json({
        error: "Monthly AI token limit reached",
        code: "TOKEN_LIMIT",
        planNeeded: quota.planNeeded,
      });
      return;
    }

    let fieldOfWork = "general";
    let jobTitle = "";
    try {
      const [booking] = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.id, agreement.bookingId)).limit(1);
      if (booking?.freelancerId) {
        const [fp] = await db.select().from(freelancerProfilesTable)
          .where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
        if (fp?.fieldOfWork) fieldOfWork = fp.fieldOfWork;
      }
      if (booking?.jobRequirementId) {
        const [jr] = await db.select().from(jobRequirementsTable)
          .where(eq(jobRequirementsTable.id, booking.jobRequirementId)).limit(1);
        if (jr?.title) jobTitle = jr.title;
      }
    } catch {
      req.log.warn({ agreementId: id }, "health score field context resolution failed");
    }

    const content = agreement.content ?? "";
    const truncated = content.length > 8000;
    const prompt = buildHealthScorePrompt(content, fieldOfWork, jobTitle, truncated);

    let responseText = "";
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = completion.choices[0]?.message?.content ?? "";
      usage = completion.usage ?? usage;
    } catch (err) {
      req.log.error({ err, agreementId: id }, "health score OpenAI call failed");
      res.status(500).json({ error: "AI service unavailable. Please try again." });
      return;
    }

    let parsed: unknown;
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
      if (!validateHealthScoreResponse(parsed)) throw new Error("invalid shape");
    } catch {
      req.log.warn({ agreementId: id }, "health score JSON parse failed");
      res.status(200).json({ parseError: true, score: null, dimensions: null });
      return;
    }

    logTokenUsage(db, user.id, "contract_health_score", usage)
      .catch((err) => req.log.warn({ err }, "token usage log failed"));

    const scored = parsed as { totalScore: number; dimensions: unknown; summary: string };
    const healthScoredAt = new Date();
    await db.update(agreementsTable)
      .set({
        healthScore: scored.totalScore,
        healthScoreDetail: {
          dimensions: scored.dimensions,
          summary: scored.summary,
        },
        healthScoredAt,
      })
      .where(eq(agreementsTable.id, id));

    res.status(200).json({
      parseError: false,
      cached: false,
      truncated,
      totalScore: scored.totalScore,
      dimensions: scored.dimensions,
      summary: scored.summary,
      healthScoredAt: healthScoredAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to score agreement health");
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
 * POST /agreements/:id/summarise — codebase inspection (Task 1.1):
 * - freelancerSummary / freelancerSummaryScoredAt: added to agreementsTable (nullable)
 * - Party columns: direct employerId + freelancerId on agreements (no booking join for auth)
 * - content column: agreementsTable.content
 * - accept-redline: db.transaction then cache invalidation outside transaction (health + summary)
 * - agreement_summary: TokenFeature in tokenLogger.ts
 * - Auth: canAccessAgreement(user.id, id) after freelancer role guard
 */
router.post("/agreements/:id/summarise", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const forceRefresh = req.query.force === "true";

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "freelancer") {
      res.status(403).json({ error: "This feature is for freelancers only" });
      return;
    }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    const access = await canAccessAgreement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Agreement not found" : "Forbidden" });
      return;
    }

    if (
      !forceRefresh &&
      agreement.freelancerSummary !== null &&
      agreement.freelancerSummaryScoredAt !== null
    ) {
      const summaryData = agreement.freelancerSummary as Record<string, unknown>;
      res.status(200).json({
        parseError: false,
        cached: true,
        truncated: false,
        freelancerSummaryScoredAt: agreement.freelancerSummaryScoredAt.toISOString(),
        ...summaryData,
        disclaimer: AGREEMENT_SUMMARY_DISCLAIMER,
      });
      return;
    }

    const content = agreement.content ?? "";
    const truncated = content.length > 8000;
    const prompt = buildSummaryPrompt(content, truncated);

    let responseText = "";
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      responseText = completion.choices[0]?.message?.content ?? "";
      usage = completion.usage ?? usage;
    } catch (err) {
      req.log.error({ err, agreementId: id }, "agreement summary OpenAI call failed");
      res.status(500).json({ error: "AI service unavailable. Please try again." });
      return;
    }

    let parsed: unknown;
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
      if (!validateSummaryResponse(parsed)) throw new Error("invalid shape");
    } catch {
      req.log.warn({ agreementId: id }, "agreement summary JSON parse failed");
      res.status(200).json({ parseError: true, summary: null });
      return;
    }

    logTokenUsage(db, user.id, "agreement_summary", usage)
      .catch((err) => req.log.warn({ err }, "token usage log failed"));

    const summaryData = parsed as Record<string, unknown>;
    const freelancerSummaryScoredAt = new Date();
    await db.update(agreementsTable)
      .set({
        freelancerSummary: summaryData,
        freelancerSummaryScoredAt,
      })
      .where(eq(agreementsTable.id, id));

    res.status(200).json({
      parseError: false,
      cached: false,
      truncated,
      freelancerSummaryScoredAt: freelancerSummaryScoredAt.toISOString(),
      ...summaryData,
      disclaimer: AGREEMENT_SUMMARY_DISCLAIMER,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to summarise agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements/:id/sign", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SignAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const signatureName = (parsed.data as any).signatureName as string | undefined;
  const signatureImageUrl = (parsed.data as any).signatureImageUrl as string | undefined;
  if (!signatureName?.trim() && !signatureImageUrl?.trim()) {
    res.status(400).json({ error: "Either a signature name or a signature image is required" }); return;
  }

  const cleanSignatureName = signatureName?.trim() ? sanitiseText(signatureName.trim()) : null;

  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    const derivedRole = await agreementRoleForUser(user.id, id);
    if (!derivedRole) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (parsed.data.role && parsed.data.role !== derivedRole) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const now = new Date();
    const updates: Record<string, unknown> = {};

    if (derivedRole === "employer") {
      if (agreement.employerSignedAt) { res.status(400).json({ error: "Employer has already signed" }); return; }
      updates.employerSignedAt = now;
      updates.employerSignatureName = cleanSignatureName;
      updates.employerSignatureImageUrl = signatureImageUrl?.trim() ?? null;
    } else if (derivedRole === "freelancer") {
      if (!agreement.employerSignedAt) {
        res.status(400).json({ error: "Employer must sign first before the freelancer can sign" }); return;
      }
      if (agreement.freelancerSignedAt) { res.status(400).json({ error: "Freelancer has already signed" }); return; }
      updates.freelancerSignedAt = now;
      updates.freelancerSignatureName = cleanSignatureName;
      updates.freelancerSignatureImageUrl = signatureImageUrl?.trim() ?? null;
    } else {
      res.status(400).json({ error: "Invalid role" }); return;
    }

    const newStatus = agreementSignStatus(
      derivedRole === "freelancer" ? now : agreement.freelancerSignedAt,
      derivedRole === "employer" ? now : agreement.employerSignedAt,
    );
    updates.status = newStatus;

    const [updated] = await db.update(agreementsTable)
      .set(updates as any)
      .where(eq(agreementsTable.id, id))
      .returning();

    // Auto-sign on behalf of demo freelancers — they use fake clerkIds and cannot
    // log in to sign themselves, so we complete the agreement automatically.
    if (derivedRole === "employer" && !updated.freelancerSignedAt) {
      const [freelancerProfile] = await db
        .select({ name: freelancerProfilesTable.name, clerkId: freelancerProfilesTable.clerkId })
        .from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.id, updated.freelancerId))
        .limit(1);

      if (freelancerProfile?.clerkId?.startsWith("demo_")) {
        const [autoSigned] = await db.update(agreementsTable)
          .set({
            freelancerSignedAt: new Date(),
            freelancerSignatureName: freelancerProfile.name,
            status: "fully_signed",
          })
          .where(eq(agreementsTable.id, id))
          .returning();
        await activateBookingWithExclusivityLock(updated.bookingId, req.log);
        req.log.info({ agreementId: id, freelancerClerkId: freelancerProfile.clerkId }, "Auto-signed agreement on behalf of demo freelancer");
        const fullMsg = "Agreement fully signed — your document is ready to download";
        const empUid = await userIdFromEmployerProfileId(autoSigned.employerId);
        const flUid = await userIdFromFreelancerProfileId(autoSigned.freelancerId);
        for (const userId of [empUid, flUid]) {
          if (userId) {
            createNotification(db, {
              userId,
              type: NotificationType.AGREEMENT_FULLY_SIGNED,
              entityType: "agreement",
              entityId: id,
              message: fullMsg,
            }).catch((err) => req.log.warn({ err, agreementId: id }, "notification write failed"));
            sendNotificationEmailAsync(
              db, userId, "Agreement fully signed on TalentLock", fullMsg,
              `/agreements/${id}`, req.log,
            );
          }
        }
        await auditAgreementSigned(req, id, derivedRole, autoSigned, autoSigned.employerId, autoSigned.freelancerId);
        res.json(await enrichAgreementForViewer(autoSigned, user.role));
        return;
      }
    }

    const signerName = derivedRole === "employer"
      ? await employerCompanyForProfile(updated.employerId)
      : await freelancerNameForProfile(updated.freelancerId);

    if (updated.freelancerSignedAt && updated.employerSignedAt) {
      const [fullySignedAgreement] = await db.update(agreementsTable)
        .set({ status: "fully_signed" })
        .where(eq(agreementsTable.id, id))
        .returning();
      await activateBookingWithExclusivityLock(updated.bookingId, req.log);
      const fullMsg = "Agreement fully signed — your document is ready to download";
      const empUid = await userIdFromEmployerProfileId(fullySignedAgreement.employerId);
      const flUid = await userIdFromFreelancerProfileId(fullySignedAgreement.freelancerId);
      for (const userId of [empUid, flUid]) {
        if (userId) {
          createNotification(db, {
            userId,
            type: NotificationType.AGREEMENT_FULLY_SIGNED,
            entityType: "agreement",
            entityId: id,
            message: fullMsg,
          }).catch((err) => req.log.warn({ err, agreementId: id }, "notification write failed"));
          sendNotificationEmailAsync(
            db, userId, "Agreement fully signed on TalentLock", fullMsg,
            `/agreements/${id}`, req.log,
          );
        }
      }
      await auditAgreementSigned(req, id, derivedRole, fullySignedAgreement, fullySignedAgreement.employerId, fullySignedAgreement.freelancerId);
      res.json(await enrichAgreementForViewer(fullySignedAgreement, user.role));
    } else {
      const otherUserId = derivedRole === "employer"
        ? await userIdFromFreelancerProfileId(updated.freelancerId)
        : await userIdFromEmployerProfileId(updated.employerId);
      if (otherUserId) {
        const signedMsg = `${signerName} signed the agreement`;
        createNotification(db, {
          userId: otherUserId,
          type: NotificationType.AGREEMENT_SIGNED,
          entityType: "agreement",
          entityId: id,
          message: signedMsg,
        }).catch((err) => req.log.warn({ err, agreementId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, otherUserId, "Agreement signed on TalentLock", signedMsg,
          `/agreements/${id}`, req.log,
        );
      }
      await auditAgreementSigned(req, id, derivedRole, updated, updated.employerId, updated.freelancerId);
      res.json(await enrichAgreementForViewer(updated, user.role));
    }
  } catch (err) {
    req.log.error({ err }, "Failed to sign agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agreements/:id/download", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessAgreement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Agreement not found" : "Forbidden" });
      return;
    }

    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    if (agreement.status !== "fully_signed") {
      res.status(403).json({
        error: "Agreement must be fully signed before downloading",
        code: "NOT_FULLY_SIGNED",
      });
      return;
    }

    const role = await agreementRoleForUser(user.id, id);
    if (role !== "freelancer" && role !== "employer") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    let pdfBuffer = await readCachedAgreementPdf(id);
    const cacheHit = pdfBuffer != null;

    if (!pdfBuffer) {
      const [freelancerProfile] = await db
        .select()
        .from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.id, agreement.freelancerId))
        .limit(1);
      const [employerProfile] = await db
        .select()
        .from(employerProfilesTable)
        .where(eq(employerProfilesTable.id, agreement.employerId))
        .limit(1);

      const [employerUser, freelancerUser] = await Promise.all([
        employerProfile
          ? db.select().from(usersTable).where(eq(usersTable.id, employerProfile.userId)).limit(1).then((r) => r[0])
          : Promise.resolve(undefined),
        freelancerProfile
          ? db.select().from(usersTable).where(eq(usersTable.id, freelancerProfile.userId)).limit(1).then((r) => r[0])
          : Promise.resolve(undefined),
      ]);

      const [employerSignatureUrl, freelancerSignatureUrl] = await Promise.all([
        resolveSignatureImageUrl(agreement.employerSignatureImageUrl),
        resolveSignatureImageUrl(agreement.freelancerSignatureImageUrl),
      ]);

      const pdfData: AgreementPdfData = {
        agreementId: String(id),
        generatedAt: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        employerDisplayName: employerUser?.name ?? employerProfile?.companyName ?? "—",
        employerCompany: employerProfile?.companyName ?? "",
        employerSignatureUrl,
        employerTypedName: agreement.employerSignatureName,
        employerSignedAt: formatSignedAt(agreement.employerSignedAt),
        freelancerDisplayName: freelancerProfile?.name ?? freelancerUser?.name ?? "—",
        freelancerField: freelancerProfile?.fieldOfWork ?? "",
        freelancerSignatureUrl,
        freelancerTypedName: agreement.freelancerSignatureName,
        freelancerSignedAt: formatSignedAt(agreement.freelancerSignedAt),
        contentParagraphs: preprocessAgreementContent(agreement.content ?? ""),
      };

      pdfBuffer = await generateAgreementPdf(pdfData);

      writeCachedAgreementPdf(id, pdfBuffer).catch((err) =>
        req.log.warn({ err, agreementId: id }, "PDF GCS cache upload failed"),
      );
    }

    logAudit(db, {
      userId: user.id,
      action: "agreement.downloaded",
      entityType: "agreement",
      entityId: String(id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { cacheHit },
    }).catch((err) => req.log.warn({ err }, "audit log write failed"));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="TalentLock-Agreement-${id}-Signed.pdf"`,
    );
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    req.log.error({ err, agreementId: id }, "Failed to download agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

function stripHealthScoreForNonEmployer<T extends {
  healthScore?: number | null;
  healthScoreDetail?: unknown;
  healthScoredAt?: Date | string | null;
}>(agreement: T, role: string | null | undefined): T {
  if (role === "employer") return agreement;
  return {
    ...agreement,
    healthScore: null,
    healthScoreDetail: null,
    healthScoredAt: null,
  };
}

function stripSummaryForNonFreelancer<T extends {
  freelancerSummary?: unknown;
  freelancerSummaryScoredAt?: Date | string | null;
  hasSummary?: boolean;
}>(agreement: T, role: string | null | undefined): T {
  if (role === "freelancer") return agreement;
  return {
    ...agreement,
    freelancerSummary: null,
    freelancerSummaryScoredAt: null,
    hasSummary: false,
  };
}

async function enrichAgreement(a: typeof agreementsTable.$inferSelect) {
  const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, a.freelancerId)).limit(1);
  const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, a.employerId)).limit(1);
  return {
    ...a,
    freelancerName: f?.name ?? null,
    employerName: e?.name ?? null,
    estimatedRedlineTokens: Math.ceil((a.content?.length ?? 0) / 4) + 500,
    hasSummary: a.freelancerSummary !== null,
  };
}

async function enrichAgreementForViewer(
  a: typeof agreementsTable.$inferSelect,
  viewerRole: string | null | undefined,
) {
  const enriched = await enrichAgreement(a);
  return stripSummaryForNonFreelancer(
    stripHealthScoreForNonEmployer(enriched, viewerRole),
    viewerRole,
  );
}

export default router;
