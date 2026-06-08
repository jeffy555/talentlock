#!/usr/bin/env node
/** Quick smoke test for admin CSRF (Phase 3). */
const base = process.env.API_BASE ?? "http://localhost:8080";

async function main() {
  const tokenRes = await fetch(`${base}/api/admin/csrf-token`, { credentials: "include" });
  if (!tokenRes.ok) throw new Error(`csrf-token failed: ${tokenRes.status}`);
  const setCookie = tokenRes.headers.getSetCookie?.() ?? [];
  const { token } = await tokenRes.json();
  if (!token) throw new Error("missing token");

  const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  const noHeader = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ username: "x", password: "y" }),
  });
  if (noHeader.status !== 403) {
    throw new Error(`expected 403 without x-csrf-token, got ${noHeader.status}`);
  }

  const withHeader = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": token,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ username: "x", password: "y" }),
  });
  if (withHeader.status === 403) {
    throw new Error("valid CSRF token rejected");
  }

  console.log("CSRF smoke OK:", { tokenLen: token.length, loginStatus: withHeader.status });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
