import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

const COOKIE_NAME = "tl_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "TalentLockAdmin123!";
const DEFAULT_SECRET = "talentlock-dev-secret-do-not-use-in-prod";

let warnedDefaults = false;
function warnIfDefaults(): void {
  if (warnedDefaults) return;
  warnedDefaults = true;
  if (!process.env.ADMIN_PASSWORD) {
    logger.warn(
      "ADMIN_PASSWORD env var not set — admin console is using the well-known default password. Set ADMIN_PASSWORD in production.",
    );
  }
  if (!process.env.SESSION_SECRET) {
    logger.warn(
      "SESSION_SECRET env var not set — admin cookie is signed with a development fallback. Set SESSION_SECRET in production.",
    );
  }
}

function getSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
    password: process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
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
