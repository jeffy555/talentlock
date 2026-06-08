import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isAdminRequest } from "../lib/adminAuth";
import {
  guessContentType,
  readLocalObject,
  usesLocalObjectStorage,
  verifyLocalSignedUrl,
  writeLocalObject,
} from "../lib/localObjectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.put(
  "/storage/local-upload",
  express.raw({ type: () => true, limit: "11mb" }),
  async (req: Request, res: Response) => {
    const key = String(req.query.key ?? "");
    const expires = Number(req.query.expires);
    const sig = String(req.query.sig ?? "");

    if (!key || !verifyLocalSignedUrl("PUT", key, expires, sig)) {
      res.status(403).json({ error: "Invalid or expired upload URL" });
      return;
    }

    try {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty upload body" });
        return;
      }
      await writeLocalObject(key, body);
      res.status(200).end();
    } catch (error) {
      req.log.error({ err: error, key }, "Local object upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

router.get("/storage/local-read", async (req: Request, res: Response) => {
  const key = String(req.query.key ?? "");
  const expires = Number(req.query.expires);
  const sig = String(req.query.sig ?? "");

  if (!key || !verifyLocalSignedUrl("GET", key, expires, sig)) {
    res.status(403).json({ error: "Invalid or expired read URL" });
    return;
  }

  try {
    const buffer = await readLocalObject(key);
    res.setHeader("Content-Type", guessContentType(key));
    res.setHeader("Cache-Control", "private, max-age=900");
    res.send(buffer);
  } catch (error) {
    req.log.error({ err: error, key }, "Local object read failed");
    res.status(404).json({ error: "Object not found" });
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { fileName, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { fileName, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    if (wildcardPath.startsWith("documents/")) {
      if (!isAdminRequest(req)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    if (usesLocalObjectStorage()) {
      try {
        const buffer = await readLocalObject(wildcardPath);
        res.setHeader("Content-Type", guessContentType(wildcardPath));
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(buffer);
        return;
      } catch {
        res.status(404).json({ error: "Object not found" });
        return;
      }
    }

    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
