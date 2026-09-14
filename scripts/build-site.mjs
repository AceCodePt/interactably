import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cdn = path.join(root, "dist", "cdn");
const vendor = path.join(root, "site", "vendor");

if (!existsSync(cdn)) {
  console.error(`[build-site] ${path.relative(root, cdn)} not found; run pnpm build first`);
  process.exit(1);
}

rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });

let copied = 0;
for (const name of readdirSync(cdn)) {
  if (!name.endsWith(".js")) continue;
  copyFileSync(path.join(cdn, name), path.join(vendor, name));
  copied += 1;
}

console.log(`[build-site] vendored ${copied} bundle(s) from dist/cdn to site/vendor`);
