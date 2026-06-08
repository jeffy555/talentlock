/**
 * @deprecated Removed in document verification Phase 2.
 * Use POST /api/documents/upload-url and POST /api/documents/confirm instead.
 */
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/verify/documents", (_req, res) => {
  res.status(410).json({
    error: "This endpoint has been removed. Use /api/documents/upload-url and /api/documents/confirm.",
  });
});

export default router;
