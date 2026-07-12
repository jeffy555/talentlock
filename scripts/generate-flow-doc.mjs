// Generates TalentLock-Application-Flow.pdf — Employer & Freelancer journeys + full feature catalogue.
// Run: node scripts/generate-flow-doc.mjs
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const h = React.createElement;

// ── Brand palette (from the TalentLock app) ─────────────────────────────
const NAVY = "#0d1f3c";
const NAVY_SOFT = "#16305c";
const GOLD = "#c9a84c";
const GOLD_SOFT = "#f3ead0";
const INK = "#1f2a3c";
const MUTE = "#5b6b82";
const LINE = "#d9e0ea";
const TEAL = "#0f766e";
const VIOLET = "#6d28d9";
const PAPER = "#ffffff";
const WASH = "#f6f8fb";

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 56, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.45 },
  // cover
  cover: { flex: 1, backgroundColor: NAVY, color: "#fff", justifyContent: "center", paddingHorizontal: 60 },
  coverKicker: { color: GOLD, fontSize: 12, letterSpacing: 3, fontFamily: "Helvetica-Bold" },
  coverTitle: { color: "#fff", fontSize: 40, fontFamily: "Helvetica-Bold", marginTop: 18, lineHeight: 1.1 },
  coverSub: { color: "#c7d2e2", fontSize: 13, marginTop: 18, maxWidth: 380, lineHeight: 1.5 },
  coverRule: { height: 3, width: 90, backgroundColor: GOLD, marginTop: 26, marginBottom: 26 },
  coverMeta: { color: "#8ea3c0", fontSize: 9.5, marginTop: 4 },
  // section
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 4 },
  h1bar: { height: 3, width: 46, backgroundColor: GOLD, marginBottom: 14 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 16, marginBottom: 7 },
  p: { fontSize: 10, color: INK, marginBottom: 7 },
  lead: { fontSize: 11, color: MUTE, marginBottom: 12, lineHeight: 1.5 },
  // step
  step: { flexDirection: "row", marginBottom: 9 },
  stepNumWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: NAVY, alignItems: "center", justifyContent: "center", marginRight: 10 },
  stepNumWrapGold: { backgroundColor: GOLD },
  stepNum: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 10 },
  stepNumInk: { color: NAVY, fontFamily: "Helvetica-Bold", fontSize: 10 },
  stepBody: { flex: 1 },
  stepTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: NAVY },
  stepText: { fontSize: 9.5, color: MUTE, marginTop: 1.5 },
  // callout
  callout: { borderLeftWidth: 3, borderLeftColor: GOLD, backgroundColor: GOLD_SOFT, padding: 10, borderRadius: 3, marginTop: 6, marginBottom: 10 },
  calloutText: { fontSize: 9.5, color: "#6b5a1e" },
  // feature card
  featRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  featCard: { width: "48.5%", borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 9, marginBottom: 9, backgroundColor: PAPER },
  featNum: { fontFamily: "Helvetica-Bold", color: GOLD, fontSize: 8.5 },
  featTitle: { fontFamily: "Helvetica-Bold", color: NAVY, fontSize: 9.8, marginTop: 1, marginBottom: 3 },
  featDesc: { fontSize: 8.3, color: MUTE, lineHeight: 1.4 },
  // pill
  pillRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  pill: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: NAVY_SOFT, paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 8, marginRight: 4, marginTop: 3 },
  // flow diagram box
  flowBox: { borderWidth: 1, borderColor: LINE, borderRadius: 5, padding: 10, backgroundColor: WASH, marginBottom: 6 },
  flowStage: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  flowDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  flowLabel: { fontSize: 9.8, fontFamily: "Helvetica-Bold", color: NAVY },
  flowMeta: { fontSize: 8.5, color: MUTE, marginLeft: 8 },
  flowArrow: { fontSize: 9, color: GOLD, marginLeft: 1, marginBottom: 4 },
  // footer / header
  footer: { position: "absolute", bottom: 26, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 7 },
  footerText: { fontSize: 8, color: MUTE },
  tag: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 1 },
  // two col table
  trow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  tcellK: { width: "34%", fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY },
  tcellV: { width: "66%", fontSize: 9, color: MUTE },
  // stack rows
  stackRow: { flexDirection: "row", marginBottom: 8, wrap: false },
  stackTier: { width: 92, fontFamily: "Helvetica-Bold", fontSize: 9, color: GOLD },
  stackVal: { flex: 1, fontSize: 9, color: INK },
  // endpoint reference
  epGroup: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 10, marginBottom: 4, backgroundColor: WASH, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 },
  epRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2.4, borderBottomWidth: 0.5, borderBottomColor: "#eef2f7" },
  epMethod: { width: 42, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#fff", textAlign: "center", paddingVertical: 1.5, borderRadius: 3, marginRight: 7 },
  epPath: { width: 178, fontSize: 7.6, color: NAVY, fontFamily: "Helvetica-Bold" },
  epDesc: { flex: 1, fontSize: 7.6, color: MUTE },
  // matrix table
  mHead: { flexDirection: "row", backgroundColor: NAVY, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  mHeadCell: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7.2, paddingVertical: 5, paddingHorizontal: 3, textAlign: "center" },
  mHeadCellL: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7.6, paddingVertical: 5, paddingHorizontal: 5 },
  mRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  mRowAlt: { backgroundColor: WASH },
  mCellL: { fontSize: 7.6, fontFamily: "Helvetica-Bold", color: NAVY, paddingVertical: 4.5, paddingHorizontal: 5 },
  mCell: { fontSize: 7.4, color: INK, paddingVertical: 4.5, paddingHorizontal: 3, textAlign: "center" },
});

const Footer = (roleTag) =>
  h(View, { style: s.footer, fixed: true }, [
    h(Text, { key: "a", style: s.footerText }, "TalentLock — Secure Freelancer Booking Platform"),
    h(Text, { key: "b", style: s.tag }, roleTag),
    h(Text, { key: "c", style: s.footerText, render: ({ pageNumber }) => `${pageNumber}` }),
  ]);

const Head = (title) =>
  h(View, { key: "head" }, [
    h(Text, { key: "t", style: s.h1 }, title),
    h(View, { key: "b", style: s.h1bar }),
  ]);

const Step = (n, title, text, gold = false) =>
  h(View, { key: `${title}`, style: s.step, wrap: false }, [
    h(View, { key: "n", style: [s.stepNumWrap, gold ? s.stepNumWrapGold : {}] },
      h(Text, { style: gold ? s.stepNumInk : s.stepNum }, String(n))),
    h(View, { key: "b", style: s.stepBody }, [
      h(Text, { key: "tt", style: s.stepTitle }, title),
      h(Text, { key: "tx", style: s.stepText }, text),
    ]),
  ]);

const Callout = (txt) =>
  h(View, { style: s.callout, wrap: false }, h(Text, { style: s.calloutText }, txt));

const Pills = (items) =>
  h(View, { style: s.pillRow }, items.map((p, i) => h(Text, { key: i, style: s.pill }, p)));

const FeatureCard = (num, title, desc) =>
  h(View, { key: title, style: s.featCard, wrap: false }, [
    h(Text, { key: "n", style: s.featNum }, num),
    h(Text, { key: "t", style: s.featTitle }, title),
    h(Text, { key: "d", style: s.featDesc }, desc),
  ]);

const METHOD_COLORS = { GET: "#16a34a", POST: "#2563eb", PUT: "#7c3aed", PATCH: "#d97706", DELETE: "#dc2626" };
const methodColor = (m) => METHOD_COLORS[m.split("/")[0]] || NAVY;

const EndpointGroup = (title, rows) =>
  h(View, { key: title, wrap: false }, [
    h(Text, { key: "g", style: s.epGroup }, title),
    ...rows.map((r, i) =>
      h(View, { key: i, style: s.epRow }, [
        h(Text, { key: "m", style: [s.epMethod, { backgroundColor: methodColor(r[0]) }] }, r[0]),
        h(Text, { key: "p", style: s.epPath }, r[1]),
        h(Text, { key: "d", style: s.epDesc }, r[2]),
      ])
    ),
  ]);

const LimitMatrix = () =>
  h(View, { wrap: false }, [
    h(View, { key: "h", style: s.mHead }, [
      h(Text, { key: "l", style: [s.mHeadCellL, { width: "27%" }] }, "Limit"),
      ...planCols.map((c, i) => h(Text, { key: i, style: [s.mHeadCell, { width: "14.6%" }] }, c)),
    ]),
    ...limitRows.map((r, ri) =>
      h(View, { key: ri, style: [s.mRow, ri % 2 ? s.mRowAlt : {}] }, [
        h(Text, { key: "l", style: [s.mCellL, { width: "27%" }] }, r[0]),
        ...r[1].map((v, i) => h(Text, { key: i, style: [s.mCell, { width: "14.6%" }] }, v)),
      ])
    ),
  ]);

const GateMatrix = () =>
  h(View, { wrap: false }, [
    h(View, { key: "h", style: s.mHead }, [
      h(Text, { key: "a", style: [s.mHeadCellL, { width: "40%" }] }, "Capability / Action"),
      h(Text, { key: "b", style: [s.mHeadCellL, { width: "30%" }] }, "Requires"),
      h(Text, { key: "c", style: [s.mHeadCellL, { width: "30%" }] }, "When blocked"),
    ]),
    ...gateRows.map((r, ri) =>
      h(View, { key: ri, style: [s.mRow, ri % 2 ? s.mRowAlt : {}] }, [
        h(Text, { key: "a", style: [s.mCellL, { width: "40%" }] }, r[0]),
        h(Text, { key: "b", style: [s.mCell, { width: "30%", textAlign: "left" }] }, r[1]),
        h(Text, { key: "c", style: [s.mCell, { width: "30%", textAlign: "left" }] }, r[2]),
      ])
    ),
  ]);

const STATUS_STYLE = {
  Complete: { bg: "#dcfce7", fg: "#15803d", label: "COMPLETE" },
  Ready: { bg: "#fef3c7", fg: "#b45309", label: "READY" },
  Done: { bg: "#dcfce7", fg: "#15803d", label: "DONE" },
  Todo: { bg: "#fee2e2", fg: "#b91c1c", label: "TODO" },
};
const StatusBadge = (status, w = 62) => {
  const st = STATUS_STYLE[status] || STATUS_STYLE.Todo;
  return h(Text, { style: { width: w, textAlign: "center", fontSize: 6.8, fontFamily: "Helvetica-Bold", color: st.fg, backgroundColor: st.bg, paddingVertical: 2, borderRadius: 6 } }, st.label);
};

// generic bordered table: cols = [{w, label, align}], rows = [[...cells]], last cell may be status key
const DataTable = (cols, rows, opts = {}) =>
  h(View, { wrap: false }, [
    h(View, { key: "h", style: s.mHead }, cols.map((c, i) =>
      h(Text, { key: i, style: [i === 0 ? s.mHeadCellL : s.mHeadCell, { width: c.w, textAlign: c.align || (i === 0 ? "left" : "center") }] }, c.label))),
    ...rows.map((r, ri) =>
      h(View, { key: ri, style: [s.mRow, ri % 2 ? s.mRowAlt : {}] }, r.map((cell, ci) => {
        if (opts.statusCol === ci) {
          return h(View, { key: ci, style: { width: cols[ci].w, alignItems: "center", justifyContent: "center", paddingVertical: 3 } }, StatusBadge(cell, cols[ci].w - 8));
        }
        const align = cols[ci].align || (ci === 0 ? "left" : "center");
        return h(Text, { key: ci, style: [ci === 0 ? s.mCellL : s.mCell, { width: cols[ci].w, textAlign: align }] }, cell);
      }))
    ),
  ]);

const FlowStage = (color, label, meta) =>
  h(View, { style: s.flowStage }, [
    h(View, { key: "d", style: [s.flowDot, { backgroundColor: color }] }),
    h(Text, { key: "l", style: s.flowLabel }, label),
    meta ? h(Text, { key: "m", style: s.flowMeta }, meta) : null,
  ]);

// ── Employer steps ──────────────────────────────────────────────────────
const employerSteps = [
  ["Sign up & onboard", "Register via Clerk, choose the Employer role, enter company name, industry, size and description. Creates users + employer_profiles."],
  ["Find talent — 3 ways", "Talent Vault (browse/filter by field, rate, availability, keyword); AI Match chat (GPT recommends + explains fit); TalentSearch (AI auto-scouts profiles for you)."],
  ["Post a job (optional)", "Create a job requirement with the AI Job Description Assistant (generate / improve / check). Posting triggers freelancers' Cruise Mode evaluations. Plan-limited per month."],
  ["Request a discovery meeting (optional)", "On confirmation, an AI Meeting Brief is generated for you: candidate snapshot, why-they-match, tailored questions, rate context and watch points."],
  ["Initiate a booking", "The pivotal action. A SELECT ... FOR UPDATE quota check runs inside a transaction; over-limit returns 402 and routes to /pricing. Booking opens as pending / negotiating."],
  ["Negotiate the rate", "Turn-based accept / counter. A Rate Suggestion widget shows market median plus your historical average. You proposed first; freelancer responds."],
  ["Generate the agreement", "Blocked until the rate is AGREED. GPT-4 drafts an industry-specific contract. Growth+ unlocks AI Redlining and a Contract Health Score (0-100, 5 dimensions)."],
  ["E-sign", "Sign with an uploaded signature image or typed name. Signing role is derived server-side (IDOR-safe). When both sign, the agreement is fully_signed."],
  ["Engagement goes live", "Booking flips to active and the freelancer is locked/exclusive. A certified PDF of the executed agreement is unlocked for both parties."],
  ["Close out & review", "Track milestones, mark completed (frees availability), then leave a 1-5 star review + comment that feeds the freelancer's public rating."],
  ["Measure", "Dashboard Spend Analytics (spend trend, top freelancers, rate vs market) and Hiring Analytics (funnel, skills gap, retention, lifecycle). Enterprise adds Team accounts."],
];

// ── Freelancer steps ──────────────────────────────────────────────────────
const freelancerSteps = [
  ["Sign up & onboard", "Register via Clerk, choose Freelancer, then pick a profession category (Technology or Education). Education adds teaching-specific fields."],
  ["Auto-build from resume", "Upload a resume and AI extracts tagline, field, skills, experience and rate — instantly creating your profile. Or fill the form manually."],
  ["Complete the profile", "Skills, rate, field, bio, photo, availability. completenessScore recalculates on every save. Gate: >= 60% complete to appear in the Talent Vault at all."],
  ["Verify identity", "Upload ID / credential documents for AI review to earn a verified badge that employers can see."],
  ["Manage availability", "Mark holidays and unavailable date ranges on a calendar. Confirmed bookings auto-create availability blocks."],
  ["Get discovered proactively", "Cruise Mode (Pro): set rules; AI evaluates every new job post and auto-pitches matching employers on your behalf (10/mo, dry-run, activity feed). Plus inbound TalentSearch interest."],
  ["Receive a booking request", "The employer initiates. You get an in-app notification + email. Booking starts pending / negotiating."],
  ["Negotiate the rate", "Accept or counter (turn-based; you can't act twice in a row). An AI Proposal Generator drafts your response; a Rate Suggestion widget gives market context."],
  ["Understand & sign", "Once the rate is agreed, use the freelancer-only 'Summarise for me' AI (6 plain-English sections + attention flags) before signing with your saved signature."],
  ["Go exclusive", "When both parties sign, the engagement is live: you become locked (unavailable, Lock badge) to everyone else for the engagement window."],
  ["Deliver, complete, get reviewed", "Track milestones; on completion your availability frees up and the employer can review you (you can reply)."],
  ["Track earnings", "Dashboard Earnings Intelligence: 6-month trend vs platform average, rate percentile benchmark, monthly projection and top-earning skills."],
];

// ── Full feature catalogue (all features) ────────────────────────────────
const features = [
  ["01", "Dual Role System", "Register as freelancer or employer; onboarding tailors the whole experience per role."],
  ["02", "Talent Vault", "Browse/filter freelancers by field, rate, availability, available-from date and keyword; shortlist with a heart; >=60% completeness gate."],
  ["03", "Exclusive Bookings", "Booked freelancers get a Lock badge and become unavailable to all other employers."],
  ["04", "Rate Negotiation", "Turn-based propose/accept/counter; agreement generation gated until both agree."],
  ["05", "AI Talent Matching", "GPT chat that recommends matching freelancers for an employer's need."],
  ["06", "AI Agreement Generation", "GPT-4 drafts legal engagement contracts from booking details + templates."],
  ["07", "Signature Upload", "Upload a handwritten signature image once; reused across all agreements."],
  ["08", "Agreement Safe Locker", "Fully executed agreements unlock a certified download per party."],
  ["09", "Milestone Tracking", "Bookings track milestones with title, amount, due date and status."],
  ["10", "Reviews & Ratings", "Employers rate completed bookings 1-5 + comment; freelancers can reply."],
  ["11", "Portfolio", "Freelancers manage portfolio items with images, URLs and tags."],
  ["12", "Public Profiles", "Unauthenticated /f/:id pages with a read-only availability calendar."],
  ["13", "Availability Calendar", "Visual date-range blocks (booked/holiday/unavailable); auto-blocks from bookings; employer read-only view; next-available badge."],
  ["14", "Subscription Tiers", "5 plans with enforced limits on bookings, job posts and interests."],
  ["15", "Admin Console", "Stats, users, audit log, booking/job overview; separate HMAC auth + CSRF."],
  ["16", "Document Verification", "AI review of uploaded ID/credentials; verified badge to employers."],
  ["17", "AI Token Tracking", "Monthly token quota per employer plan; per-conversation breakdown (Growth+)."],
  ["18", "Agreement Templates", "Industry-specific templates + enterprise custom clauses for generation."],
  ["19", "Contract Redlining", "AI review and edit suggestions before signing (Growth+)."],
  ["20", "Job Description Assistant", "AI writing assistant (generate / improve / check) for job posts."],
  ["21", "Smarter Matching", "AI explains why each freelancer was recommended (skills, rate, availability)."],
  ["22", "Notifications Centre", "In-app bell + unread badge; 15 event triggers; 30s polling; optional email."],
  ["23", "Earnings Intelligence", "Freelancer: 6-month trend vs avg, rate percentile, projection, top skills."],
  ["24", "Employer Spend Analytics", "Spend trend, field breakdown, top freelancers, committed spend, rate vs market."],
  ["25", "Hiring Analytics", "Funnel conversion, skills demand vs supply gap, retention, lifecycle, outcomes."],
  ["26", "Security Hardening", "Helmet, body limits, Pino redaction, text sanitisation, admin CSRF, audit logs, GDPR deletion."],
  ["27", "Product Gaps polish", "Email notifications (opt-out), keyword search, completeness gate, pagination, booking message, public preview."],
  ["28", "AI Proposal Generator", "Freelancer 'Write proposal' drawer on pending bookings; three tones; copyable block."],
  ["29", "Smart Rate Suggestions", "Rate context widget on booking + negotiation; static (all plans) + AI (Growth+)."],
  ["30", "Team Accounts (Enterprise)", "Invite members, shared shortlist, team-level analytics; role-based permissions."],
  ["31", "AI Contract Health Score", "On-demand 0-100 score across 5 dimensions with A-F grade; cached; both parties."],
  ["32", "Auth Hardening", "Per-resource authorization on 11 routes + storage ACL; IDOR protection (401/403/404)."],
  ["33", "Agreement AI Summary", "Freelancer-only 6-section plain-English summary + attention flags; disclaimer first."],
  ["34", "Agreement PDF Download", "Formatted PDF with signatures, timestamps, metadata; cached in GCS; both parties."],
  ["35", "Cruise Mode", "Freelancer_pro: AI evaluates every new job vs rules and auto-pitches employers; dry-run; 10/mo quota."],
  ["36", "Teaching Professional Profile", "Profession category + rate types + education fields (subjects, degree, licence, DBS, research)."],
  ["37", "TalentSearch (Employer Cruise Mode)", "AI auto-evaluates freelancer profiles vs employer rules and sends Express Interest notifications."],
  ["38", "AI Meeting Brief Generator", "On meeting confirm, AI 5-section brief for the employer; cached; regeneratable (in active development)."],
];

// ── Architecture / tech stack ────────────────────────────────────────────
const stackRows = [
  ["Frontend", "React 19 + Vite 7, TypeScript, Wouter routing, TanStack Query, Tailwind CSS + Radix UI, Recharts, Framer Motion. Served on port 25807."],
  ["Backend", "Express 5 (Node, ESM) bundled with esbuild, Pino structured logging, Helmet + CORS. REST API on port 8080 under /api."],
  ["Database", "PostgreSQL (Neon) via Drizzle ORM. 25 schema files; migrations pushed with drizzle-kit. No raw SQL in app code."],
  ["Auth", "Clerk (user auth, sessions, account deletion). Admin console uses a separate HMAC-signed cookie (tl_admin, 8h) + csrf-csrf double-submit."],
  ["AI", "OpenAI (GPT) via a shared server integration package. Per-employer monthly token quota tracked in token_usage per feature label."],
  ["Storage", "Google Cloud Storage for signatures, documents and cached agreement PDFs (presigned upload URLs). Local fallback dir for dev."],
  ["Email", "Resend (transactional). No-op when RESEND_API_KEY is unset. Fire-and-forget on notification events."],
  ["PDF", "@react-pdf/renderer server-side for certified, formatted agreement downloads (cached in GCS)."],
  ["Contract", "OpenAPI (lib/api-spec/openapi.yaml) is the single source of truth. Orval generates React Query hooks (api-client-react) + Zod schemas (api-zod)."],
];

const monorepoRows = [
  ["artifacts/talentlock", "React + Vite frontend (27 pages, ~119 components)"],
  ["artifacts/api-server", "Express 5 API server (35 route modules)"],
  ["lib/db", "Drizzle ORM schema + PostgreSQL migrations"],
  ["lib/api-spec", "OpenAPI spec + Orval codegen config"],
  ["lib/api-client-react", "Generated React Query hooks (never hand-edited)"],
  ["lib/api-zod", "Generated Zod validation schemas (never hand-edited)"],
  ["lib/integrations-openai-*", "OpenAI clients (server + react)"],
];

// ── API endpoint reference (grouped) ───────────────────────────────────────
const endpointGroups = [
  ["Users & Account", [
    ["GET", "/api/users/me", "Current user profile"],
    ["PUT", "/api/users/me", "Update profile"],
    ["PUT", "/api/users/me/signature", "Save/clear signature image"],
    ["PATCH", "/api/users/me/notification-preferences", "Toggle email opt-in"],
    ["POST", "/api/account/delete-request", "GDPR deletion request"],
    ["POST", "/api/demo/sign-in-token", "Mint demo Clerk token (dev)"],
  ]],
  ["Freelancers & Profiles", [
    ["GET", "/api/freelancers", "List (filters, ?q=, ?availableFrom=, >=60%)"],
    ["GET", "/api/freelancers/:id", "Freelancer detail"],
    ["GET/PUT", "/api/freelancers/me", "My profile (recalcs completeness)"],
    ["GET/PUT", "/api/employers/me", "My employer profile"],
    ["GET", "/api/availability/:freelancerId", "Public availability blocks"],
    ["GET/POST", "/api/availability/me", "My blocks / create block"],
    ["DELETE", "/api/availability/me/:id", "Delete manual block"],
  ]],
  ["Jobs & Bookings", [
    ["GET/POST", "/api/job-requirements", "List / create job (triggers Cruise Mode)"],
    ["GET/PATCH/DELETE", "/api/job-requirements/:id", "Detail / update / delete"],
    ["GET/POST", "/api/bookings", "Paginated list / create (quota-checked)"],
    ["GET/PATCH", "/api/bookings/:id", "Detail / update status + milestones"],
    ["POST", "/api/bookings/:id/negotiate", "Accept / counter rate"],
  ]],
  ["Agreements", [
    ["GET/POST", "/api/agreements", "List / generate (AI, gated on agreed rate)"],
    ["GET", "/api/agreements/:id", "Agreement detail"],
    ["POST", "/api/agreements/:id/sign", "Sign (role derived server-side)"],
    ["GET", "/api/agreements/:id/download", "Certified PDF (fully_signed only)"],
    ["POST", "/api/agreements/:id/redline", "AI redline suggestions (Growth+)"],
    ["PATCH", "/api/agreements/:id/accept-redline", "Accept a redline"],
    ["POST", "/api/agreements/:id/health-score", "AI 0-100 quality score"],
    ["POST", "/api/agreements/:id/summarise", "AI summary (freelancer-only)"],
  ]],
  ["Meetings & AI", [
    ["GET/POST", "/api/meetings", "Paginated list / request meeting"],
    ["GET/PATCH", "/api/meetings/:id", "Detail / update (confirm triggers brief)"],
    ["POST", "/api/meetings/:id/brief", "Generate/regenerate AI brief (202)"],
    ["GET/POST", "/api/openai/conversations", "AI match chat"],
    ["GET", "/api/ai/match-explanation", "Why-they-match reasons"],
    ["POST", "/api/ai/job-description", "JD assistant (generate/improve/check)"],
    ["POST", "/api/ai/proposal", "Freelancer proposal generator"],
    ["POST", "/api/ai/interview-questions", "Interview question generator"],
    ["POST", "/api/ai/rate-suggestion", "Rate recommendation (AI = Growth+)"],
  ]],
  ["Reviews, Notifications, Tokens", [
    ["GET/POST", "/api/reviews (+ /freelancer/:id, /:id/reply)", "Reviews + freelancer reply"],
    ["GET", "/api/notifications", "Paginated notifications"],
    ["GET", "/api/notifications/unread-count", "Unread badge count"],
    ["PATCH", "/api/notifications/read-all | /:id/read", "Mark read"],
    ["GET", "/api/token-usage/me", "Monthly token usage summary"],
    ["GET", "/api/token-usage/conversation/:id", "Per-conversation (Growth+)"],
  ]],
  ["Cruise Mode & TalentSearch", [
    ["GET/POST", "/api/cruise-mode", "Config (freelancer)"],
    ["PATCH", "/api/cruise-mode/{activate|dry-run|pause|deactivate}", "State control"],
    ["POST", "/api/cruise-mode/parse-rules", "AI parse free-form rules"],
    ["GET", "/api/cruise-mode/activity | /stats", "Activity feed + stats"],
    ["GET/POST", "/api/talent-search", "Config (employer)"],
    ["PATCH", "/api/talent-search/{activate|dry-run|deactivate}", "State control"],
    ["GET", "/api/talent-search/activity | /stats", "Activity feed + stats"],
  ]],
  ["Dashboards, Teams, Subscriptions, Admin", [
    ["GET", "/api/dashboard/stats | /activity", "Metrics + activity feed"],
    ["GET", "/api/dashboard/earnings-intelligence", "Freelancer analytics"],
    ["GET", "/api/dashboard/spend-analytics | /hiring-analytics", "Employer analytics"],
    ["GET/POST/PUT", "/api/team (+ /invite, /members, /shortlist)", "Enterprise teams"],
    ["GET", "/api/subscriptions/plans | /me", "Plans + my plan/usage"],
    ["POST", "/api/subscriptions/upgrade", "Upgrade (simulated checkout)"],
    ["GET", "/api/admin/{stats|users|audit|bookings|jobs|...}", "Admin console (HMAC + CSRF)"],
  ]],
];

// ── Plan gating matrices ───────────────────────────────────────────────────
const planCols = ["FL Free", "FL Pro", "Emp Starter", "Emp Growth", "Emp Enterprise"];
const limitRows = [
  ["Active bookings", ["1", "5", "2", "10", "Unlimited"]],
  ["Job posts / month", ["-", "-", "5", "Unlimited", "Unlimited"]],
  ["Express Interests / mo", ["3", "Unlimited", "-", "-", "-"]],
  ["Team seats", ["1", "1", "1", "3", "Unlimited"]],
  ["AI tokens / month", ["none", "none", "50k", "250k", "Unlimited"]],
  ["Price / month", ["$0", "$19", "$49", "$199", "Custom"]],
];
const gateRows = [
  ["Cruise Mode (auto-pitch)", "freelancer_pro", "402 PLAN_LIMIT -> /pricing"],
  ["Create booking (over limit)", "activeBookings quota", "402 PLAN_LIMIT -> /pricing"],
  ["Post job (over limit)", "monthlyJobPosts quota", "402 PLAN_LIMIT -> /pricing"],
  ["Express Interest (over limit)", "monthlyExpressInterests", "402 PLAN_LIMIT -> /pricing"],
  ["AI rate suggestion", "employer_growth+", "Static rate data still shown"],
  ["AI job description assistant", "employer_growth+", "402 PLAN_LIMIT (AI portion)"],
  ["Contract redlining", "employer_growth+", "402 PLAN_LIMIT"],
  ["Per-conversation token breakdown", "employer_growth+", "402 PLAN_LIMIT"],
  ["Any AI feature (match, proposal...)", "within monthly token quota", "402 TOKEN_LIMIT (inline error)"],
  ["Team accounts + analytics", "employer_enterprise", "402 PLAN_LIMIT"],
  ["Agreement PDF download", "all plans (fully_signed)", "403 NOT_FULLY_SIGNED otherwise"],
  ["Agreement AI summary", "freelancer-only", "403 for employers"],
];

// ── Database schema (from project.md) ──────────────────────────────────────
const schemaTables = [
  ["users", "Core accounts linked to Clerk IDs; signature URL, email-notification opt-in"],
  ["freelancer_profiles", "Professional info, skills, rate, availability; averageRating, reviewCount, nextAvailableDate, completenessScore, professionCategory + 12 education fields, profileMatchHash"],
  ["employer_profiles", "Employer company info"],
  ["job_requirements", "Job postings; professionCategory, rateType"],
  ["bookings", "Exclusive engagements; proposedRate, lastProposedBy, negotiationStatus, employer message"],
  ["agreements", "AI legal agreements; both signature URLs + signedAt, status, healthScore(+detail), freelancerSummary"],
  ["conversations / messages", "AI match chat sessions + individual messages"],
  ["meetings", "Discovery meeting requests; briefContent (jsonb), briefGeneratedAt"],
  ["subscriptions", "Per-user billing plan and status"],
  ["audit_logs", "Login/logout + sensitive-action trail; ip, userAgent, entity, metadata"],
  ["token_usage", "AI token consumption per user, per feature, per conversation"],
  ["documents", "Freelancer identity/credential uploads for AI verification"],
  ["reviews", "Employer reviews of completed bookings (one per booking) + reply"],
  ["notifications", "In-app notification rows; server-triggered on key events"],
  ["account_deletion_requests", "GDPR deletion requests (pending -> complete)"],
  ["availability_blocks", "Freelancer unavailability ranges; auto from bookings or manual"],
  ["milestones", "Booking milestones (title, amount, due date, status)"],
  ["job_interests", "Freelancer Express Interest pitches (monthly quota)"],
  ["portfolio_items", "Freelancer portfolio (images, URLs, tags)"],
  ["saved_freelancers", "Employer shortlist (heart icon)"],
  ["teams / team_members / team_shortlist", "Enterprise team accounts, membership + roles, shared shortlist"],
  ["cruise_mode_configs / _activity", "Freelancer auto-pitch rules + per-job evaluation log"],
  ["talent_search_configs / _activity", "Employer auto-scout rules + per-freelancer evaluation log"],
];

// ── Feature delivery status (from spec.md Feature Index) ────────────────────
const featureStatus = [
  ["AI Token Consumption Dashboard", "Complete"],
  ["AI Enhancements", "Complete"],
  ["Document Verification", "Complete"],
  ["Smarter Matching Explanation", "Complete"],
  ["Agreement Templates + Redlining", "Complete"],
  ["Job Description Assistant", "Complete"],
  ["Per-Conversation Token Breakdown", "Complete"],
  ["Reviews & Ratings", "Complete"],
  ["Notifications Centre", "Complete"],
  ["Earnings Intelligence", "Complete"],
  ["Employer Spend Analytics", "Complete"],
  ["Employer Analytics Dashboard", "Complete"],
  ["Availability Calendar (Visual)", "Complete"],
  ["Security Hardening", "Complete"],
  ["Product Gaps", "Complete"],
  ["AI Proposal Generator", "Complete"],
  ["Smart Rate Suggestions", "Complete"],
  ["Team Accounts (Enterprise)", "Complete"],
  ["AI Contract Health Score", "Complete"],
  ["Auth Hardening (Access Control)", "Complete"],
  ["Agreement AI Summary", "Ready"],
  ["Agreement PDF Download", "Ready"],
  ["Cruise Mode", "Ready"],
  ["Teaching Professional Profile", "Ready"],
  ["TalentSearch (Employer Cruise Mode)", "Ready"],
  ["AI Meeting Brief Generator", "Ready"],
];

// ── Security & production-readiness review (from spec.md) ────────────────────
const secReview = [
  ["P0", "IDOR on 11 routes — accessControl.ts + guards", "Done"],
  ["P0", "Auth-gate storage upload URLs + object ACL (namespace by userId)", "Done"],
  ["P1", "Token breakdown — extend to all 9 AI features", "Done"],
  ["P1", "Apply sanitiseText() to 6 missing free-text fields", "Done"],
  ["P1", "Fix premature availability lock (defer to confirmation)", "Done"],
  ["P1", "Add 4 missing endpoint groups to OpenAPI + fix raw fetch", "Todo"],
  ["P2", "Automated tests (Vitest + Supertest) + wire validators to CI", "Todo"],
  ["P2", "Fix N+1 on bookings/meetings/agreements list endpoints", "Todo"],
  ["P2", "Schema & type hygiene (FKs, as any, tx scope, Zod, split routes)", "Todo"],
  ["P2", "Stripe real checkout + webhook signature verification", "Todo"],
  ["P2", "AI match history cap + profile caching", "Todo"],
  ["P2", "Booking acceptance state machine (freelancer accept/decline)", "Todo"],
  ["P3", "Boot guard, CORS lockdown, trust proxy, remove demo route", "Todo"],
];

// ── Spec development process (from spec.md) ────────────────────────────────
const specFiles = [
  ["1. features.md", "Product", "Defines the feature: what it does, modules, plan/quota details, explicit non-goals"],
  ["2. clarify.md", "Product + Eng", "Audits features.md vs architecture; surfaces blockers and open questions"],
  ["3. plan.md", "Engineering", "Binding decisions + exact TypeScript resolving every question. Wins over task.md"],
  ["4. task.md", "Engineering", "Ordered implementation tasks with exact file paths, snippets, acceptance criteria"],
  ["5. UI.md", "Eng + Design", "Every component, page integration, state variant, copy string, a11y requirement"],
  ["6. validation.md", "Engineering", "Phase-by-phase test checklist: API, UI states, security, regression. Gates merge"],
];

// ── Environment variables (from project.md + .env.example) ──────────────────
const envRows = [
  ["DATABASE_URL", "Yes", "PostgreSQL (Neon) connection string"],
  ["CLERK_SECRET_KEY / VITE_CLERK_PUBLISHABLE_KEY", "Yes", "Clerk auth (backend + frontend)"],
  ["SESSION_SECRET / CSRF_SECRET", "Yes", "Admin cookie signing + CSRF double-submit"],
  ["ADMIN_USERNAME / ADMIN_PASSWORD", "Yes", "Admin console login (fail-closed if unset)"],
  ["OPENAI_API_KEY_TALENTLOCK", "Yes", "GPT calls for all AI features"],
  ["ENABLE_DEMO_LOGIN + DEMO_*_CLERK_ID", "Dev", "Mint demo Clerk sessions (never in prod)"],
  ["ALLOWED_ORIGINS / TRUST_PROXY", "Prod", "CORS allow-list + reverse-proxy client IP"],
  ["RESEND_API_KEY / EMAIL_FROM / APP_URL", "Optional", "Transactional email (no-op if unset)"],
  ["DEFAULT_OBJECT_STORAGE_BUCKET_ID / *", "Optional", "GCS for uploads (currently unset -> local fallback)"],
];

// ── Engineering conventions (from project.md Notes for Cursor) ──────────────
const conventions = [
  ["Quota gating", "All quota checks use SELECT ... FOR UPDATE inside a Drizzle transaction; over-limit returns 402 { error, code, planNeeded }."],
  ["Fire-and-forget", "Auto-blocks, createNotification(), logAudit(), sendNotificationEmail() and AI evaluations all use .catch() — never awaited from handlers."],
  ["Input sanitisation", "Every free-text DB write passes through sanitiseText() from lib/sanitise.ts."],
  ["Completeness score", "calculateCompletenessScore() saved atomically in the same db.update() as the profile change."],
  ["Pagination shape", "bookings/agreements/meetings lists return { data, total, page, pageSize, totalPages } — never a plain array."],
  ["Route ordering", "availability/me before /:freelancerId; notifications/read-all before /:id/read; admin/csrf-token before CSRF middleware."],
  ["Generated code", "Never hand-edit lib/api-client-react or lib/api-zod; regenerate via Orval codegen from openapi.yaml."],
  ["Logging", "Use req.log (Pino) in route handlers — never console.log; secrets are redacted."],
  ["GDPR deletion", "Anonymise in a Drizzle transaction first, then call Clerk outside it; on Clerk failure, reset request to pending for retry."],
];

const planRows = [
  ["Freelancer Free — $0", "3 active bookings, 5 interests/mo, listed in Vault"],
  ["Freelancer Pro — $19/mo", "10 active bookings, unlimited interests, Cruise Mode, Pro badge"],
  ["Employer Starter — $49/mo", "3 active bookings, 5 job posts/mo, 50k AI tokens/mo"],
  ["Employer Growth — $199/mo", "15 active bookings, 30 job posts/mo, 250k tokens, redlining + health score"],
  ["Employer Enterprise — Custom", "Unlimited; team accounts + team analytics enabled"],
];

const doc = h(Document, { title: "TalentLock — Application Flow", author: "TalentLock" }, [

  // ── COVER ──
  h(Page, { key: "cover", size: "A4" },
    h(View, { style: s.cover }, [
      h(Text, { key: "k", style: s.coverKicker }, "APPLICATION FLOW"),
      h(Text, { key: "t", style: s.coverTitle }, "TalentLock\nEmployer & Freelancer Journeys"),
      h(View, { key: "r", style: s.coverRule }),
      h(Text, { key: "s", style: s.coverSub }, "A complete walkthrough of both user journeys — from sign-up through exclusive booking, rate negotiation, AI-generated agreements and e-signing — plus the full catalogue of platform features."),
      h(Text, { key: "m1", style: s.coverMeta }, "Secure Freelancer Booking Platform"),
      h(Text, { key: "m2", style: s.coverMeta }, "Generated 12 July 2026"),
    ])
  ),

  // ── OVERVIEW ──
  h(Page, { key: "overview", size: "A4", style: s.page }, [
    Head("The Core Concept"),
    h(Text, { key: "l", style: s.lead }, "TalentLock is an exclusive freelancer booking platform. Unlike a job board, a freelancer is locked to a single employer for the duration of an engagement — becoming unavailable to everyone else. Every journey converges on one handshake."),
    h(Text, { key: "h2a", style: s.h2 }, "Shared entry point (both roles)"),
    Step(1, "Landing & authentication", "Public landing at /. Sign up / sign in via Clerk. New users get a 404 from GET /api/users/me and are routed to onboarding."),
    Step(2, "Onboarding & role choice", "Pick Freelancer or Employer — this branches the entire product. Profiles are created (users + freelancer_profiles or employer_profiles)."),
    Step(3, "Role-specific dashboard", "Both land on /dashboard with metrics tailored to their role."),
    h(Text, { key: "h2b", style: s.h2 }, "The convergence — booking & agreement state machine"),
    h(View, { key: "flow", style: s.flowBox }, [
      FlowStage(GOLD, "pending / negotiating", "employer proposes first"),
      h(Text, { key: "a1", style: s.flowArrow }, "|  accept / counter (turn-based) until..."),
      FlowStage(TEAL, "rate: AGREED", "unlocks agreement generation"),
      h(Text, { key: "a2", style: s.flowArrow }, "|  GPT-4 drafts contract"),
      FlowStage(VIOLET, "draft -> redlined -> partially_signed", "each party e-signs"),
      h(Text, { key: "a3", style: s.flowArrow }, "|  both signatures captured"),
      FlowStage(NAVY, "fully_signed -> booking ACTIVE", "freelancer LOCKED / exclusive"),
      h(Text, { key: "a4", style: s.flowArrow }, "|  work delivered"),
      FlowStage("#16a34a", "completed -> review", "availability freed, rating recorded"),
    ]),
    Callout("Key gate: the AI agreement cannot be generated while negotiationStatus === 'negotiating'. Rate must be mutually agreed first. When both parties sign, the booking automatically transitions to 'active' and the freelancer becomes exclusive."),
    Footer("OVERVIEW"),
  ]),

  // ── EMPLOYER ──
  h(Page, { key: "emp", size: "A4", style: s.page }, [
    Head("The Employer Journey"),
    h(Text, { key: "l", style: s.lead }, "Goal: find the right talent, lock them in exclusively, and formalise the engagement legally — with AI assistance at every decision point."),
    Pills(["Talent Vault", "AI Match", "TalentSearch", "Bookings", "Agreements", "Spend & Hiring Analytics", "Teams"]),
    h(View, { key: "steps", style: { marginTop: 8 } }, employerSteps.map((x, i) => Step(i + 1, x[0], x[1]))),
    Footer("EMPLOYER"),
  ]),

  // ── FREELANCER ──
  h(Page, { key: "free", size: "A4", style: s.page }, [
    Head("The Freelancer Journey"),
    h(Text, { key: "l", style: s.lead }, "Goal: get discovered, get booked on great terms, deliver, and build a verifiable reputation — with AI doing the heavy lifting on discovery and paperwork."),
    Pills(["Resume Auto-build", "Verification", "Availability", "Cruise Mode", "Proposals", "Agreements", "Earnings Intelligence"]),
    h(View, { key: "steps", style: { marginTop: 8 } }, freelancerSteps.map((x, i) => Step(i + 1, x[0], x[1], true))),
    Footer("FREELANCER"),
  ]),

  // ── FEATURE CATALOGUE p1 ──
  h(Page, { key: "feat1", size: "A4", style: s.page }, [
    Head("Full Feature Catalogue (1 / 2)"),
    h(Text, { key: "l", style: s.lead }, "Every capability shipped across the platform. Features 01-20."),
    h(View, { key: "grid", style: s.featRow }, features.slice(0, 20).map((f) => FeatureCard(f[0], f[1], f[2]))),
    Footer("FEATURES"),
  ]),

  // ── FEATURE CATALOGUE p2 + plans ──
  h(Page, { key: "feat2", size: "A4", style: s.page }, [
    Head("Full Feature Catalogue (2 / 2)"),
    h(Text, { key: "l", style: s.lead }, "Features 21-38, followed by the subscription tiers that gate them."),
    h(View, { key: "grid", style: s.featRow }, features.slice(20).map((f) => FeatureCard(f[0], f[1], f[2]))),
    h(Text, { key: "h2p", style: s.h2 }, "Subscription tiers"),
    h(View, { key: "plans" }, planRows.map((r, i) =>
      h(View, { key: i, style: s.trow, wrap: false }, [
        h(Text, { key: "k", style: s.tcellK }, r[0]),
        h(Text, { key: "v", style: s.tcellV }, r[1]),
      ])
    )),
    Callout("Cross-cutting layers apply to both roles: Notifications (in-app + email), Subscription gating (402 with planNeeded), the separate Admin console, and security hardening (per-resource auth, sanitisation, audit logs, GDPR deletion)."),
    Footer("FEATURES"),
  ]),

  // ── ARCHITECTURE & TECH STACK ──
  h(Page, { key: "arch", size: "A4", style: s.page }, [
    Head("Architecture & Tech Stack"),
    h(Text, { key: "l", style: s.lead }, "A pnpm monorepo. The Vite dev server proxies all /api calls to the Express server on port 8080, so the whole app runs behind a single URL."),
    h(Text, { key: "h2a", style: s.h2 }, "Technology by layer"),
    h(View, { key: "stack" }, stackRows.map((r) =>
      h(View, { key: r[0], style: s.stackRow, wrap: false }, [
        h(Text, { key: "t", style: s.stackTier }, r[0]),
        h(Text, { key: "v", style: s.stackVal }, r[1]),
      ])
    )),
    h(Text, { key: "h2b", style: s.h2 }, "Monorepo layout"),
    h(View, { key: "mono" }, monorepoRows.map((r) =>
      h(View, { key: r[0], style: s.trow, wrap: false }, [
        h(Text, { key: "k", style: [s.tcellK, { width: "32%", fontSize: 8.5 }] }, r[0]),
        h(Text, { key: "v", style: [s.tcellV, { width: "68%", fontSize: 8.5 }] }, r[1]),
      ])
    )),
    Callout("API workflow: edit openapi.yaml -> run Orval codegen -> implement the route -> register it -> use the generated hook on the frontend. Generated hooks (api-client-react) and Zod schemas (api-zod) are never hand-edited."),
    Footer("ARCHITECTURE"),
  ]),

  // ── API ENDPOINT REFERENCE ──
  h(Page, { key: "api", size: "A4", style: s.page }, [
    Head("API Endpoint Reference"),
    h(Text, { key: "l", style: s.lead }, "All routes are prefixed /api and (unless noted public) require Clerk auth with per-resource authorization: 401 unauthenticated, 403 non-participant, 404 unknown id."),
    ...endpointGroups.map((g) => EndpointGroup(g[0], g[1])),
    Footer("API REFERENCE"),
  ]),

  // ── PLAN GATING ──
  h(Page, { key: "gating", size: "A4", style: s.page }, [
    Head("Per-Feature Plan Gating"),
    h(Text, { key: "l", style: s.lead }, "Limits are enforced server-side with SELECT ... FOR UPDATE quota checks inside a transaction. Values below are the live values from plans.ts (source of truth)."),
    h(Text, { key: "h2a", style: s.h2 }, "Plan limits"),
    LimitMatrix(),
    h(Text, { key: "h2b", style: s.h2 }, "Feature gating & failure behaviour"),
    GateMatrix(),
    Callout("Two distinct 402 codes: PLAN_LIMIT (hard cap / feature not on plan) redirects to /pricing; TOKEN_LIMIT (monthly AI budget exhausted) shows an inline error and never redirects. Both return { error, code, planNeeded }."),
    Footer("PLAN GATING"),
  ]),

  // ── DATABASE SCHEMA ──
  h(Page, { key: "schema", size: "A4", style: s.page }, [
    Head("Database Schema Reference"),
    h(Text, { key: "l", style: s.lead }, "PostgreSQL via Drizzle ORM (25 schema files in lib/db/src/schema/). Profiles carry both clerkId and userId; access-control helpers join on userId. Bookings use profile IDs; token_usage / notifications use users.id."),
    DataTable(
      [{ w: "34%", label: "Table" }, { w: "66%", label: "Purpose" }],
      schemaTables.map((r) => [r[0], r[1]]),
    ),
    Footer("SCHEMA"),
  ]),

  // ── FEATURE DELIVERY STATUS ──
  h(Page, { key: "status", size: "A4", style: s.page }, [
    Head("Feature Delivery Status"),
    h(Text, { key: "l", style: s.lead }, "26 features tracked in specs/spec.md. 20 are marked Complete (validated); 6 are marked Ready to Execute in the spec index — note their routes are already registered and functional in the running codebase, so the spec status trails the implementation."),
    DataTable(
      [{ w: "72%", label: "Feature" }, { w: "28%", label: "Spec status" }],
      featureStatus.map((r) => [r[0], r[1]]),
      { statusCol: 1 },
    ),
    Footer("DELIVERY STATUS"),
  ]),

  // ── SECURITY & PRODUCTION READINESS ──
  h(Page, { key: "secreview", size: "A4", style: s.page }, [
    Head("Security & Production-Readiness Review"),
    h(Text, { key: "l", style: s.lead }, "Findings from the TalentLock Security & Production Readiness review (2026-06-09). All P0 and P1 items are closed; remaining work is P2 (important, non-blocking) and P3 (production config / enterprise)."),
    DataTable(
      [{ w: "10%", label: "Pri" }, { w: "70%", label: "Item" }, { w: "20%", label: "Status" }],
      secReview.map((r) => [r[0], r[1], r[2]]),
      { statusCol: 2 },
    ),
    Callout("P0 = critical (IDOR, storage ACL) — closed & validated. P1 = high (token breakdown, sanitisation, availability lock) — closed; OpenAPI cleanup outstanding. P2 = tests, N+1 perf, Stripe, state machine. P3 = boot guards, CORS lockdown, remove demo route before production."),
    Footer("SECURITY REVIEW"),
  ]),

  // ── SPEC DEVELOPMENT PROCESS ──
  h(Page, { key: "process", size: "A4", style: s.page }, [
    Head("Spec-Driven Development Process"),
    h(Text, { key: "l", style: s.lead }, "Every feature follows one folder with six ordered files. Each file feeds the next; the Cursor Agent reads only plan.md + task.md (+ UI.md for frontend), never features.md or clarify.md."),
    DataTable(
      [{ w: "20%", label: "File" }, { w: "20%", label: "Owner" }, { w: "60%", label: "Purpose" }],
      specFiles.map((r) => [r[0], r[1], r[2]]),
    ),
    h(Text, { key: "h2", style: s.h2 }, "Execution order & binding rules"),
    Step(1, "project.md first", "Re-read the architecture reference; reuse existing patterns (FOR UPDATE gating, 402 redirect, UTC-month reset) instead of reinventing them.", true),
    Step(2, "Phases run in order", "Database -> Backend (routes -> OpenAPI -> codegen -> typecheck) -> Frontend -> Admin. Never start a phase before the previous one is confirmed.", true),
    Step(3, "plan.md wins", "If plan.md and task.md conflict, plan.md is authoritative. No clarify.md question may remain open in plan.md.", true),
    Step(4, "Non-goals are binding", "If a non-goal surfaces mid-build, stop and re-open the spec rather than silently expanding scope.", true),
    Step(5, "Validation gates merge", "A feature is not merged until every check in validation.md is ticked and the sign-off table is complete.", true),
    Footer("SPEC PROCESS"),
  ]),

  // ── ENVIRONMENT & CONVENTIONS ──
  h(Page, { key: "env", size: "A4", style: s.page }, [
    Head("Environment & Engineering Conventions"),
    h(Text, { key: "h2a", style: s.h2 }, "Environment variables"),
    DataTable(
      [{ w: "44%", label: "Variable" }, { w: "13%", label: "Req", align: "center" }, { w: "43%", label: "Purpose" }],
      envRows.map((r) => [r[0], r[1], r[2]]),
    ),
    h(Text, { key: "h2b", style: s.h2 }, "Engineering conventions"),
    h(View, { key: "conv" }, conventions.map((r) =>
      h(View, { key: r[0], style: s.stackRow, wrap: false }, [
        h(Text, { key: "t", style: [s.stackTier, { width: 108 }] }, r[0]),
        h(Text, { key: "v", style: s.stackVal }, r[1]),
      ])
    )),
    Callout("Monorepo tooling: pnpm workspace (target packages with --filter @workspace/<name>). Push schema with pnpm --filter @workspace/db run push; regenerate the API client with pnpm --filter @workspace/api-spec run codegen; verify with pnpm run typecheck before any frontend work."),
    Footer("ENVIRONMENT"),
  ]),
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "..", "TalentLock-Application-Flow.pdf");
await renderToFile(doc, out);
console.log("PDF written to:", out);
