/**
 * Static asset loader for the dashboard.
 *
 * The dashboard ships three files (index.html, app.js, style.css) under
 * `src/http/public/`. They travel with the `src` directory when the plugin is
 * packaged (openclaw loads the source tree directly via tsx). Assets are
 * resolved lazily on first read, then cached in memory so subsequent requests
 * avoid disk I/O.
 *
 * We deliberately keep the allow-list small and path-literal — there is no
 * dynamic concatenation of request paths with filesystem paths, so a
 * compromised browser client cannot traverse out of `public/`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type DashboardAsset = {
  contentType: string;
  body: Buffer;
};

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const ASSET_MAP: Record<string, { file: string; contentType: string }> = {
  "index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
  "style.css": { file: "style.css", contentType: "text/css; charset=utf-8" },
};

const cache = new Map<string, DashboardAsset>();

export function loadDashboardAsset(name: string): DashboardAsset | null {
  const entry = ASSET_MAP[name];
  if (!entry) return null;
  const cached = cache.get(name);
  if (cached) return cached;
  const body = readFileSync(join(PUBLIC_DIR, entry.file));
  const asset: DashboardAsset = { contentType: entry.contentType, body };
  cache.set(name, asset);
  return asset;
}

export function resetDashboardAssetCacheForTests(): void {
  cache.clear();
}
