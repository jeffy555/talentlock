# TalentLock — Clarifications: Cruise Mode & TalentSearch DM Delivery

> Status: **RESOLVED** — see `plan.md` for decisions.

---

## Q1 — Why not only use generic `new_message` notifications?

Feature-branded notifications (✦ badge) communicate AI-assisted outreach. Generic `new_message` loses that transparency. DM delivery uses feature notification type linking to the thread; generic type is suppressed for automated sends.

---

## Q2 — Should automated messages be visually distinct in chat?

**Phase 1: No.** Message appears from the human party (employer/freelancer). Phase 2 may add optional metadata footer.

---

## Q3 — Backfill historical `sent` rows without DMs?

**Out of scope for implementation.** Ops may run a one-off script if needed. New sends after deploy get DMs.

---

## Q4 — Rate limits

Automated send uses same `sendHumanMessage` insert path. First message in a new thread does not hit 30/hour limit in practice. Evaluator batch caps (50 candidates) prevent burst abuse.
