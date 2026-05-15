import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  agreementsTable, bookingsTable, freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq, or, and, SQL } from "drizzle-orm";
import { CreateAgreementBody, SignAgreementBody, ListAgreementsQueryParams } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.get("/agreements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListAgreementsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  try {
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

    const agreements = await db.select().from(agreementsTable).where(conditions.length > 0 ? and(...conditions) : undefined);
    const enriched = await Promise.all(agreements.map(enrichAgreement));
    res.json(enriched);
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
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);

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
          content: `You are a senior commercial attorney drafting a binding freelance services agreement on behalf of TalentLock, a secure freelancer booking platform. You write precise, enforceable legal contracts — not templates, not samples. Every clause must contain complete, substantive legal language. Do NOT include placeholder text such as "[insert…]", "TBD", or "to be agreed". Where jurisdiction-specific details are unavailable, default to the laws of the State of Delaware, USA, and US federal law. Write in formal legal English.`,
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

    const content = completion.choices[0]?.message?.content ?? "Agreement content could not be generated.";
    const [agreement] = await db.insert(agreementsTable)
      .values({
        bookingId: booking.id,
        freelancerId: booking.freelancerId,
        employerId: booking.employerId,
        content,
        status: "pending_signatures",
      })
      .returning();
    res.status(201).json(await enrichAgreement(agreement));
  } catch (err) {
    req.log.error({ err }, "Failed to create agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agreements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }
    res.json(await enrichAgreement(agreement));
  } catch (err) {
    req.log.error({ err }, "Failed to get agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements/:id/sign", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = SignAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const signatureName = (parsed.data as any).signatureName as string | undefined;
  if (!signatureName?.trim()) {
    res.status(400).json({ error: "Signature name is required" }); return;
  }

  try {
    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    const now = new Date();
    const updates: Record<string, unknown> = {};

    if (parsed.data.role === "employer") {
      if (agreement.employerSignedAt) { res.status(400).json({ error: "Employer has already signed" }); return; }
      updates.employerSignedAt = now;
      updates.employerSignatureName = signatureName.trim();
    } else if (parsed.data.role === "freelancer") {
      // Freelancer can only sign AFTER employer has signed
      if (!agreement.employerSignedAt) {
        res.status(400).json({ error: "Employer must sign first before the freelancer can sign" }); return;
      }
      if (agreement.freelancerSignedAt) { res.status(400).json({ error: "Freelancer has already signed" }); return; }
      updates.freelancerSignedAt = now;
      updates.freelancerSignatureName = signatureName.trim();
    } else {
      res.status(400).json({ error: "Invalid role" }); return;
    }

    const [updated] = await db.update(agreementsTable)
      .set(updates as any)
      .where(eq(agreementsTable.id, id))
      .returning();

    if (updated.freelancerSignedAt && updated.employerSignedAt) {
      const [fullySignedAgreement] = await db.update(agreementsTable)
        .set({ status: "signed" })
        .where(eq(agreementsTable.id, id))
        .returning();
      await db.update(bookingsTable).set({ status: "active" }).where(eq(bookingsTable.id, updated.bookingId));
      res.json(await enrichAgreement(fullySignedAgreement));
    } else {
      res.json(await enrichAgreement(updated));
    }
  } catch (err) {
    req.log.error({ err }, "Failed to sign agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function enrichAgreement(a: typeof agreementsTable.$inferSelect) {
  const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, a.freelancerId)).limit(1);
  const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, a.employerId)).limit(1);
  return { ...a, freelancerName: f?.name ?? null, employerName: e?.name ?? null };
}

export default router;
