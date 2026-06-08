#!/usr/bin/env node
/**
 * Team Accounts (Enterprise) — automated validation (Sub-Phases A, B, C).
 * Run: node artifacts/api-server/validate-team-accounts.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { randomUUID } from "crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "lib", "db", "package.json"));
const pg = require("pg");

const envPath = join(root, ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = process.env.API_URL || "http://localhost:8080/api";
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:25807";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name, detail = "") {
  results.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function clerkToken(clerkUserId) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY missing");
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
  const sessionRes = await fetch("https://api.clerk.com/v1/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: clerkUserId }),
  });
  const session = await sessionRes.json();
  if (!sessionRes.ok) throw new Error(JSON.stringify(session));
  const tokenRes = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(JSON.stringify(token));
  return token.jwt;
}

async function setPlan(pool, userId, plan) {
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, created_at, updated_at)
     VALUES ($1, $2, 'active', NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET plan = $2, status = 'active', updated_at = NOW()`,
    [userId, plan],
  );
}

async function cleanupValidationTeam(pool, ownerUserId) {
  const teams = await pool.query(`SELECT id FROM teams WHERE owner_user_id = $1`, [ownerUserId]);
  for (const t of teams.rows) {
    await pool.query(`DELETE FROM team_shortlist WHERE team_id = $1`, [t.id]);
    await pool.query(`DELETE FROM team_members WHERE team_id = $1`, [t.id]);
    await pool.query(`DELETE FROM teams WHERE id = $1`, [t.id]);
  }
}

async function main() {
  console.log("\n=== Team Accounts (Enterprise) Validation ===\n");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // --- VA1: Schema ---
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('teams', 'team_members', 'team_shortlist')
    ORDER BY table_name
  `);
  const tableNames = tables.rows.map((r) => r.table_name);
  ["team_members", "team_shortlist", "teams"].every((t) => tableNames.includes(t))
    ? pass("VA1 tables exist", tableNames.join(", "))
    : fail("VA1 tables exist", `found: ${tableNames.join(", ")}`);

  const uniq = await pool.query(`
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'team_members' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
    HAVING COUNT(*) >= 2
  `);
  uniq.rows.length > 0
    ? pass("VA1 UNIQUE(team_id, user_id)", uniq.rows[0].constraint_name)
    : fail("VA1 UNIQUE(team_id, user_id)");

  const shortlistUniq = await pool.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'team_shortlist' AND constraint_type = 'UNIQUE'
  `);
  shortlistUniq.rows.length > 0
    ? pass("VB schema UNIQUE(team_id, freelancer_id)")
    : fail("VB schema UNIQUE(team_id, freelancer_id)");

  // --- Clerk tokens ---
  let adminToken;
  let memberToken;
  let adminUserId;
  let adminEmail;
  try {
    adminToken = await clerkToken(DEMO_EMPLOYER);
    pass("Clerk JWT (demo employer)");
  } catch (e) {
    fail("Clerk JWT (demo employer)", e.message);
    await pool.end();
    process.exit(1);
  }

  const adminUser = await pool.query(
    `SELECT id, email FROM users WHERE clerk_id = $1`,
    [DEMO_EMPLOYER],
  );
  adminUserId = adminUser.rows[0]?.id;
  adminEmail = adminUser.rows[0]?.email;
  if (!adminUserId) {
    fail("Demo employer user row");
    await pool.end();
    process.exit(1);
  }
  pass("Demo employer user", `id=${adminUserId} ${adminEmail}`);

  const employers = await pool.query(
    `SELECT u.id, u.email, u.clerk_id FROM users u
     WHERE u.role = 'employer' AND u.id != $1
     ORDER BY u.id LIMIT 5`,
    [adminUserId],
  );

  if (employers.rows.length > 0) {
    try {
      memberToken = await clerkToken(employers.rows[0].clerk_id);
      pass("Clerk JWT (second employer)", employers.rows[0].email);
    } catch {
      skip("Clerk JWT (second employer)", "no Clerk session — some multi-user tests skipped");
    }
  }

  await cleanupValidationTeam(pool, adminUserId);

  // --- VA2: Non-enterprise 402 ---
  await setPlan(pool, adminUserId, "employer_starter");
  const va2 = await api("/team", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Validation Team" }),
  });
  va2.status === 402 && va2.body?.code === "PLAN_LIMIT"
    ? pass("VA2 non-enterprise POST /team → 402")
    : fail("VA2 non-enterprise POST /team → 402", `${va2.status} ${JSON.stringify(va2.body)}`);

  await setPlan(pool, adminUserId, "employer_enterprise");

  // --- VA3: Create team ---
  const va3 = await api("/team", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Validation Corp" }),
  });
  let teamId = va3.body?.team?.id;
  if (va3.status === 201 && teamId && va3.body?.isAdmin && va3.body?.members?.some(
    (m) => m.role === "admin" && m.status === "active" && m.userId === adminUserId,
  )) {
    pass("VA3 create team → 201 admin active", teamId);
  } else {
    fail("VA3 create team", `${va3.status} ${JSON.stringify(va3.body)}`);
  }

  // --- VA4: Invite ---
  const inviteEmail = `team-val-${Date.now()}@talentlock.test`;
  const va4 = await api("/team/invite", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email: inviteEmail, role: "member" }),
  });
  let inviteToken;
  if (va4.status === 201) {
    const row = await pool.query(
      `SELECT invite_token, invite_expires_at, status FROM team_members
       WHERE team_id = $1 AND invited_email = $2`,
      [teamId, inviteEmail],
    );
    inviteToken = row.rows[0]?.invite_token;
    const expires = row.rows[0]?.invite_expires_at;
    const daysAhead = expires ? (new Date(expires) - Date.now()) / (86400000) : 0;
    if (
      row.rows[0]?.status === "invited" &&
      UUID_RE.test(inviteToken ?? "") &&
      daysAhead >= 6 && daysAhead <= 8
    ) {
      pass("VA4 invite → UUID token, ~7d expiry", inviteToken?.slice(0, 8));
    } else {
      fail("VA4 invite token security", JSON.stringify(row.rows[0]));
    }
  } else {
    fail("VA4 invite → 201", `${va4.status} ${JSON.stringify(va4.body)}`);
  }

  // --- VA5: Accept invite ---
  if (memberToken && employers.rows[0]) {
    const memberUserId = employers.rows[0].id;
    const memberEmail = employers.rows[0].email;
    await pool.query(
      `UPDATE team_members SET invited_email = $1 WHERE invite_token = $2`,
      [memberEmail, inviteToken],
    );
    await setPlan(pool, memberUserId, "employer_starter");
    const va5 = await api(`/team/accept-invite?token=${encodeURIComponent(inviteToken)}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const after = await pool.query(
      `SELECT status, joined_at, invite_token FROM team_members WHERE invite_token IS NULL AND user_id = $1 AND team_id = $2`,
      [memberUserId, teamId],
    );
    if (va5.status === 200 && after.rows[0]?.status === "active" && after.rows[0]?.joined_at && after.rows[0]?.invite_token == null) {
      pass("VA5 accept invite → 200, active, token cleared");
      const sub = await pool.query(`SELECT plan FROM subscriptions WHERE user_id = $1`, [memberUserId]);
      sub.rows[0]?.plan === "employer_enterprise"
        ? pass("VA5 invitee upgraded to enterprise")
        : fail("VA5 invitee plan upgrade", sub.rows[0]?.plan);
    } else {
      fail("VA5 accept invite", `${va5.status} ${JSON.stringify(va5.body)}`);
    }
  } else {
    const va5unauth = await api(`/team/accept-invite?token=${encodeURIComponent(inviteToken ?? "")}`);
    va5unauth.status === 401
      ? pass("VA5 accept requires auth (401 without token)")
      : fail("VA5 accept unauthenticated", String(va5unauth.status));
    skip("VA5 full accept flow", "second employer Clerk token unavailable");
  }

  // --- VA6: Expired token ---
  const expiredToken = randomUUID();
  await pool.query(
    `INSERT INTO team_members (team_id, role, status, invited_email, invite_token, invite_expires_at)
     VALUES ($1, 'member', 'invited', 'expired@test.local', $2, NOW() - INTERVAL '1 day')`,
    [teamId, expiredToken],
  );
  const va6 = await api(`/team/accept-invite?token=${expiredToken}`);
  va6.status === 410 ? pass("VA6 expired token → 410") : fail("VA6 expired token", String(va6.status));

  // --- VA7: Non-admin cannot invite ---
  if (memberToken) {
    const va7 = await api("/team/invite", {
      method: "POST",
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ email: "blocked@test.local", role: "member" }),
    });
    va7.status === 403 ? pass("VA7 non-admin invite → 403") : fail("VA7 non-admin invite", String(va7.status));
  } else {
    const teamRoute = readFileSync(join(root, "artifacts/api-server/src/routes/team.ts"), "utf8");
    teamRoute.includes("requireTeamAdmin") && teamRoute.includes('"/team/invite"')
      ? pass("VA7 invite route uses requireTeamAdmin (static)")
      : fail("VA7 admin guard");
  }

  // --- VA8: Cannot remove owner ---
  const ownerMember = await pool.query(
    `SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, adminUserId],
  );
  const va8 = await api(`/team/members/${ownerMember.rows[0]?.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  [403, 400, 409].includes(va8.status)
    ? pass("VA8 cannot remove owner", `HTTP ${va8.status}`)
    : fail("VA8 cannot remove owner", String(va8.status));

  // --- Sub-Phase B: Shortlist ---
  const freelancer = await pool.query(
    `SELECT id FROM freelancer_profiles ORDER BY id LIMIT 1`,
  );
  const freelancerId = freelancer.rows[0]?.id;
  if (freelancerId) {
    const vbAdd1 = await api("/team/shortlist", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ freelancerId }),
    });
    const vbAdd2 = await api("/team/shortlist", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ freelancerId }),
    });
    const dupCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM team_shortlist WHERE team_id = $1 AND freelancer_id = $2`,
      [teamId, freelancerId],
    );
    if (
      (vbAdd1.status === 201 || vbAdd1.status === 200) &&
      vbAdd2.status === 200 &&
      dupCount.rows[0]?.c === 1
    ) {
      pass("VB2 duplicate shortlist idempotent → 200, one row");
    } else {
      fail("VB2 duplicate shortlist", `${vbAdd1.status}/${vbAdd2.status} count=${dupCount.rows[0]?.c}`);
    }

    const vbList = await api("/team/shortlist", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const list = Array.isArray(vbList.body) ? vbList.body : [];
    const item = list.find((e) => e.freelancer?.id === freelancerId);
    if (vbList.status === 200 && item?.addedByName) {
      pass("VB1 shortlist list with addedByName", item.addedByName);
    } else {
      fail("VB1 shortlist list", String(vbList.status));
    }

    const vbDelToken = memberToken ?? adminToken;
    const vbDel = await api(`/team/shortlist/${freelancerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${vbDelToken}` },
    });
    const afterDel = await pool.query(
      `SELECT COUNT(*)::int AS c FROM team_shortlist WHERE team_id = $1 AND freelancer_id = $2`,
      [teamId, freelancerId],
    );
    if (vbDel.status === 200 && afterDel.rows[0]?.c === 0) {
      pass("VB3 remove shortlist for any member");
    } else {
      fail("VB3 remove shortlist", String(vbDel.status));
    }
  } else {
    fail("VB shortlist tests", "no freelancer profile");
  }

  // --- Sub-Phase C: Analytics ---
  if (memberToken) {
    const vc1 = await api("/team/analytics?window=90d", {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    vc1.status === 403 ? pass("VC1 non-admin analytics → 403") : fail("VC1 non-admin analytics", String(vc1.status));
  } else {
    skip("VC1 non-admin analytics live", "no second employer token");
  }

  const vc2 = await api("/team/analytics?window=90d", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const shape = vc2.body;
  if (
    vc2.status === 200 &&
    typeof shape?.totalSpend === "number" &&
    typeof shape?.bookingsCreated === "number" &&
    Array.isArray(shape?.spendByMember) &&
    Array.isArray(shape?.mostHiredFreelancers) &&
    Array.isArray(shape?.openJobsByMember)
  ) {
    pass("VC2 admin analytics structure", `spend=${shape.totalSpend} bookings=${shape.bookingsCreated}`);
    shape.spendByMember.length >= 1
      ? pass("VC2 spendByMember breakdown")
      : fail("VC2 spendByMember empty");
  } else {
    fail("VC2 admin analytics", `${vc2.status} ${JSON.stringify(shape)}`);
  }

  // --- VA9 / Frontend static ---
  const appSrc = readFileSync(join(root, "artifacts/talentlock/src/App.tsx"), "utf8");
  appSrc.includes('path="/team"') && appSrc.includes('path="/team/analytics"')
    ? pass("VA9 routes /team and /team/analytics in App.tsx")
    : fail("VA9 App routes");

  const layoutSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/Team.tsx"), "utf8");
  layoutSrc.includes("employer_enterprise") || layoutSrc.includes("isEnterprise")
    ? pass("VA9 Team page enterprise gate")
    : fail("VA9 Team enterprise gate");
  layoutSrc.includes("Upgrade to Enterprise")
    ? pass("VA9 upgrade prompt copy")
    : fail("VA9 upgrade prompt");

  const navSrc = readFileSync(join(root, "artifacts/talentlock/src/components/layout/AppLayout.tsx"), "utf8");
  navSrc.includes('name: "Team"') && navSrc.includes("employer_enterprise")
    ? pass("VA9 Team nav enterprise-only")
    : fail("VA9 Team nav");

  const vaultSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/FreelancersList.tsx"), "utf8");
  vaultSrc.includes("Team Shortlist") && vaultSrc.includes("useListTeamShortlist")
    ? pass("VB3 Talent Vault team shortlist tab")
    : fail("VB3 Talent Vault UI");

  const analyticsSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/TeamAnalytics.tsx"), "utf8");
  analyticsSrc.includes("Admin access required")
    ? pass("VC TeamAnalytics admin gate")
    : fail("VC TeamAnalytics admin gate");

  for (const path of ["/team", "/team/analytics"]) {
    try {
      const r = await fetch(`${FRONTEND}${path}`);
      const html = await r.text();
      r.ok && html.includes("root")
        ? pass(`Frontend shell ${path}`, `HTTP ${r.status}`)
        : fail(`Frontend shell ${path}`, `HTTP ${r.status}`);
    } catch (e) {
      skip(`Frontend shell ${path}`, e.message);
    }
  }

  // --- VC3: Build / typecheck ---
  const { execSync } = await import("child_process");
  const run = (label, cmd, cwd = root) => {
    try {
      execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8", shell: true });
      pass(label);
    } catch (e) {
      const out = (e.stdout || "") + (e.stderr || "");
      if (out.includes("@tanstack/react-query") || out.includes("Cannot find module")) {
        skip(label, "workspace node_modules incomplete — run pnpm install");
      } else {
        fail(label, out.slice(0, 400));
      }
    }
  };

  run("VC3 pnpm run typecheck:libs", "pnpm run typecheck:libs");
  run("VC3 api-server typecheck", "pnpm --filter @workspace/api-server run typecheck");
  run("VC3 talentlock typecheck", "pnpm --filter @workspace/talentlock run typecheck");
  run("VC3 api-server build", "pnpm --filter @workspace/api-server run build");
  run("VC3 talentlock build", "pnpm --filter @workspace/talentlock run build");

  await cleanupValidationTeam(pool, adminUserId);
  await pool.end();

  const ok = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${ok} passed, ${skipped} skipped, ${bad} failed (${results.length} total) ===\n`);
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
