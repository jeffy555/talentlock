# TalentLock — Clarifications: Employer Uploaded Agreement

## Q1 — Upload mechanism

**Decision:** Two-step presigned upload (upload-url + upload-confirm), matching freelancer `documents` flow. Not raw multipart on a single OpenAPI route.

---

## Q2 — Workflow stages

**Decision:** `uploadStage` column on agreements:

| Stage | Meaning |
|-------|---------|
| `summary_ready` | Upload complete, employer summary generated |
| `enriched` | AI merged amendments + booking dates/rate |
| `finalized` | Health review complete, employer may sign |

`ai_generated` agreements have `uploadStage = null`.

---

## Q3 — Amendment editing

**Decision:** Full replacement array via PATCH (max 20 items, 20–1000 chars each). Simpler than incremental add/remove endpoints.

---

## Q4 — Enrichment vs redline

**Decision:** Enrichment is a dedicated endpoint that rewrites content with booking particulars. Existing redline remains available post-finalize for Growth+ if employer wants further AI suggestions.

---

## Q5 — Signature gating

**Decision:** Employer cannot sign until `uploadStage === finalized` for `employer_upload` source. AI-generated agreements unchanged (sign anytime in draft).

---

## Q6 — Token features

**Decision:** Add `agreement_upload_summary` and `agreement_upload_enrich`. Finalize reuses `contract_health_score`.

---

## Q7 — Minimum extracted text

**Decision:** At least 200 characters after extraction; otherwise 422 with clear error.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Poor PDF text extraction | Clear error message; suggest DOCX |
| Large agreements exceed context | Truncate to 12k chars for summary; 16k for enrich |
| Employer signs before review | Block sign until finalized |
