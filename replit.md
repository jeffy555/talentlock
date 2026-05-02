# TalentLock

A full-stack secure freelancer booking platform with AI-powered talent matching, legal agreement generation/signing, booking exclusivity badges, and personalized dashboards for freelancers and employers.

## Architecture

### Monorepo Structure
- `artifacts/talentlock/` — React + Vite frontend (port 25807, path `/`)
- `artifacts/api-server/` — Express 5 API server (port 8080, path `/api`)
- `lib/db/` — Drizzle ORM schema + PostgreSQL migrations
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-client-react/` — Generated React Query hooks (from OpenAPI)
- `lib/api-zod/` — Generated Zod schemas (from OpenAPI)
- `lib/integrations-openai-ai-server/` — OpenAI client template (server-side)
- `lib/integrations-openai-ai-react/` — OpenAI client template (frontend)

### Tech Stack
- **Frontend**: React 19, Vite 7, Tailwind CSS, shadcn/ui, Clerk Auth, React Query, Wouter routing
- **Backend**: Express 5, TypeScript, Pino logging
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Clerk (proxy at `/api/clerk`)
- **AI**: OpenAI GPT via Replit AI Integrations (talent matching + legal doc generation)
- **Storage**: Google Cloud Storage via Replit Object Storage

## Database Schema

| Table | Description |
|-------|-------------|
| `users` | Core user accounts (linked to Clerk IDs) |
| `freelancer_profiles` | Freelancer professional profiles |
| `employer_profiles` | Employer/company profiles |
| `job_requirements` | Job postings by employers |
| `bookings` | Exclusive freelancer engagements |
| `agreements` | AI-generated legal agreements |
| `conversations` | AI match chat sessions |
| `messages` | Individual chat messages |

## Key Features

1. **Dual Role System** — Users register as either freelancers or employers via onboarding
2. **Talent Vault** — Employers browse vetted freelancers with availability/booking status
3. **Exclusive Bookings** — When booked, freelancers are marked unavailable (Lock badge)
4. **AI Talent Matching** — GPT-powered chat that analyzes job requirements and recommends matching freelancers
5. **AI Agreement Generation** — GPT-4 generates comprehensive legal engagement contracts from booking details
6. **Digital Signatures** — Both parties sign agreements within the platform
7. **Dashboards** — Role-specific metrics (earnings/spend, booking count, agreement status)

## Routes

### API Routes (all under `/api/`)
- `GET/PUT /api/users/me` — User profile
- `GET/POST /api/freelancers` + `/api/freelancers/:id` + `/api/freelancers/me` — Freelancer profiles
- `GET/PUT /api/employers/me` — Employer profiles
- `GET/POST/PATCH/DELETE /api/job-requirements/:id` — Job postings
- `GET/POST/PATCH /api/bookings/:id` — Bookings + status management
- `GET/POST /api/agreements/:id` + `/api/agreements/:id/sign` — Agreements + signing
- `GET/POST /api/openai/conversations/:id/messages` — AI chat
- `GET /api/dashboard/stats` + `/api/dashboard/activity` — Dashboard data

### Frontend Routes
- `/` — Landing page
- `/sign-in`, `/sign-up` — Clerk auth pages
- `/onboarding` — Role selection + profile setup
- `/dashboard` — Role-specific overview
- `/freelancers` + `/freelancers/:id` — Talent vault (employers only)
- `/jobs` + `/jobs/new` + `/jobs/:id` — Job requirements
- `/bookings` + `/bookings/:id` — Booking management
- `/agreements` + `/agreements/:id` — Agreements + e-signing
- `/ai-match` — AI talent matching chat (employers only)
- `/profile` — User profile management

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk auth
- `VITE_CLERK_PUBLISHABLE_KEY` — Frontend Clerk key
- `VITE_CLERK_PROXY_URL` — Clerk proxy URL (typically `/api/clerk`)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI via Replit
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — GCS bucket for file storage

## Development Notes

- Run `pnpm --filter @workspace/db run push` after schema changes
- Run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI spec changes
- `lib/api-zod/orval.config.ts` must keep `indexFiles: false` to prevent duplicate exports
- `lib/api-zod/src/index.ts` must only export `./generated/api` (not `./generated/types`)
- Demo freelancers can be seeded via `pnpm --filter @workspace/scripts run seed`

### Auth Flow
- New Clerk users get a 404 from `GET /api/users/me` (no DB record yet) — this is intentional
- The QueryClient is configured to not retry 4xx errors (instant redirect for new users)
- Landing.tsx immediately redirects to /onboarding when `useGetMe` errors or returns no data
- Onboarding.tsx does not block on the loading spinner when `isError` is true (404 = new user)
