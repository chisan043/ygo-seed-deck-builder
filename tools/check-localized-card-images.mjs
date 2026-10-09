import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import vm from "node:vm";
import { createLocalizedImageCache, isWebP, parseImageMetadata } from "./localized-card-images.mjs";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ygo-localized-images-"));
const red = Buffer.from("UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ/Y/+ByKi/wEA", "base64");
const blue = Buffer.from("UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ0f/+ByKi/wEA", "base64");
const md5 = bytes => crypto.createHash("md5").update(bytes).digest("hex");
let chinese = red;
let corruptImage = false;
let wrongChecksum = false;
let incompleteMetadata = false;
let active = 0;
let peak = 0;
const requests = [];

function metadata(bytes) {
  return Array.from({ length: 1001 }, (_, index) => `${89631139 + index}.webp:${bytes.length},1791501000,${md5(bytes)}`).join("\n");
}

async function fetchImage(url) {
  requests.push(url);
  const bytes = url.includes("/sc/") ? chinese : blue;
  if (url.endsWith("/metadata")) return new Response(incompleteMetadata ? "bad gateway" : metadata(bytes));
  active++;
  peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, 10));
  active--;
  return new Response(corruptImage ? "<html>upstream error</html>" : wrongChecksum ? blue : bytes);
}

const options = { directory, fetch: fetchImage, canonicalId: async () => 89631139 };
async function expireMetadata() {
  const file = path.join(directory, "localized/zh-metadata.json");
  const json = JSON.parse(await fs.readFile(file, "utf8"));
  await fs.writeFile(file, JSON.stringify({ ...json, checkedAt: 0 }));
}

try {
  assert.ok(isWebP(red));
  assert.ok(!isWebP(Buffer.from("<html>not an image</html>")));
  assert.equal(parseImageMetadata("../../wrong.webp:42,1,01234567890123456789012345678901").size, 0);
  let cache = createLocalizedImageCache(options);
  const sameRequests = await Promise.all(Array.from({ length: 12 }, () => cache.get(89631139, "full", "zh")));
  for (const image of sameRequests) assert.deepEqual(image, red);
  assert.equal(requests.filter(url => url.includes("/sc/") && !url.endsWith("/metadata")).length, 1, "concurrent requests must share the download");
  assert.deepEqual(await cache.get(89631139, "full", "ja"), blue, "Japanese must not reuse the Chinese cache");
  const count = requests.length;
  assert.deepEqual(await cache.get(89631139, "full", "zh"), red);
  assert.equal(requests.length, count, "unchanged images should be read locally");
  assert.deepEqual(await cache.get(11111111, "full", "zh"), red, "alternative-art IDs should resolve to their canonical card");
  assert.equal(await cache.get(89631139, "cropped", "zh"), null, "textless cropped art uses the existing artwork source");
  assert.equal(await cache.get(-1, "full", "zh"), null);
  assert.equal(await cache.get(89631139, "full", "../../bad"), null);

  let offlineRequests = 0;
  const offline = createLocalizedImageCache({ ...options, offline: true, fetch: async () => { offlineRequests++; throw new Error("offline"); } });
  assert.deepEqual(await offline.get(89631139, "full", "zh"), red);
  assert.deepEqual(await offline.get(89631139, "full", "ja"), blue);
  assert.equal(await offline.get(89631140, "full", "zh"), null);
  assert.equal(offlineRequests, 0, "offline requests must not contact the source");

  chinese = blue;
  await expireMetadata();
  cache = createLocalizedImageCache(options);
  assert.deepEqual(await cache.get(89631139, "full", "zh"), blue, "a changed metadata hash must replace the old card image");

  chinese = red;
  corruptImage = true;
  await expireMetadata();
  cache = createLocalizedImageCache(options);
  assert.deepEqual(await cache.get(89631139, "full", "zh"), blue, "invalid downloads must retain the last verified image");
  assert.deepEqual(await fs.readFile(path.join(directory, "localized/zh/full/89631139.webp")), blue);
  corruptImage = false;
  wrongChecksum = true;
  assert.deepEqual(await cache.get(89631139, "full", "zh"), blue, "valid WebP with the wrong source checksum must retain the prior image");
  assert.deepEqual(await fs.readFile(path.join(directory, "localized/zh/full/89631139.webp")), blue);
  wrongChecksum = false;
  assert.deepEqual(await cache.get(89631139, "full", "zh"), red, "a failed image download must be retryable");

  await expireMetadata();
  const prior = await fs.readFile(path.join(directory, "localized/zh-metadata.json"), "utf8");
  incompleteMetadata = true;
  cache = createLocalizedImageCache(options);
  assert.deepEqual(await cache.get(89631139, "full", "zh"), red);
  assert.equal(await fs.readFile(path.join(directory, "localized/zh-metadata.json"), "utf8"), prior, "incomplete upstream metadata must not overwrite the saved index");
  incompleteMetadata = false;

  const fresh = createLocalizedImageCache({ ...options, directory: path.join(directory, "concurrent") });
  await Promise.all(Array.from({ length: 8 }, (_, index) => fresh.get(89631139 + index, "small", "zh")));
  assert.ok(peak <= 2, "community image requests must have a global concurrency limit of two");
  assert.ok(requests.some(url => url.endsWith(".webp!half")), "lists should request thumbnails");

  const source = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
  const body = source.match(/function localCardImageUrl\([^\n]*\) \{([\s\S]*?)\n\}/)[1];
  const context = { state: { language: "zh" }, CAN_USE_LOCAL_IMAGE_API: true };
  vm.createContext(context);
  vm.runInContext(`function imageUrl(imageId,size,fallbackUrl=""){${body}}`, context);
  const url = language => { context.state.language = language; return vm.runInContext('imageUrl(89631139,"full","english.jpg")', context); };
  assert.match(url("zh"), /lang=zh$/);
  assert.match(url("ja"), /lang=ja$/);
  assert.match(url("en"), /lang=en$/);
  context.CAN_USE_LOCAL_IMAGE_API = false;
  assert.match(url("zh"), /\/sc\/89631139\.webp$/);
  assert.match(url("ja"), /\/jp\/89631139\.webp$/);
  assert.equal(url("en"), "english.jpg");

  console.log("Localized card image checks passed: language isolation, canonical IDs, offline reuse, incremental updates, corruption recovery, request deduplication and source concurrency");
} finally { await fs.rm(directory, { recursive: true, force: true }); }
