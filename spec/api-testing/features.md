# TalentLock — Features Specification: Automated API Testing

## Overview

TalentLock ships **29+ manual validation scripts** (`validate-*.mjs`, `verify-*.mjs`) and **no Vitest/Supertest CI suite**. Feature work is validated ad hoc against a running API + Neon database + Clerk demo users. That pattern does not scale for regression safety.

This feature introduces a **layered automated test harness**:

| Layer | Tooling | Runs in CI without secrets |
|-------|---------|----------------------------|
| **Unit** | Vitest | Yes — pure functions, no DB |
| **Integration** | Vitest + Supertest + test DB | No — needs `DATABASE_URL`, Clerk, optional OpenAI |
| **Contract** | OpenAPI snapshot / schemathesis (optional) | Partial |
| **E2E** | Playwright (already in root devDeps) | No — needs full stack |
| **Legacy bridge** | `pnpm run test:validate` wraps existing `validate-*.mjs` | No |

Non-goals for this spec:

- Replacing every manual script in one PR
- Stripe webhook tests (deferred to `stripe-billing` spec)
- Load/stress testing
- Visual regression testing

## Success criteria

1. `pnpm run test:unit` passes in CI with zero secrets
2. `pnpm run test:integration` runs against a dedicated test database and covers auth guards + critical CRUD paths
3. All existing `validate-*.mjs` scripts are catalogued with a Vitest migration target
4. Failed regression blocks merge (GitHub Actions or equivalent)

## Relationship to existing validation

Each feature spec's `validation.md` becomes the **acceptance source** for integration tests. Tests are named `{spec-slug}/{check-id}` so failures map back to spec checklists.
