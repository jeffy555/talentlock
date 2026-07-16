/**
 * Maps legacy validate-*.mjs scripts to Vitest suites (Phase 8 migration tracker).
 * Update when adding coverage; legacyCoverage.test.ts verifies targets exist.
 */
export const LEGACY_SCRIPT_MAP = [
  {
    script: "artifacts/api-server/validate-auth-hardening.mjs",
    vitest: ["tests/integration/auth/idor.test.ts", "tests/unit/accessControl.test.ts"],
    priority: "P0",
  },
  {
    script: "artifacts/api-server/validate-security-hardening.mjs",
    vitest: [
      "tests/integration/security/middleware.test.ts",
      "tests/integration/admin/auth.test.ts",
      "tests/unit/securitySource.test.ts",
    ],
    priority: "P0",
  },
  {
    script: "artifacts/api-server/validate-product-gaps-utils.mjs",
    vitest: ["tests/unit/completenessUtils.test.ts"],
    priority: "P0",
  },
  {
    script: "lib/db/scripts/validate-product-gaps.mjs",
    vitest: ["tests/integration/freelancers/vault.test.ts", "tests/integration/freelancers/productGaps.test.ts"],
    priority: "P1",
  },
  {
    script: "artifacts/api-server/validate-availability-calendar.mjs",
    vitest: ["tests/integration/availability/public.test.ts", "tests/integration/availability/calendar.test.ts"],
    priority: "P1",
  },
  {
    script: "artifacts/api-server/validate-smart-rate-suggestions.mjs",
    vitest: ["tests/integration/ai/rateSuggestion.test.ts", "tests/integration/ai/guards.test.ts"],
    priority: "P1",
  },
  {
    script: "artifacts/api-server/validate-ai-proposal-generator.mjs",
    vitest: ["tests/integration/ai/proposal.test.ts", "tests/integration/ai/guards.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/validate-smarter-matching.mjs",
    vitest: ["tests/integration/ai/matchExplanation.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/validate-per-conversation-token-breakdown.mjs",
    vitest: ["tests/integration/token-usage/conversation.test.ts", "tests/integration/token-usage/me.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/validate-contract-health-score.mjs",
    vitest: ["tests/integration/agreements/health.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/validate-agreement-redlining.mjs",
    vitest: ["tests/integration/agreements/redline.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/validate-agreement-ai-summary.mjs",
    vitest: ["tests/integration/agreements/summary.test.ts", "tests/integration/agreements/access.test.ts"],
    priority: "P1",
  },
  {
    script: "scripts/test-agreement-pdf-download.mjs",
    vitest: ["tests/integration/agreements/download.test.ts"],
    priority: "P1",
  },
  {
    script: "artifacts/api-server/validate-team-accounts.mjs",
    vitest: ["tests/integration/team/access.test.ts"],
    priority: "P2",
  },
  {
    script: "artifacts/api-server/validate-notification-scenario.mjs",
    vitest: ["tests/integration/notifications/inbox.test.ts", "tests/integration/notifications/readOrdering.test.ts"],
    priority: "P2",
  },
  {
    script: "artifacts/api-server/validate-resend-booking-email.mjs",
    vitest: ["tests/integration/bookings/notifications.test.ts"],
    priority: "P2",
  },
  {
    script: "artifacts/api-server/validate-resend-e2e.mjs",
    vitest: ["tests/integration/notifications/email.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-notifications-phase1.mjs",
    vitest: ["tests/integration/notifications/inbox.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-notifications-phase2.mjs",
    vitest: ["tests/integration/notifications/inbox.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-notifications-phase3.mjs",
    vitest: ["tests/integration/notifications/inbox.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-notifications-phase4.mjs",
    vitest: ["tests/integration/notifications/inbox.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-reviews-phase1.mjs",
    vitest: ["tests/integration/reviews/public.test.ts", "tests/integration/reviews/submit.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-reviews-phase2.mjs",
    vitest: ["tests/integration/reviews/submit.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-reviews-phase3.mjs",
    vitest: ["tests/integration/reviews/submit.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-reviews-phase4.mjs",
    vitest: ["tests/integration/reviews/submit.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-reviews-all.mjs",
    vitest: ["tests/integration/reviews/public.test.ts", "tests/integration/reviews/submit.test.ts"],
    priority: "P2",
  },
  {
    script: "scripts/verify-earnings-intelligence.mjs",
    vitest: ["tests/integration/dashboard/earnings.test.ts", "tests/integration/dashboard/panels.test.ts"],
    priority: "P2",
  },
  {
    script: "lib/db/scripts/verify-security-phase2.mjs",
    vitest: ["tests/unit/securitySource.test.ts"],
    priority: "P2",
  },
] as const;

export const LEGACY_SCRIPT_PATHS = LEGACY_SCRIPT_MAP.map((e) => e.script);
