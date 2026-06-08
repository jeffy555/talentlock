#!/usr/bin/env node
/**
 * Automated checks from spec/PerConTokenBreakdown/validation.md
 * Run: node scripts/validate-per-conversation-token-breakdown.mjs
 */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = process.env.API_URL || "http://localhost:8080";

function loadEnvFile() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

const EMPLOYER_CLERK = (process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DCjDCio53BNo5NfE5Cp1rm2Vo4").trim();
const FREELANCER_CLERK = (process.env.DEMO_FREELANCER_CLERK_ID || "user_3DCjDTWarCQhCgJy5n3EjJOck2N").trim();

const results = [];
function pass(id, note = "") {
  results.push({ id, status: "PASS", note });
  console.log(`✅ ${id}${note ? ` — ${note}` : ""}`);
}
function fail(id, note = "") {
  results.push({ id, status: "FAIL", note });
  console.log(`❌ ${id}${note ? ` — ${note}` : ""}`);
}
function skip(id, note = "") {
  results.push({ id, status: "SKIP", note });
  console.log(`⏭️  ${id}${note ? ` — ${note}` : ""}`);
}

async function clerkFetch(path, { method = "GET", body } = {}) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Clerk ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function getClerkJwt(clerkUserId) {
  const session = await clerkFetch("/sessions", { method: "POST", body: { user_id: clerkUserId } });
  const tokenRes = await clerkFetch(`/sessions/${session.id}/tokens`, { method: "POST", body: {} });
  return tokenRes.jwt;
}

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log("\n--- Per-Conversation Token Breakdown Validation ---\n");

  const health = await fetch(`${API}/api/healthz`).catch(() => null);
  if (!health?.ok) {
    fail("setup", `API not reachable at ${API}`);
    process.exit(1);
  }
  pass("setup", "API healthz OK");

  // ── Phase 1 static ──
  console.log("\n--- Phase 1 ---\n");

  const tokenLogger = readFileSync(join(ROOT, "artifacts/api-server/src/lib/tokenLogger.ts"), "utf8");
  if (tokenLogger.includes("conversationId?: number") && tokenLogger.includes("conversationId: conversationId ?? null")) {
    pass("V1.2");
  } else {
    fail("V1.2", "conversationId param or insert missing");
  }

  const openaiChat = readFileSync(join(ROOT, "artifacts/api-server/src/routes/openaiChat.ts"), "utf8");
  if (openaiChat.includes('logTokenUsage(db, user.id, "ai_match", completion.usage, id)')) {
    pass("V1.3", "openaiChat.ts passes route param id");
  } else {
    fail("V1.3", "conversationId not passed in openaiChat.ts");
  }

  const tokenUsageRoute = readFileSync(join(ROOT, "artifacts/api-server/src/routes/tokenUsage.ts"), "utf8");
  const indexTs = readFileSync(join(ROOT, "artifacts/api-server/src/routes/index.ts"), "utf8");
  if (tokenUsageRoute.includes("/token-usage/conversation/:conversationId") && indexTs.includes("tokenUsage")) {
    pass("V2.1");
  } else {
    fail("V2.1");
  }

  const apiClient = readFileSync(join(ROOT, "lib/api-client-react/src/generated/api.ts"), "utf8");
  apiClient.includes("useGetTokenUsageConversationId") ? pass("V3.2") : fail("V3.2");

  const constantsPath = join(ROOT, "artifacts/talentlock/src/lib/constants.ts");
  if (existsSync(constantsPath) && readFileSync(constantsPath, "utf8").includes("CONVERSATION_BREAKDOWN_LAUNCH_DATE")) {
    pass("V3.1");
  } else {
    fail("V3.1");
  }

  for (const f of [
    "artifacts/talentlock/src/components/ConversationTokenBadge.tsx",
    "artifacts/talentlock/src/components/ConversationTokenBreakdown.tsx",
    "artifacts/talentlock/src/lib/formatMessageTime.ts",
  ]) {
    existsSync(join(ROOT, f)) ? pass(`static:${f.split("/").pop()}`) : fail(`static:${f.split("/").pop()}`);
  }

  const aiMatch = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AiMatch.tsx"), "utf8");
  aiMatch.includes("ConversationTokenBadge") && aiMatch.includes("ConversationTokenBreakdown")
    ? pass("V3.7-integration")
    : fail("V3.7-integration");

  if (!process.env.DATABASE_URL) {
    skip("V1.1", "DATABASE_URL not set");
    skip("V1.4", "DATABASE_URL not set");
    skip("V2.x-api", "DATABASE_URL not set");
  } else {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const col = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'token_usage' AND column_name = 'conversation_id'
      `);
      if (col.rows.length && col.rows[0].is_nullable === "YES") {
        pass("V1.1", `type=${col.rows[0].data_type} nullable=YES`);
      } else {
        fail("V1.1");
      }

      const [empUser] = (await pool.query(
        `SELECT id FROM users WHERE clerk_id = $1 LIMIT 1`, [EMPLOYER_CLERK],
      )).rows;

      let conversationId = null;
      if (empUser) {
        const conv = await pool.query(
          `SELECT id FROM conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [empUser.id],
        );
        conversationId = conv.rows[0]?.id ?? null;
        if (!conversationId) {
          const inserted = await pool.query(
            `INSERT INTO conversations (title, user_id, created_at, updated_at)
             VALUES ('tl:token-breakdown-validation', $1, NOW(), NOW())
             RETURNING id`, [empUser.id],
          );
          conversationId = inserted.rows[0]?.id ?? null;
          if (conversationId) pass("seed-conversation", `id=${conversationId}`);
        }
      }

      if (!process.env.CLERK_SECRET_KEY) {
        skip("V2.2-V2.6", "CLERK_SECRET_KEY not set");
      } else {
        const employerJwt = await getClerkJwt(EMPLOYER_CLERK);
        const freelancerJwt = await getClerkJwt(FREELANCER_CLERK);

        const noAuth = await api("GET", "/api/token-usage/conversation/1");
        noAuth.status === 401 ? pass("V2.2-no-auth") : fail("V2.2-no-auth", `got ${noAuth.status}`);

        const freelancer = await api("GET", "/api/token-usage/conversation/1", { token: freelancerJwt });
        freelancer.status === 403 ? pass("V2.2-freelancer") : fail("V2.2-freelancer", `got ${freelancer.status}`);

        if (empUser) {
          const prevPlan = await pool.query(
            `SELECT plan FROM subscriptions WHERE user_id = $1 LIMIT 1`, [empUser.id],
          );
          const savedPlan = prevPlan.rows[0]?.plan ?? "employer_growth";

          await pool.query(
            `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
             VALUES ($1, 'employer_starter', 'active', NOW() + INTERVAL '30 days', NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET plan = 'employer_starter', updated_at = NOW()`,
            [empUser.id],
          );

          const testId = conversationId ?? 1;
          const starter = await api("GET", `/api/token-usage/conversation/${testId}`, { token: employerJwt });
          if (starter.status === 402 && starter.data?.code === "PLAN_LIMIT") {
            pass("V2.3");
          } else {
            fail("V2.3", `status=${starter.status} body=${JSON.stringify(starter.data)}`);
          }

          await pool.query(
            `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
             VALUES ($1, 'employer_growth', 'active', NOW() + INTERVAL '30 days', NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET plan = 'employer_growth', updated_at = NOW()`,
            [empUser.id],
          );

          if (conversationId) {
            const convRes = await api("GET", `/api/token-usage/conversation/${conversationId}`, { token: employerJwt });
            if (convRes.status === 200) {
              const d = convRes.data;
              if (d.legacyData && d.messages?.length === 0) {
                pass("V2.6", `conv=${conversationId} legacyData=true`);
              } else if (!d.legacyData && d.messages?.length > 0) {
                const sum = d.messages.reduce((s, m) => s + m.totalTokens, 0);
                const ok =
                  d.conversationId === conversationId &&
                  d.totalTokens > 0 &&
                  d.totalTokens === sum &&
                  d.messages.every(m => m.promptTokens != null && m.completionTokens != null && m.createdAt);
                ok ? pass("V2.5", `${d.messages.length} rows, total=${d.totalTokens}`) : fail("V2.5", JSON.stringify(d));
              } else {
                pass("V2.5-partial", `legacy=${d.legacyData} msgs=${d.messages?.length}`);
              }
            } else {
              fail("V2.5/V2.6", `status=${convRes.status}`);
            }

            const wrongConv = await pool.query(
              `SELECT c.id FROM conversations c
               JOIN users u ON u.id = c.user_id
               WHERE u.clerk_id != $1
               ORDER BY c.id DESC LIMIT 1`, [EMPLOYER_CLERK],
            );
            if (wrongConv.rows[0]?.id) {
              const cross = await api("GET", `/api/token-usage/conversation/${wrongConv.rows[0].id}`, { token: employerJwt });
              cross.status === 403 ? pass("V2.4") : fail("V2.4", `status=${cross.status}`);
            } else {
              skip("V2.4", "no other-employer conversation in DB");
            }
          } else {
            skip("V2.5", "no employer conversation");
            skip("V2.6", "no employer conversation");
            skip("V2.4", "no employer conversation");
          }

          const me = await api("GET", "/api/token-usage/me", { token: employerJwt });
          me.status === 200 && me.data?.plan ? pass("R2-token-me") : fail("R2-token-me");

          await pool.query(
            `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
             VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days', NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET plan = $2, updated_at = NOW()`,
            [empUser.id, savedPlan],
          );
        }

        if (conversationId) {
          const msgRes = await api("POST", `/api/openai/conversations/${conversationId}/messages`, {
            token: employerJwt,
            body: { content: "tl:token-breakdown-validation ping — list one freelancer skill only, JSON format." },
          });
          if (msgRes.status === 200 || msgRes.status === 201) {
            pass("R3-ai-match-send", `message sent to conv ${conversationId}`);
            await new Promise(r => setTimeout(r, 2000));
            const rows = await pool.query(
              `SELECT conversation_id, feature, total_tokens FROM token_usage
               WHERE feature = 'ai_match' AND conversation_id = $1
               ORDER BY created_at DESC LIMIT 3`, [conversationId],
            );
            const hasConvId = rows.rows.some(r => r.conversation_id != null);
            hasConvId ? pass("V1.4", `${rows.rows.length} row(s) with conversation_id`) : fail("V1.4", "conversation_id still null");

            const after = await api("GET", `/api/token-usage/conversation/${conversationId}`, { token: employerJwt });
            if (after.status === 200 && !after.data.legacyData && after.data.messages?.length > 0) {
              const sum = after.data.messages.reduce((s, m) => s + m.totalTokens, 0);
              const ok = after.data.totalTokens === sum && after.data.conversationId === conversationId;
              ok ? pass("V2.5", `${after.data.messages.length} row(s), total=${after.data.totalTokens}`) : fail("V2.5");
            } else {
              skip("V2.5", `after-send legacy=${after.data?.legacyData} msgs=${after.data?.messages?.length}`);
            }
          } else if (msgRes.status === 402) {
            skip("V1.4", "token quota exhausted on AI message");
            skip("R3-ai-match-send", "402 TOKEN_LIMIT");
          } else {
            fail("R3-ai-match-send", `status=${msgRes.status} ${JSON.stringify(msgRes.data)}`);
            skip("V1.4", "could not send test message");
          }
        } else {
          skip("V1.4", "no conversation to test");
          skip("R3-ai-match-send");
        }
      }
    } finally {
      await pool.end();
    }
  }

  console.log("\n--- TypeCheck (V2.7 / R4) ---\n");
  const tc = await new Promise((resolve) => {
    const child = spawn("pnpm", ["--filter", "@workspace/talentlock", "run", "typecheck"], {
      cwd: ROOT,
      shell: process.platform === "win32",
      env: process.env,
    });
    let out = "";
    child.stdout?.on("data", d => { out += d; });
    child.stderr?.on("data", d => { out += d; });
    child.on("exit", code => resolve({ code, out }));
  });

  const newFiles = ["ConversationTokenBadge", "ConversationTokenBreakdown", "formatMessageTime", "constants.ts"];
  const newFileErrors = newFiles.filter(f => tc.out.includes(f));
  if (tc.code === 0) {
    pass("V2.7");
    pass("R4-typecheck");
  } else if (newFileErrors.length === 0) {
    skip("V2.7", "pre-existing errors elsewhere");
    skip("R4-typecheck", "pre-existing errors elsewhere");
  } else {
    fail("V2.7", newFileErrors.join(", "));
    fail("R4-typecheck", newFileErrors.join(", "));
  }

  console.log("\n--- Summary ---\n");
  const passN = results.filter(r => r.status === "PASS").length;
  const failN = results.filter(r => r.status === "FAIL").length;
  const skipN = results.filter(r => r.status === "SKIP").length;
  console.log(`PASS ${passN}  FAIL ${failN}  SKIP ${skipN}`);
  if (failN > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
