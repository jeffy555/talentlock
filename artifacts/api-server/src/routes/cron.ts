/**
 * Machine-only scheduled job endpoints. Deliberately mounted at /api/cron,
 * NOT /api/admin — see project.md "Cursor notes — Credential Expiry Tracking"
 * for why the admin CSRF middleware must not apply to these routes.
 */
import { Router, type IRouter } from "express";

import { requireCronSecret } from "../lib/cronAuth";
import { runCredentialExpiryScan } from "../lib/credentialExpiryScan";

const router: IRouter = Router();

router.post("/cron/credential-expiry", requireCronSecret, async (req, res) => {
  try {
    const result = await runCredentialExpiryScan(req.log);
    req.log.info({ result }, "Credential expiry scan complete");
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err }, "Credential expiry scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;
