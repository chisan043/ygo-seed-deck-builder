import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeWindowCache(relativePath, globalName, payload) {
  const output = `window.${globalName} = ${JSON.stringify(payload)};`;
  fs.writeFileSync(path.join(root, relativePath), output, "utf8");
}

const cardCache = readJson("data/cardinfo-cache.json");
writeWindowCache("data/cardinfo-cache.js", "YGO_CARDINFO_CACHE", cardCache);

const limitBundle = {
  version: 1,
  generatedAt: new Date().toISOString(),
  formats: {
    md: readJson("data/limit-regulations/md.json"),
    ocg: readJson("data/limit-regulations/ocg.json"),
    tcg: readJson("data/limit-regulations/tcg.json"),
  },
};
writeWindowCache("data/limit-regulations-cache.js", "YGO_LIMIT_REGULATIONS", limitBundle);

console.log("offline caches synced from JSON data");
