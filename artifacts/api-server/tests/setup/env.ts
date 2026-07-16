import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

let loaded = false;

function parseEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Load `.env.test` then `.env` from workspace root (first wins for unset keys). */
export function loadTestEnv() {
  if (loaded) return;
  parseEnvFile(join(workspaceRoot, ".env.test"));
  parseEnvFile(join(workspaceRoot, ".env"));
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.PORT = process.env.PORT ?? "8080";
  if (!process.env.CSRF_SECRET) {
    process.env.CSRF_SECRET = "test-csrf-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
  }
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
  }
  loaded = true;
}

export function integrationEnvReady(): boolean {
  loadTestEnv();
  return Boolean(
    process.env.DATABASE_URL &&
      process.env.CLERK_SECRET_KEY &&
      process.env.CLERK_PUBLISHABLE_KEY,
  );
}

export function adminEnvReady(): boolean {
  loadTestEnv();
  return Boolean(process.env.ADMIN_PASSWORD && integrationEnvReady());
}

export { workspaceRoot };
