import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = fs.readFileSync(path.join(root, "tools", "serve-with-refresh.mjs"), "utf8");
const match = source.match(/async function getCachedDeckSearch\([^)]*\) \{([\s\S]*?)\n\}/);
assert.ok(match, "getCachedDeckSearch should exist");

const body = match[1];
assert.ok(
  !body.includes("if (stale) refreshDeckSearchInBackground(cacheKey, cacheFile, descriptor, producer);"),
  "stale deck-search disk cache must not be returned while refreshing in the background",
);
assert.ok(
  /if \(!stale\) \{[\s\S]*?return payload;[\s\S]*?\}/.test(body),
  "fresh disk cache should still be returned without a network request",
);
assert.ok(
  body.includes("return fetchAndCacheDeckSearch(cacheKey, cacheFile, descriptor, producer);"),
  "stale disk cache should be refreshed synchronously before responding",
);

console.log("live deck-search cache refresh checks passed");
