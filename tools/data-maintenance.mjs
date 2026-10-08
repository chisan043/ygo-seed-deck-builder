import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DATA_DIR, ROOT, fetchData, readJson, seedDataDirectory, syncOfflineBundles, validateCardPayload, writeJson } from "./data-utils.mjs";
import { fetchCurrentRegulation } from "./limit-regulation-sources.mjs";

const HEALTH_FILE = path.join(DATA_DIR, "data-health.json");
const HOUR = 3600000;
let maintenance;

export function runSyncScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "tools", script)], {
      cwd: ROOT, env: { ...process.env, YGO_DATA_DIR: DATA_DIR }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-10000); });
    child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-10000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out`)); }, 8 * 60 * 1000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${script}: ${output.trim() || `exit ${code}`}`));
    });
  });
}

export function maintainData(options = {}) {
  if (!maintenance) maintenance = updateData(options).finally(() => { maintenance = null; });
  return maintenance;
}

async function updateData({ force = false } = {}) {
  await seedDataDirectory();
  const health = await readJson(HEALTH_FILE).catch(() => ({ version: 1, tasks: {} }));
  const failures = [];
  async function task(name, ttl, work) {
    const previous = health.tasks[name] || {};
    if (!force && !previous.lastError && Date.now() - Date.parse(previous.lastSuccessAt || "") < ttl) {
      health.tasks[name] = { ...previous, maxAgeMs: ttl };
      return;
    }
    const checkedAt = new Date().toISOString();
    try {
      const details = await work();
      health.tasks[name] = { checkedAt, lastSuccessAt: checkedAt, maxAgeMs: ttl, lastError: null, ...details };
      console.log(`data maintenance: ${name} updated`);
    } catch (error) {
      health.tasks[name] = { ...previous, checkedAt, maxAgeMs: ttl, lastError: error.message };
      failures.push(`${name}: ${error.message}`);
      console.warn(`data maintenance: ${name} failed; keeping previous cache (${error.message})`);
    }
    health.checkedAt = new Date().toISOString();
    await writeJson(HEALTH_FILE, health);
  }
  await task("cards", 24 * HOUR, async () => {
    const old = await readJson(path.join(DATA_DIR, "cardinfo-cache.json"));
    const payload = validateCardPayload(await fetchData("https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes"), old.data?.length);
    await writeJson(path.join(DATA_DIR, "cardinfo-cache.json"), payload);
    return { count: payload.data.length };
  });
  const cards = (await readJson(path.join(DATA_DIR, "cardinfo-cache.json"))).data;
  for (const format of ["md", "ocg", "tcg"]) await task(`banlist-${format}`, 6 * HOUR, async () => {
    const file = path.join(DATA_DIR, "limit-regulations", `${format}.json`);
    const previous = await readJson(file).catch(() => null);
    const payload = await fetchCurrentRegulation(format, cards);
    if (previous?.date > payload.date) throw new Error(`source regressed from ${previous.date} to ${payload.date}`);
    await writeJson(file, payload, 2);
    return { date: payload.date, count: Object.keys(payload.regulation).length, sourceUrl: payload.sourceUrl };
  });
  await task("locales", 24 * HOUR, async () => {
    await runSyncScript("sync-master-duel-locales.mjs");
    const payload = await readJson(path.join(DATA_DIR, "master-duel-locales.json"));
    return { count: Object.keys(payload.cards).length };
  });
  await task("packs", 7 * 24 * HOUR, async () => {
    await runSyncScript("sync-pack-index.mjs");
    const payload = await readJson(path.join(DATA_DIR, "pack-index.json"));
    return { count: Object.keys(payload.cards).length };
  });
  await task("samples", 6 * HOUR, async () => {
    await runSyncScript("sync-ygoprodeck-samples.mjs");
    return {};
  });
  await syncOfflineBundles();
  health.checkedAt = new Date().toISOString();
  await writeJson(HEALTH_FILE, health);
  return { health, failures };
}

export async function recordTrendHealth(error = null, details = {}) {
  const health = await readJson(HEALTH_FILE).catch(() => ({ version: 1, tasks: {} }));
  const checkedAt = new Date().toISOString();
  const previous = health.tasks.trends || {};
  health.tasks.trends = error
    ? { ...previous, checkedAt, lastError: error.message }
    : { checkedAt, lastSuccessAt: checkedAt, maxAgeMs: 6 * HOUR, lastError: null, ...details };
  health.checkedAt = checkedAt;
  await writeJson(HEALTH_FILE, health);
}
