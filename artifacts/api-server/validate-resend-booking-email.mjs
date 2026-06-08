#!/usr/bin/env node
/** Trigger booking_status_changed email to employer (loavesflash@gmail.com). */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClerkClient } from "@clerk/express";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = "http://localhost:8080/api";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

async function clerkToken(id) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId: id });
  return (await clerk.sessions.getToken(session.id)).jwt;
}

async function api(method, path, body, jwt) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: text ? JSON.parse(text) : null }; }
  catch { return { status: res.status, data: text }; }
}

const bookingId = Number(process.argv[2] || 17);
const employerJwt = await clerkToken(DEMO_EMPLOYER);
const freelancerJwt = await clerkToken(DEMO_FREELANCER);

await api("PATCH", "/users/me/notification-preferences", { emailNotificationsEnabled: true }, employerJwt);

const patch = await api("PATCH", `/bookings/${bookingId}`, { status: "active" }, freelancerJwt);
console.log("PATCH booking status:", patch.status, JSON.stringify(patch.data));

await new Promise((r) => setTimeout(r, 3000));

const notifs = await api("GET", "/notifications?page=1&pageSize=5", null, employerJwt);
const hit = (notifs.data?.data ?? []).find((n) => n.type === "booking_status_changed" && String(n.entityId) === String(bookingId));
console.log("Employer in-app notification:", hit ? hit.message : "(not found)");
console.log("Check loavesflash@gmail.com for: Booking status updated on TalentLock");
