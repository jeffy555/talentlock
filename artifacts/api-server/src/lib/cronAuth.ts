/**
 * Credential Expiry Tracking — shared-secret auth for machine-triggered cron routes.
 * NOT the Clerk-based admin session: these routes are called by an external
 * scheduler (GitHub Actions), never by a browser, so there is no CSRF concern
 * and no cookie to check. Deliberately mounted outside /api/admin — see
 * project.md "Cursor notes — Credential Expiry Tracking".
 */
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    res.status(500).json({ error: "Cron not configured" });
    return;
  }
  const provided = req.header("x-cron-secret");
  if (typeof provided !== "string" || !timingSafeEqualStr(provided, configured)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
