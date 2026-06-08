import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClerkClient } from "@clerk/express";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = join(root, ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1].trim()] = value;
  }
}

const BASE = "http://localhost:8080/api";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function clerkToken(userId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId });
  const token = await clerk.sessions.getToken(session.id);
  return token.jwt;
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("\n=== Availability API Smoke Tests ===\n");

  const health = await api("/healthz");
  record("GET /healthz", health.status === 200 && health.body?.status === "ok", `status ${health.status}`);

  const list = await api("/freelancers?limit=5");
  const freelancers = Array.isArray(list.body) ? list.body : [];
  record("GET /freelancers", list.status === 200 && freelancers.length > 0, `${freelancers.length} profiles`);

  const demoFreelancer = freelancers.find((f) => f.clerkId === DEMO_FREELANCER) ?? freelancers[0];
  const freelancerId = demoFreelancer?.id;
  const authClerkId = demoFreelancer?.clerkId;
  record(
    "GET /freelancers includes nextAvailableDate",
    demoFreelancer && "nextAvailableDate" in demoFreelancer,
    `id=${freelancerId}, nextAvailableDate=${demoFreelancer?.nextAvailableDate ?? "null"}`,
  );

  if (!freelancerId) {
    console.log("\nCannot continue without a freelancer id.");
    process.exit(1);
  }

  const pub = await api(`/availability/${freelancerId}`);
  record("GET /availability/:freelancerId (public)", pub.status === 200, `status ${pub.status}`);
  const pubBlock = pub.body?.blocks?.[0];
  const publicOk = !pubBlock || (!("label" in pubBlock) && !("bookingId" in pubBlock));
  record("Public response omits label/bookingId", publicOk, pubBlock ? `reason=${pubBlock.reason}` : "no blocks");

  const unauth = await api("/availability/me");
  record("GET /availability/me unauthenticated", unauth.status === 401, `status ${unauth.status}`);

  let freelancerToken;
  try {
    freelancerToken = await clerkToken(authClerkId);
    record("Clerk freelancer session", !!freelancerToken, authClerkId);
  } catch (err) {
    record("Clerk freelancer session", false, err.message);
  }

  if (freelancerToken) {
    const me = await api("/availability/me", {
      headers: { Authorization: `Bearer ${freelancerToken}` },
    });
    record("GET /availability/me (freelancer)", me.status === 200, `status ${me.status}, blocks=${me.body?.blocks?.length ?? 0}`);

    const start = futureDate(30);
    const end = futureDate(37);
    const created = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${freelancerToken}` },
      body: JSON.stringify({ startDate: start, endDate: end, reason: "holiday", label: "Smoke test block" }),
    });
    record("POST /availability/me (holiday)", created.status === 201, `status ${created.status}, id=${created.body?.id}`);
    const blockId = created.body?.id;

    const pubAfter = await api(`/availability/${freelancerId}`);
    const found = pubAfter.body?.blocks?.some((b) => b.startDate === start && b.endDate === end);
    record("Public calendar shows new block", found === true, `${start}–${end}`);

    const badBooked = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${freelancerToken}` },
      body: JSON.stringify({ startDate: start, endDate: end, reason: "booked" }),
    });
    record("POST reason=booked rejected", badBooked.status === 400, `status ${badBooked.status}`);

    if (blockId) {
      const deleted = await api(`/availability/me/${blockId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${freelancerToken}` },
      });
      record("DELETE /availability/me/:id", deleted.status === 200 && deleted.body?.success === true, `status ${deleted.status}`);
    }
  }

  let employerToken;
  try {
    employerToken = await clerkToken(DEMO_EMPLOYER);
    record("Clerk employer session", !!employerToken, DEMO_EMPLOYER);
  } catch (err) {
    record("Clerk employer session", false, err.message);
  }

  if (employerToken) {
    const empMe = await api("/availability/me", {
      headers: { Authorization: `Bearer ${employerToken}` },
    });
    record("GET /availability/me (employer → 403)", empMe.status === 403, `status ${empMe.status}`);
  }

  const filtered = await api(`/freelancers?availableFrom=${futureDate(180)}&limit=5`);
  record(
    "GET /freelancers?availableFrom= filter",
    filtered.status === 200 && Array.isArray(filtered.body),
    `returned ${filtered.body?.length ?? 0}`,
  );

  const proxy = await fetch("http://localhost:25807/api/healthz");
  const proxyBody = await proxy.json();
  record("Vite proxy /api → backend", proxy.status === 200 && proxyBody?.status === "ok", `status ${proxy.status}`);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} passed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
