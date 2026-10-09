import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { atomicWrite } from "./data-utils.mjs";

const IMAGE_ROOT = "https://cdn.233.momobako.com/ygoimg";
const METADATA_TTL = 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;

export function imageLanguage(value) {
  return value === "zh" || value === "ja" ? value : "en";
}

export function parseImageMetadata(text) {
  const entries = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^(\d+)\.webp:(\d+),(\d+),([a-f0-9]{32})$/i);
    if (match && Number(match[2]) > 0) entries.set(Number(match[1]), { size: Number(match[2]), modifiedAt: Number(match[3]), md5: match[4].toLowerCase() });
  }
  return entries;
}

export function isWebP(bytes) {
  return bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length;
}

const digest = (bytes, algorithm = "sha256") => crypto.createHash(algorithm).update(bytes).digest("hex");

// Separate language caches prevent English images from satisfying a Chinese or Japanese request.
// The source's daily metadata lets changed cards refresh without re-downloading the whole collection.
export function createLocalizedImageCache({ directory, fetch: fetchImage = globalThis.fetch, canonicalId = async id => id, offline = false }) {
  const root = path.join(directory, "localized");
  const metadata = new Map();
  const metadataJobs = new Map();
  const imageJobs = new Map();
  const queue = [];
  let running = 0;

  function limited(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
  }

  function drain() {
    while (running < 2 && queue.length) {
      const job = queue.shift();
      running++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { running--; drain(); });
    }
  }

  async function imageIndex(language) {
    const previous = metadata.get(language);
    if (previous && Date.now() < previous.retryAt) return previous.entries;
    if (metadataJobs.has(language)) return metadataJobs.get(language);
    const job = (async () => {
      const file = path.join(root, `${language}-metadata.json`);
      let saved = previous;
      if (!saved) {
        try {
          const json = JSON.parse(await fs.readFile(file, "utf8"));
          saved = { entries: parseImageMetadata(json.text), retryAt: Number(json.checkedAt) + METADATA_TTL };
        } catch { /* A first request has no metadata cache yet. */ }
      }
      if (offline || (saved && Date.now() < saved.retryAt)) {
        if (saved) metadata.set(language, saved);
        return saved?.entries || null;
      }
      try {
        const folder = language === "zh" ? "sc" : "jp";
        const response = await fetchImage(`${IMAGE_ROOT}/${folder}/metadata`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`image metadata ${response.status}`);
        const text = await response.text();
        const entries = parseImageMetadata(text);
        if (entries.size < 1000 || entries.size < (saved?.entries?.size || 0) * 0.9) throw new Error("incomplete image metadata");
        const checkedAt = Date.now();
        await atomicWrite(file, JSON.stringify({ checkedAt, text }));
        metadata.set(language, { entries, retryAt: checkedAt + METADATA_TTL });
        return entries;
      } catch {
        metadata.set(language, { entries: saved?.entries || null, retryAt: Date.now() + RETRY_MS });
        return saved?.entries || null;
      }
    })().finally(() => metadataJobs.delete(language));
    metadataJobs.set(language, job);
    return job;
  }

  async function load(id, size, language) {
    const index = await imageIndex(language);
    let mapped = id;
    if (index && !index.has(id)) {
      try { mapped = Number(await canonicalId(id)); } catch { /* The original image may still be cached. */ }
    }
    const imageId = index?.has(mapped) ? mapped : id;
    const record = index?.get(imageId);
    const file = path.join(root, language, size, `${imageId}.webp`);
    let cached = null;
    try {
      const bytes = await fs.readFile(file);
      const info = JSON.parse(await fs.readFile(`${file}.json`, "utf8"));
      if (isWebP(bytes) && digest(bytes) === info.sha256) cached = { bytes, md5: info.sourceMd5 };
    } catch { /* Corrupt or incomplete cache entries are retried. */ }
    if (cached && (offline || !record || cached.md5 === record.md5)) return cached.bytes;
    if (offline || !record) return cached?.bytes || null;

    try {
      const folder = language === "zh" ? "sc" : "jp";
      const response = await fetchImage(`${IMAGE_ROOT}/${folder}/${imageId}.webp${size === "small" ? "!half" : ""}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`localized image ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!isWebP(bytes)) throw new Error("invalid localized image");
      if (size === "full" && (bytes.length !== record.size || digest(bytes, "md5") !== record.md5)) throw new Error("localized image checksum mismatch");
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, bytes);
        await fs.rename(temporary, file);
      } finally { await fs.rm(temporary, { force: true }); }
      await atomicWrite(`${file}.json`, JSON.stringify({ sourceMd5: record.md5, sha256: digest(bytes) }));
      return bytes;
    } catch { return cached?.bytes || null; }
  }

  function get(cardId, size, language) {
    const id = Number(cardId);
    language = imageLanguage(language);
    if (!Number.isSafeInteger(id) || id <= 0 || language === "en" || size === "cropped") return Promise.resolve(null);
    size = size === "full" ? "full" : "small";
    const key = `${language}:${size}:${id}`;
    if (!imageJobs.has(key)) {
      imageJobs.set(key, limited(() => load(id, size, language)).finally(() => imageJobs.delete(key)));
    }
    return imageJobs.get(key);
  }

  return { get };
}
