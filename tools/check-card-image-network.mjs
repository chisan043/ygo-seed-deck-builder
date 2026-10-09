import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createCardImageFetch } from "./card-image-network.mjs";

const require = createRequire(import.meta.url);
const { attachCardImageNetwork, allowedImageUrl } = require("../electron/card-image-network.cjs");
const english = await fs.readFile(new URL("../data/trend-images/19491080.jpg", import.meta.url));
const chinese = Buffer.from("UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ/Y/+ByKi/wEA", "base64");
const japanese = Buffer.from("UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAAAcQ0f/+ByKi/wEA", "base64");
const imageUrl = id => `https://images.ygoprodeck.com/images/cards/${id}.jpg`;
export const sourceCalls = [];
let slowAborted = false;
export async function fixtureFetch(url, { signal } = {}) {
  sourceCalls.push(url);
  if (url.endsWith("/2.jpg")) return new Response("missing", { status: 404 });
  if (url.endsWith("/3.jpg")) throw new Error("fetch failed", { cause: { code: "ENETUNREACH" } });
  if (url.endsWith("/4.jpg")) return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { slowAborted = true; reject(signal.reason); }, { once: true });
  });
  if (url.endsWith("/5.jpg")) return new Response(Buffer.alloc(4 * 1024 * 1024 + 1));
  if (url.endsWith("/6.jpg")) return new Response("<html>blocked download</html>");
  const bytes = url.includes("/sc/") ? chinese : url.includes("/jp/") ? japanese : english;
  if (url.endsWith("/metadata")) {
    const md5 = crypto.createHash("md5").update(bytes).digest("hex");
    return new Response(Array.from({ length: 1001 }, (_, index) => `${89631139 + index}.webp:${bytes.length},1791501000,${md5}`).join("\n"));
  }
  await new Promise(resolve => setTimeout(resolve, 10));
  return new Response(bytes, { headers: { "content-type": bytes === english ? "image/jpeg" : "image/webp" } });
}

async function runWorker() {
  // Reproduce a desktop where the browser can access images but Node cannot.
  globalThis.fetch = async () => { throw new Error("Node direct network is unavailable"); };
  const fetchImage = createCardImageFetch();
  const response = await fetchImage(imageUrl(1));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), english);
  assert.equal((await fetchImage(imageUrl(2))).status, 404);
  await assert.rejects(fetchImage("file:///private/local-file"), /Unsupported card image source/);
  await assert.rejects(fetchImage("https://images.ygoprodeck.com.evil.example/images/cards/1.jpg"), /Unsupported card image source/);
  await assert.rejects(fetchImage(imageUrl(3)), /ENETUNREACH/);
  await assert.rejects(fetchImage(imageUrl(4), { signal: AbortSignal.timeout(50) }), { name: "TimeoutError" });
  await assert.rejects(fetchImage(imageUrl(5)), /exceeds 4 MiB/);
  const alreadyAborted = AbortSignal.abort();
  await assert.rejects(fetchImage(imageUrl(1), { signal: alreadyAborted }), { name: "AbortError" });

  const { getCardImageResponse } = await import("./serve-with-refresh.mjs");
  await assert.rejects(getCardImageResponse(6, "full", "en"), /invalid JPEG/);
  await assert.rejects(fs.stat(path.join(process.env.YGO_RESOURCE_CACHE_DIR, "full", "6.jpg")), { code: "ENOENT" });
  const images = await Promise.all(Array.from({ length: 8 }, () => getCardImageResponse(89631139, "full", "en")));
  for (const image of images) assert.deepEqual(image.bytes, english);
  assert.deepEqual((await getCardImageResponse(89631139, "full", "zh")).bytes, chinese);
  assert.deepEqual((await getCardImageResponse(89631139, "full", "ja")).bytes, japanese);
  // Cached image failures must retry, and HTML must never count as a JPEG.
  const englishFile = path.join(process.env.YGO_RESOURCE_CACHE_DIR, "full", "89631139.jpg");
  await fs.writeFile(englishFile, "<html>blocked download</html>");
  assert.deepEqual((await getCardImageResponse(89631139, "full", "en")).bytes, english);
  process.send({ type: "fixture-cached" });
  await new Promise(resolve => process.once("message", resolve));
  assert.deepEqual((await getCardImageResponse(89631139, "full", "en")).bytes, english);
  assert.deepEqual((await getCardImageResponse(89631139, "full", "zh")).bytes, chinese);
  assert.deepEqual((await getCardImageResponse(89631139, "full", "ja")).bytes, japanese);
  const pending = fetchImage(imageUrl(4));
  process.disconnect();
  await assert.rejects(pending, /disconnected/);
}

export async function checkNetwork(fetchImage = fixtureFetch) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ygo-desktop-images-"));
  let child;
  let cacheChecked = false;
  try {
    child = fork(fileURLToPath(import.meta.url), ["--worker"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YGO_RESOURCE_CACHE_DIR: directory, YGO_OFFLINE: "0" },
      serialization: "advanced", stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let output = "";
    child.stdout.on("data", bytes => { output += bytes; });
    child.stderr.on("data", bytes => { output += bytes; });
    attachCardImageNetwork(child, async (...args) => {
      if (cacheChecked && !args[0].endsWith("/4.jpg")) throw new Error("Cached image unexpectedly requested network");
      return fetchImage(...args);
    });
    child.on("message", message => {
      if (message.type !== "fixture-cached") return;
      cacheChecked = true;
      child.send({ type: "fixture-continue" });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Desktop image checks timed out\n${output}`)); }, 20000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(output || `Image worker exit ${code}`)); });
    });
    assert.ok(cacheChecked, "the fresh installation must download and then reuse all three languages");
  } finally {
    if (child && child.exitCode === null) child.kill();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv.includes("--worker")) {
  try { await runWorker(); } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
} else if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  for (const url of ["file:///tmp/a", "http://images.ygoprodeck.com/images/cards/1.jpg", imageUrl(1) + "?url=bad", "https://images.ygoprodeck.com:99/images/cards/1.jpg"]) assert.equal(allowedImageUrl(url), false);
  let nativeCalls = 0;
  const standalone = createCardImageFetch({}, async () => { nativeCalls++; return new Response("native"); });
  assert.equal(await (await standalone(imageUrl(1))).text(), "native");
  assert.equal(nativeCalls, 1, "standalone local servers retain their native downloader");
  await checkNetwork();
  assert.ok(slowAborted, "cancelled child requests must cancel the parent download");
  assert.equal(sourceCalls.filter(url => url === imageUrl(89631139)).length, 2, "parallel image downloads must deduplicate, followed by one repair of a corrupt cache");
  console.log("Desktop image network checks passed: fresh English/Chinese/Japanese caches, blocked Node network, abort/disconnect, source restrictions, deduplication and corrupt cache repair");
}
