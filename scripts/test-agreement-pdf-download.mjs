#!/usr/bin/env node
/** Quick smoke test for agreement PDF download */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClerkClient } from "@clerk/express";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = "http://localhost:8080/api";
const agreementId = process.argv[2] || "11";

async function tokenFor(clerkUserId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId: clerkUserId });
  return (await clerk.sessions.getToken(session.id)).jwt;
}

async function main() {
  const employerId = process.env.DEMO_EMPLOYER_CLERK_ID;
  if (!employerId) throw new Error("DEMO_EMPLOYER_CLERK_ID missing");
  const jwt = await tokenFor(employerId);
  const res = await fetch(`${API}/agreements/${agreementId}/download`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log("status:", res.status);
  console.log("content-type:", res.headers.get("content-type"));
  if (!res.ok) {
    console.log("body:", await res.text());
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("pdf bytes:", buf.length);
  console.log("header:", buf.subarray(0, 5).toString());
  if (buf.subarray(0, 5).toString() !== "%PDF-") {
    console.error("Not a valid PDF");
    process.exit(1);
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
