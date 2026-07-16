# TalentLock — Plan: Automated API Testing

## Architecture

```
artifacts/api-server/
├── vitest.config.ts
├── tests/
│   ├── setup/
│   │   ├── env.ts              # load .env.test, guard production DB
│   │   └── globalSetup.ts      # optional: migrate/seed test DB
│   ├── helpers/
│   │   ├── apiClient.ts        # Supertest wrapper + Clerk JWT minting
│   │   ├── db.ts               # test Pool, truncate helpers, fixture factories
│   │   ├── adminSession.ts     # admin login + CSRF cookie helper
│   │   └── openaiMock.ts       # stub OpenAI for AI route tests
│   ├── unit/                   # no DATABASE_URL required
│   ├── integration/            # Supertest against app; real test DB
│   └── regression/             # Vitest ports of validate-*.mjs checks
scripts/
└── test-regression.mjs         # orchestrates legacy validate scripts (CI bridge)
```

Frontend unit tests (optional Phase 9) live in `artifacts/talentlock/tests/` with Vitest + `@testing-library/react`.

## Test database strategy

- **Dedicated Neon branch** or local Postgres with `DATABASE_URL_TEST`
- `globalSetup` refuses to run if `DATABASE_URL` matches production patterns (`neon.tech` prod project id, etc.)
- Each integration file uses **transaction rollback** or **truncate + seed** via `scripts/seed` demo data
- Demo Clerk users: `DEMO_EMPLOYER_CLERK_ID`, `DEMO_FREELANCER_CLERK_ID` (same as validate scripts)

## Mocking policy

| Dependency | Unit | Integration |
|------------|------|-------------|
| OpenAI | Always mocked | Mock by default; optional `OPENAI_LIVE=1` smoke |
| GCS / storage | Mock `objectStorage` | Local object storage or skip |
| Resend email | Mock / assert no-op | Assert `sendNotificationEmail` called or skipped |
| Clerk | N/A | Real JWT via Clerk Backend API (test users) |

## CI pipeline (target)

```yaml
jobs:
  unit:
    run: pnpm run test:unit
  integration:
    needs: unit
    env: DATABASE_URL_TEST, CLERK_SECRET_KEY, CSRF_SECRET, ...
    run: pnpm run test:integration
  legacy-validate:
    needs: integration
    run: pnpm run test:validate   # existing .mjs scripts until fully ported
```

## Execution order (matches TalentLock phase rules)

1. **Phase 0** — Harness + unit tests (no schema changes)
2. **Phase 1** — Auth hardening + security regression port
3. **Phase 2** — Core marketplace integration tests
4. **Phase 3** — AI routes (mocked)
5. **Phase 4** — Feature-specific regression ports (27 specs)
6. **Phase 5** — Playwright smoke paths
7. **Phase 6** — CI workflow + branch protection

`plan.md` wins over `task.md` for sequencing conflicts.
