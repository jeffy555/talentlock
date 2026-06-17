import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Font } from "@react-pdf/renderer";

let dancingScriptRegistered: boolean | null = null;

/** Resolve Dancing Script TTF across dev (src/) and bundled (dist/) layouts. */
export function resolveDancingScriptFontPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, "fonts/DancingScript-Regular.ttf"),
    path.join(moduleDir, "lib/fonts/DancingScript-Regular.ttf"),
    path.resolve(moduleDir, "../src/lib/fonts/DancingScript-Regular.ttf"),
    path.resolve(process.cwd(), "src/lib/fonts/DancingScript-Regular.ttf"),
    path.resolve(process.cwd(), "artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf"),
    path.resolve(process.cwd(), "dist/fonts/DancingScript-Regular.ttf"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `DancingScript font not found. Checked: ${candidates.join(", ")}`,
  );
}

/** Register Dancing Script when available; fall back to Helvetica-Oblique in the template. */
export function ensureDancingScriptFont(): boolean {
  if (dancingScriptRegistered !== null) return dancingScriptRegistered;
  try {
    Font.register({
      family: "DancingScript",
      src: resolveDancingScriptFontPath(),
    });
    dancingScriptRegistered = true;
  } catch {
    dancingScriptRegistered = false;
  }
  return dancingScriptRegistered;
}

export function signatureCursiveFontFamily(): string {
  return ensureDancingScriptFont() ? "DancingScript" : "Helvetica-Oblique";
}
