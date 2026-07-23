import { randomUUID } from "crypto";
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import { defaultTalentSearchRules } from "../../../src/lib/talentSearchUtils";
import { closePool, getPool, loadDemoFixtures } from "../../helpers/db";
import { integrationEnvReady } from "../../setup/env";

const sendEvaluation = JSON.stringify({
  score: 85,
  decision: "send",
  reasons: { matched: ["Skills align"], concerns: [], blockers: [] },
  proposedMessage: "Hello, we would love to connect.",
});

const openAiCreate = vi.fn().mockResolvedValue({
  choices: [{ message: { content: sendEvaluation } }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openAiCreate } };
  },
}));

describe.skipIf(!integrationEnvReady())("TalentSearch evaluator limits (V2.8–V2.10)", () => {
  let employerProfileId: number | null;
  let freelancerProfileId: number | null;

  beforeAll(async () => {
    const fixtures = await loadDemoFixtures();
    employerProfileId = fixtures.employerProfileId;
    freelancerProfileId = fixtures.freelancerProfileId;
  });

  afterEach(async () => {
    openAiCreate.mockClear();
    const pool = getPool();
    if (employerProfileId) {
      await pool.query(`DELETE FROM talent_search_activity WHERE employer_id = $1`, [
        employerProfileId,
      ]);
      await pool.query(`DELETE FROM talent_search_configs WHERE employer_id = $1`, [
        employerProfileId,
      ]);
    }
    if (freelancerProfileId) {
      await pool.query(
        `UPDATE freelancer_profiles
         SET talent_search_notifications_today = 0,
             talent_search_notifications_reset_at = NOW() + interval '1 day'
         WHERE id = $1`,
        [freelancerProfileId],
      );
    }
  });

  afterAll(async () => {
    await closePool();
  });

  async function seedActiveConfig(hoursUsedToday = "0") {
    if (!employerProfileId) throw new Error("missing employer profile");
    const pool = getPool();
    const rules = defaultTalentSearchRules();
    await pool.query(
      `INSERT INTO talent_search_configs (
         id, employer_id, is_active, is_dry_run, rules, rules_version,
         hours_used_today, daily_limit_hours, hours_reset_at, created_at, updated_at
       ) VALUES ($1, $2, true, false, $3::jsonb, 1, $4, '6', NOW() + interval '1 day', NOW(), NOW())
       ON CONFLICT (employer_id) DO UPDATE SET
         is_active = true,
         is_dry_run = false,
         rules = EXCLUDED.rules,
         hours_used_today = EXCLUDED.hours_used_today,
         hours_reset_at = EXCLUDED.hours_reset_at,
         updated_at = NOW()`,
      [randomUUID(), employerProfileId, JSON.stringify(rules), hoursUsedToday],
    );
  }

  async function runEvaluation() {
    if (!freelancerProfileId) throw new Error("missing freelancer profile");
    const { evaluateTalentSearchForUpdatedProfile } = await import(
      "../../../src/lib/talentSearchEvaluator"
    );
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { db } = await import("@workspace/db");
    await evaluateTalentSearchForUpdatedProfile(db, freelancerProfileId, log);
  }

  async function latestActivityDecision(): Promise<string | null> {
    if (!employerProfileId) return null;
    const pool = getPool();
    const row = await pool.query(
      `SELECT decision FROM talent_search_activity
       WHERE employer_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [employerProfileId],
    );
    return row.rows[0]?.decision ?? null;
  }

  async function activityCount(): Promise<number> {
    if (!employerProfileId) return 0;
    const pool = getPool();
    const row = await pool.query(
      `SELECT COUNT(*)::int AS c FROM talent_search_activity WHERE employer_id = $1`,
      [employerProfileId],
    );
    return row.rows[0]?.c ?? 0;
  }

  it("V2.8 — skips silently when a sent activity exists within 30 days", async () => {
    if (!employerProfileId || !freelancerProfileId) return;

    await seedActiveConfig();
    const pool = getPool();
    await pool.query(
      `INSERT INTO talent_search_activity (
         id, employer_id, freelancer_id, rules_version, score, decision,
         match_reasons, proposed_message, sent_at, created_at
       ) VALUES ($1, $2, $3, 1, 90, 'sent', '{"matched":[],"concerns":[],"blockers":[]}'::jsonb, 'Hi', NOW(), NOW())`,
      [randomUUID(), employerProfileId, freelancerProfileId],
    );

    const before = await activityCount();
    await runEvaluation();
    const after = await activityCount();

    expect(after).toBe(before);
    expect(openAiCreate).not.toHaveBeenCalled();
  });

  it("V2.9 — logs daily_freelancer_limit_reached when freelancer cap is 3", async () => {
    if (!employerProfileId || !freelancerProfileId) return;

    await seedActiveConfig();
    const pool = getPool();
    await pool.query(
      `UPDATE freelancer_profiles
       SET talent_search_notifications_today = 3,
           talent_search_notifications_reset_at = NOW() + interval '1 day'
       WHERE id = $1`,
      [freelancerProfileId],
    );

    await runEvaluation();

    expect(await latestActivityDecision()).toBe("daily_freelancer_limit_reached");
    expect(openAiCreate).not.toHaveBeenCalled();

    const capRow = await pool.query(
      `SELECT talent_search_notifications_today FROM freelancer_profiles WHERE id = $1`,
      [freelancerProfileId],
    );
    expect(capRow.rows[0]?.talent_search_notifications_today).toBe(3);
  });

  it("V2.10 — logs daily_limit_reached when employer hours budget is exhausted", async () => {
    if (!employerProfileId || !freelancerProfileId) return;

    await seedActiveConfig("6.0");
    const pool = getPool();

    await runEvaluation();

    expect(await latestActivityDecision()).toBe("daily_limit_reached");
    expect(openAiCreate).not.toHaveBeenCalled();

    const configRow = await pool.query(
      `SELECT is_active, hours_used_today FROM talent_search_configs WHERE employer_id = $1`,
      [employerProfileId],
    );
    expect(configRow.rows[0]?.is_active).toBe(true);
    expect(parseFloat(configRow.rows[0]?.hours_used_today ?? "0")).toBeGreaterThanOrEqual(6);
  });
});
