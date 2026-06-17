import crypto from "node:crypto";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SECRET = "talentlock-dev-secret-do-not-use-in-prod";

function signingSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

/** Use on-disk storage when Replit/GCS object storage is not configured. */
export function usesLocalObjectStorage(): boolean {
  return !process.env.PRIVATE_OBJECT_DIR?.trim();
}

function localStorageRoot(): string {
  if (process.env.LOCAL_OBJECT_STORAGE_DIR?.trim()) {
    return path.resolve(process.env.LOCAL_OBJECT_STORAGE_DIR);
  }
  return path.resolve(process.cwd(), "../../.local-object-storage");
}

function resolveLocalPath(relativeKey: string): string {
  const normalized = relativeKey.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid storage key");
  }
  return path.join(localStorageRoot(), normalized);
}

function signPayload(method: string, key: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(`${method}:${key}:${expiresAt}`)
    .digest("base64url");
}

export function verifyLocalSignedUrl(
  method: "GET" | "PUT",
  key: string,
  expiresAt: number,
  sig: string,
): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signPayload(method, key, expiresAt);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function getLocalApiBase(): string {
  const configured = process.env.API_PUBLIC_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const port = process.env.PORT || "8080";
  return `http://localhost:${port}`;
}

export function createLocalSignedUrl(
  relativeKey: string,
  method: "GET" | "PUT",
  ttlSec: number,
): string {
  const expiresAt = Date.now() + ttlSec * 1000;
  const sig = signPayload(method, relativeKey, expiresAt);
  const params = new URLSearchParams({
    key: relativeKey,
    expires: String(expiresAt),
    sig,
  });
  const route = method === "PUT" ? "local-upload" : "local-read";
  return `${getLocalApiBase()}/api/storage/${route}?${params.toString()}`;
}

export function relativeKeyFromLocalUploadUrl(rawPath: string): string | null {
  try {
    const url = rawPath.startsWith("http")
      ? new URL(rawPath)
      : new URL(rawPath, getLocalApiBase());
    if (!url.pathname.endsWith("/local-upload")) return null;
    return url.searchParams.get("key");
  } catch {
    return null;
  }
}

export async function writeLocalObject(relativeKey: string, data: Buffer): Promise<void> {
  const filePath = resolveLocalPath(relativeKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function readLocalObject(relativeKey: string): Promise<Buffer> {
  return readFile(resolveLocalPath(relativeKey));
}

export async function localObjectExists(relativeKey: string): Promise<boolean> {
  try {
    await access(resolveLocalPath(relativeKey));
    return true;
  } catch {
    return false;
  }
}

export async function deleteLocalObject(relativeKey: string): Promise<void> {
  try {
    await unlink(resolveLocalPath(relativeKey));
  } catch {
    // ignore missing files
  }
}

export function guessContentType(relativeKey: string): string {
  const lower = relativeKey.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
