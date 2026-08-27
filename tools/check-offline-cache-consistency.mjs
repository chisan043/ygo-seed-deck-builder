import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readWindowCache(relativePath, globalName) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, relativePath), "utf8"), context, { filename: relativePath });
  assert.ok(context.window[globalName], `${relativePath} should define ${globalName}`);
  return context.window[globalName];
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertSameCache(label, jsonPayload, bundledPayload, details = {}) {
  const jsonHash = stableHash(jsonPayload);
  const bundledHash = stableHash(bundledPayload);
  assert.equal(
    bundledHash,
    jsonHash,
    `${label} JSON and offline JS cache differ (${JSON.stringify(details)})`,
  );
}

const cardJson = readJson("data/cardinfo-cache.json");
const cardBundle = readWindowCache("data/cardinfo-cache.js", "YGO_CARDINFO_CACHE");
assertSameCache("cardinfo", cardJson, cardBundle, {
  jsonCards: cardJson.data?.length,
  bundledCards: cardBundle.data?.length,
});

const limitBundle = readWindowCache("data/limit-regulations-cache.js", "YGO_LIMIT_REGULATIONS");
for (const format of ["md", "ocg", "tcg"]) {
  const jsonPayload = readJson(`data/limit-regulations/${format}.json`);
  const bundledPayload = limitBundle.formats?.[format];
  assertSameCache(`limit regulation ${format}`, jsonPayload, bundledPayload, {
    jsonDate: jsonPayload.date,
    bundledDate: bundledPayload?.date,
    jsonCachedAt: jsonPayload.cachedAt,
    bundledCachedAt: bundledPayload?.cachedAt,
  });
}

console.log("offline cache consistency checks passed");
