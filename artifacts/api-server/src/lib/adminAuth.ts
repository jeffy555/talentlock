import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const COOKIE_NAME = "tl_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const DEFAULT_USERNAME = "admin";

// SECURITY: never ship a hardcoded signing secret or admin password. A secret
// baked into source lets anyone forge a valid `tl_admin` cookie; a default
// password is a public backdoor. When SESSION_SECRET is unset we fall back to a
// random per-process secret (existing sessions won't survive a restart, but no
// one can forge one). When ADMIN_PASSWORD is unset, admin login is disabled.
let ephemeralSecret: string | null = null;

let warnedDefaults = false;
function warnIfDefaults(): void {
  if (warnedDefaults) return;
  warnedDefaults = true;
  if (!process.env.ADMIN_PASSWORD) {
    logger.warn(
      "ADMIN_PASSWORD env var not set — admin login is DISABLED. Set ADMIN_PASSWORD to enable the admin console.",
    );
  }
  if (!process.env.SESSION_SECRET) {
    logger.warn(
      "SESSION_SECRET env var not set — admin cookies are signed with a random per-process secret and will not persist across restarts. Set SESSION_SECRET in production.",
    );
  }
}

function getSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralSecret;
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
    password: process.env.ADMIN_PASSWORD ?? "",
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  // Convert via SHA-256 to ensure equal-length buffers regardless of input lengths.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyAdminCredentials(username: unknown, password: unknown): boolean {
  warnIfDefaults();
  if (typeof username !== "string" || typeof password !== "string") return false;
  const creds = getAdminCredentials();
  // Fail closed: with no configured password there is no valid credential.
  if (!creds.password) return false;
  // Compare both fields with timing-safe equality so neither short-circuits.
  const userOk = timingSafeEqualStr(username, creds.username);
  const passOk = timingSafeEqualStr(password, creds.password);
  return userOk && passOk;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function issueAdminCookie(res: Response): void {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `admin:${expiresAt}`;
  const signature = sign(payload);
  const value = `${payload}.${signature}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function isAdminRequest(req: Request): boolean {
  const raw = (req as any).cookies?.[COOKIE_NAME];
  if (typeof raw !== "string") return false;
  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = sign(payload);
  // Timing-safe signature comparison.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  const [marker, expiresStr] = payload.split(":");
  if (marker !== "admin") return false;
  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return true;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  next();
}
