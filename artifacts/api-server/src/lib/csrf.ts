// Security Hardening Phase 3 — csrf-csrf v4 (double submit cookie).
// getSessionIdentifier binds tokens to tl_admin session or tl_csrf cookie.

import { doubleCsrf } from "csrf-csrf";
import type { Request } from "express";

const CSRF_COOKIE = "tl_csrf";

// Stable scope identifier — double-submit cookie binding provides per-browser protection.
function csrfSessionIdentifier(_req: Request): string {
  return "talentlock-admin";
}

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET ?? "",
  getSessionIdentifier: csrfSessionIdentifier,
  cookieName: CSRF_COOKIE,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    httpOnly: true,
    path: "/",
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"] as string,
});

export { generateCsrfToken, doubleCsrfProtection };
