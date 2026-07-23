# TalentLock — Validation: Cruise Mode & TalentSearch DM Delivery

---

## Phase 1 — Database

### V1.1 — Columns exist

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cruise_mode_activity'
  AND column_name IN ('conversation_id', 'message_id');
```

Same for `talent_search_activity`. Both nullable.

---

## Phase 2 — Backend

### V2.1 — Cruise Mode sends DM

**Setup:** Freelancer with active Cruise Mode (live, not dry run). Post matching job.

**Expected:**
- `cruise_mode_activity.decision = 'sent'`
- `conversation_id` and `message_id` NOT NULL
- Row in `messages` with `role = 'human_freelancer'`, content = sanitised `proposedMessage`
- Employer user sees thread in `GET /api/conversations` (human_direct)

### V2.2 — TalentSearch sends DM

**Setup:** Employer with active TalentSearch. Trigger profile evaluation (PUT or backfill on activate).

**Expected:**
- `talent_search_activity.decision = 'sent'`
- Message with `role = 'human_employer'`
- Freelancer sees thread in inbox

### V2.3 — Dry run sends no DM

**Expected:** `decision` in (`dry_run_would_send`, `dry_run_skipped`); no new `messages` row; `conversation_id` null

### V2.4 — Single notification per send

After live send, recipient has one new notification of feature type — not both `new_message` and `talent_search_interest`.

### V2.5 — Thread deduplication

Two TalentSearch sends to same freelancer → same `conversation_id`, two `messages` rows.

---

## Phase 3 — Frontend

### V3.1 — Activity Open conversation

Employer on `/talent-search?tab=activity` → **Open conversation** navigates to DM with full AI text.

### V3.2 — Notification deep link

Freelancer taps TalentSearch ✦ notification → chat opens with employer message visible.

---

## Regression

- Manual "Message" from Talent Vault still works
- Cruise Mode / TalentSearch evaluation still fire-and-forget (<300ms on triggering route)
- `job_interests` insert still runs for Cruise Mode sends
