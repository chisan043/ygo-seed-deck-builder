const fs = require("node:fs");
const path = require("node:path");
const ai = require("../ai-deck.js");

function cleanConfig(input) {
  const baseUrl = ai.endpoint(input?.baseUrl);
  const model = String(input?.model || "").trim();
  if (!model || model.length > 200) throw new Error("aiModelError");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error("aiKeyError");
  return { baseUrl, model, apiKey, enabled: Boolean(input.enabled), systemPrompt: ai.normalizePrompt(input.systemPrompt) };
}

async function completion(config, messages, { fetch: request = globalThis.fetch, signal } = {}) {
  try {
    const response = await request(config.baseUrl, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/json", ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model: config.model, messages, stream: false }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`aiHttpError:${response.status}`);
    const raw = await response.text();
    if (raw.length > 300000) throw new Error("aiResponseError");
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error("aiResponseError"); }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("aiResponseError");
    return content;
  } catch (error) {
    if (signal?.aborted) throw new Error("aiCancelled");
    if (["TimeoutError", "AbortError"].includes(error.name)) throw new Error("aiTimeout");
    if (/^ai\w+(?::\d+)?$/.test(error.message)) throw error;
    // Do not relay provider messages or URLs: they can contain credentials.
    throw new Error("aiNetworkError");
  }
}

async function runAi(input, payload, options = {}) {
  const config = cleanConfig(input);
  if (payload?.test) {
    await completion(config, [{ role: "user", content: "Reply with OK." }], options);
    return { ok: true };
  }
  const context = payload?.context;
  if (!context || !["md", "ocg", "tcg"].includes(context.format) || !Array.isArray(context.cards) || context.cards.length > 200 || JSON.stringify(context).length > 600000) throw new Error("aiContextError");
  if (!context.cards.some(card => card.id === context.seedId)) throw new Error("aiContextError");
  const messages = ai.messages(context, config.systemPrompt);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await completion(config, messages, options);
    const result = ai.validate(text, context);
    if (!result.issues.length) return { ok: true, recipe: result.recipe, model: config.model, repaired: attempt > 0 };
    messages.push({ role: "assistant", content: text.slice(0, 30000) }, { role: "user", content: `Correct these validation errors and return the entire deck JSON again: ${result.issues.join("; ")}` });
  }
  throw new Error("aiRecipeError");
}

function createAiManager({ directory, safeStorage, fetch }) {
  const file = path.join(directory, "ai-settings.json");
  let saved = {};
  let key = "";
  let active;
  try {
    saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.encryptedKey && canStore()) key = safeStorage.decryptString(Buffer.from(saved.encryptedKey, "base64"));
  } catch { saved = {}; }
  function canStore() {
    return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }
  function getConfig() {
    return { baseUrl: saved.baseUrl || "", model: saved.model || "", enabled: Boolean(saved.enabled), hasKey: Boolean(key), keyStored: Boolean(saved.encryptedKey && key), canStoreKey: canStore(), systemPrompt: ai.normalizePrompt(saved.systemPrompt) };
  }
  function resolve(input) {
    const config = cleanConfig(input);
    if (!config.apiKey && saved.baseUrl === config.baseUrl) config.apiKey = key;
    return config;
  }
  function saveConfig(input) {
    const config = resolve(input);
    const next = { baseUrl: config.baseUrl, model: config.model, enabled: config.enabled, systemPrompt: saved.systemPrompt || ai.DEFAULT_SYSTEM_PROMPT };
    if (input.rememberKey && config.apiKey && canStore()) next.encryptedKey = safeStorage.encryptString(config.apiKey).toString("base64");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next), { mode: 0o600 });
    saved = next;
    key = config.apiKey;
    return getConfig();
  }
  function savePrompt(value) {
    const systemPrompt = ai.normalizePrompt(value);
    const next = { ...saved, systemPrompt };
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next), { mode: 0o600 });
    saved = next;
    return getConfig();
  }
  function forgetKey() {
    const next = { ...saved, enabled: false };
    delete next.encryptedKey;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next), { mode: 0o600 });
    saved = next; key = "";
    return getConfig();
  }
  async function request(payload) {
    if (active) throw new Error("aiBusy");
    const config = payload.test ? resolve(payload.config) : resolve(saved);
    if (!payload.test && !config.enabled) throw new Error("aiDisabled");
    active = new AbortController();
    try { return await runAi(config, payload, { fetch, signal: active.signal }); }
    finally { active = null; }
  }
  return { getConfig, saveConfig, savePrompt, forgetKey, request, cancel: () => active?.abort() };
}
module.exports = { cleanConfig, completion, runAi, createAiManager };
