import { defineConfig } from "drizzle-kit";
import { readdirSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(rootDir, "src", "schema");
const toPosix = (p: string) => p.replace(/\\/g, "/");
const schemaFiles = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .map((f) => toPosix(path.join(schemaDir, f)));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: [...schemaFiles, toPosix(path.join(rootDir, "schema.ts"))],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
