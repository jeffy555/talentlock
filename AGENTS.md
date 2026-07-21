# AGENTS.md

Project overview, architecture, schema, routes, and workflows live in `project.md` (authoritative) and `replit.md`. Read `project.md` before feature work. Standard commands are documented in `project.md` ("Useful pnpm Commands") and `package.json` scripts.

## Cursor Cloud specific instructions

TalentLock is a pnpm monorepo (Node 22, pnpm 10.33.3). The two runnable services are the Express API (`@workspace/api-server`, port 8080) and the Vite frontend (`@workspace/talentlock`, port 25807, proxies `/api` → 8080). Both are started in dev mode via the scripts already documented in `project.md`.

### Hard dependency: Clerk credentials are required for ANYTHING to run
- The API mounts `clerkMiddleware()` globally in `artifacts/api-server/src/app.ts` BEFORE the router, so EVERY `/api/*` request (including `/api/health` and admin routes) returns HTTP 500 `Missing Clerk Secret Key` when `CLERK_SECRET_KEY` is unset. There is no unauthenticated bypass.
- The frontend renders a "Configuration error" page (not the app) when `VITE_CLERK_PUBLISHABLE_KEY` is unset (see `artifacts/talentlock/src/App.tsx`).
- Provide these via Cursor Secrets (injected as env vars) and mirror them into the root `.env`: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`. Without a real Clerk instance you cannot sign in or exercise any product flow.
- Optional demo login (`ENABLE_DEMO_LOGIN=true` in dev) mints Clerk sessions for `DEMO_EMPLOYER_CLERK_ID` / `DEMO_FREELANCER_CLERK_ID`, but those must be real Clerk user IDs in the same instance AND have matching `users` rows. The `pnpm --filter @workspace/scripts run seed` demo freelancers use placeholder clerkIds (`demo_teacher_01`, …), so they do NOT map to demo-login accounts.

### Local Postgres (no managed DB in this environment)
- PostgreSQL 16 is installed at `/usr/lib/postgresql/16/bin`. It is NOT auto-started. Start it and create the DB before running the API, schema push, seed, or integration tests:
  ```bash
  export PGDATA=/tmp/pgdata
  [ -d "$PGDATA" ] || /usr/lib/postgresql/16/bin/initdb -D "$PGDATA" -U postgres --auth=trust
  sudo mkdir -p /var/run/postgresql && sudo chown "$(whoami)" /var/run/postgresql
  /usr/lib/postgresql/16/bin/pg_ctl -D "$PGDATA" -l /tmp/pg.log -o "-k /var/run/postgresql -p 5432" start
  /usr/lib/postgresql/16/bin/psql "postgresql://postgres@localhost:5432/postgres" -c "CREATE DATABASE talentlock;" 2>/dev/null || true
  ```
- Root `.env` (gitignored) must set `DATABASE_URL=postgresql://postgres@localhost:5432/talentlock`, `PORT=8080`, `CSRF_SECRET` (any 64-char hex), `SESSION_SECRET`, `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD`, plus the Clerk keys above. Use `.env.example` as the template.

### Non-obvious gotchas
- `drizzle-kit push` does NOT read `.env`. Run schema push with `DATABASE_URL` exported in the shell: `DATABASE_URL=... pnpm --filter @workspace/db run push`. The API server and frontend DO auto-load `.env` (`--env-file-if-exists` / Vite `envDir`).
- `pnpm install` reports an ignored build script for `@clerk/shared`; this is non-blocking (runtime works). Do not run the interactive `pnpm approve-builds`.
- The seed script (`@workspace/scripts run seed`) imports `@workspace/db` and also needs `DATABASE_URL` exported.
- `.npmrc` uses `node-linker=hoisted`; all deps hoist to the root `node_modules` (per-package `node_modules` may be absent — that is expected, not a broken install).
- OpenAI (`OPENAI_API_KEY_TALENTLOCK`), object storage (falls back to local `.local-object-storage`), and Resend email are all optional; the app runs without them (AI/upload/email features degrade).
