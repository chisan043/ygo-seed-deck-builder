const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ai = require("../ai-deck.js");
const { cleanConfig, runAi, createAiManager } = require("../electron/ai-client.cjs");

async function main() {
  assert.equal(ai.endpoint("https://example.com/v1/"), "https://example.com/v1/chat/completions");
  assert.equal(ai.endpoint("http://127.0.0.1:1234/v1/chat/completions"), "http://127.0.0.1:1234/v1/chat/completions");
  for (const url of ["file:///tmp/key", "http://example.com/v1", "https://key@example.com", "https://example.com?key=secret", "https://example.com/#key"]) assert.throws(() => ai.endpoint(url));
  assert.throws(() => cleanConfig({ baseUrl: "https://example.com", model: "" }), /aiModelError/);
  const cards = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, limit: i === 14 ? 1 : 3, extra: false, text: "Known card effect", name: `Card ${i}` }));
  cards.push({ id: 99, limit: 1, extra: true });
  const context = { cards, seedId: 1, format: "md", language: "Chinese", requirements: "Theme focused", samples: [] };
  const recipe = { title: "Test", strategy: "Use supplied effects", main: cards.slice(0, 13).map(card => ({ id: card.id, qty: 3 })), extra: [{ id: 99, qty: 1 }] };
  recipe.main.push({ id: 15, qty: 1 });
  assert(ai.validate(JSON.stringify(recipe), context).recipe);
  assert(ai.validate('```json\n' + JSON.stringify(recipe) + '\n```', context).recipe);
  function invalid(change) { const copy = structuredClone(recipe); change(copy); assert(ai.validate(JSON.stringify(copy), context).issues.length); }
  invalid(r => r.main[0].id = 777); // Hallucinated card
  invalid(r => r.main.push({ id: 15, qty: 1 })); // Aggregate limits cannot hide duplicate rows
  invalid(r => r.main[13].qty = 2); // Current format restriction
  invalid(r => r.main[0].qty = 1.5);
  invalid(r => r.main[0].qty = "3");
  invalid(r => r.main[0].id = 99); // Misplaced Extra Deck card
  invalid(r => r.main.shift()); // Missing seed and short deck
  invalid(r => r.extra = [{ id: 99, qty: 16 }]);
  assert(ai.validate('{"main":[],"extra":[]}', context).issues.length);
  assert(ai.validate("I can't build this", context).issues.length);
  assert(ai.validate('{"main":[null],"extra":[]}', context).issues.length);
  assert(ai.validate(JSON.stringify(recipe), { ...context, cards: cards.map(card => ({ ...card, limit: card.id === 1 ? 0 : card.limit })) }).issues.length, "A newly forbidden seed is rejected");
  const config = { baseUrl: "https://example.com/v1", model: "my-model", apiKey: "test-secret", enabled: true, systemPrompt: "Custom prompt: prioritize coherent theme combos." };
  const requests = [];
  const fake = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(url, "https://example.com/v1/chat/completions");
    assert.equal(options.headers.authorization, "Bearer test-secret");
    assert.equal(options.redirect, "error", "Keys must not follow redirects to a different host");
    const result = requests.length === 1 ? { ...recipe, main: [] } : recipe;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  };
  const result = await runAi(config, { context }, { fetch: fake });
  assert(result.ok && result.repaired);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, "my-model");
  assert(requests[0].messages[0].content.startsWith(config.systemPrompt), "Saved custom instructions reach the provider");
  assert(requests[0].messages[0].content.includes(ai.OUTPUT_RULES), "Output schema is appended even with a custom prompt");
  assert(ai.messages(context)[0].content.startsWith(ai.DEFAULT_SYSTEM_PROMPT), "Existing settings migrate to the visible default");
  assert.throws(() => ai.normalizePrompt(" "), /aiPromptError/);
  assert.throws(() => ai.normalizePrompt("x".repeat(12001)), /aiPromptError/);
  assert(requests[0].messages[1].content.includes("Theme focused"));
  assert.equal(requests[1].messages.length, 4);
  let badRequests = 0;
  await assert.rejects(runAi(config, { context }, { fetch: async () => { badRequests++; return new Response(JSON.stringify({ choices: [{ message: { content: "invalid" } }] })); } }), /aiRecipeError/);
  assert.equal(badRequests, 2, "Only one paid correction is allowed");
  await assert.rejects(runAi(config, { context }, { fetch: async () => new Response('secret provider body', { status: 401 }) }), /aiHttpError:401/);
  await assert.rejects(runAi(config, { test: true }, { fetch: async () => { throw new Error('network test-secret'); } }), error => error.message === "aiNetworkError");
  await assert.rejects(runAi(config, { test: true }, { fetch: async () => new Response('{}') }), /aiResponseError/);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(runAi(config, { test: true }, { signal: aborted.signal, fetch: async () => { throw new Error('aborted'); } }), /aiCancelled/);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ygo-ai-test-"));
  try {
    const vault = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value.split('').reverse().join('')), decryptString: value => value.toString().split('').reverse().join('') };
    const manager = createAiManager({ directory, safeStorage: vault, fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] })) });
    assert.equal(manager.savePrompt("Personal prompt before configuring an API").systemPrompt, "Personal prompt before configuring an API");
    const saved = manager.saveConfig({ ...config, rememberKey: true });
    assert(saved.hasKey && saved.keyStored);
    assert.equal(saved.storagePath, path.join(directory, "ai-settings.json"), "The displayed storage path matches the actual encrypted settings file");
    assert.equal(saved.systemPrompt, "Personal prompt before configuring an API", "Saving connection settings preserves the prompt");
    assert(manager.savePrompt("Updated personal prompt").hasKey, "Prompt changes preserve the secret");
    assert.throws(() => manager.savePrompt(""), /aiPromptError/);
    assert(!JSON.stringify(saved).includes("test-secret"));
    assert(!fs.readFileSync(path.join(directory, "ai-settings.json"), "utf8").includes("test-secret"));
    const reopened = createAiManager({ directory, safeStorage: vault });
    assert(reopened.getConfig().hasKey);
    assert.equal(reopened.getConfig().systemPrompt, "Updated personal prompt", "Prompt survives restart");
    assert(manager.saveConfig({ ...config, apiKey: "", rememberKey: true }).hasKey, "Blank preserves a key on the same endpoint");
    assert(!manager.saveConfig({ ...config, baseUrl: "https://other.example/v1", apiKey: "", rememberKey: true }).hasKey, "Changing providers never sends the previous provider's key");
    manager.saveConfig({ ...config, rememberKey: false });
    assert(!JSON.parse(fs.readFileSync(path.join(directory, "ai-settings.json"))).encryptedKey);
    assert(!manager.forgetKey().hasKey);
    const cancellable = createAiManager({ directory, safeStorage: vault, fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("Abort network")), { once: true });
    }) });
    cancellable.saveConfig({ ...config, rememberKey: false });
    const pending = cancellable.request({ test: true, config: { ...config, apiKey: "" } });
    await assert.rejects(cancellable.request({ test: true, config }), /aiBusy/);
    cancellable.cancel();
    await assert.rejects(pending, /aiCancelled/, "Cancellation releases the in-flight request");
    const unsafe = createAiManager({ directory, safeStorage: { ...vault, getSelectedStorageBackend: () => "basic_text" } });
    assert(!unsafe.saveConfig({ ...config, rememberKey: true }).keyStored, "No weak plaintext-backed persistence");
    assert(!fs.readFileSync(path.join(directory, "ai-settings.json"), "utf8").includes("test-secret"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  const vm = require("node:vm");
  const bridges = {};
  const invocations = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "electron/preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { bridges[name] = value; } }, ipcRenderer: { invoke: (channel, payload) => { invocations.push({ channel, payload }); return Promise.resolve({ ok: true }); } } }),
  });
  assert(bridges.desktopAI && bridges.desktopUpdates, "AI bridge coexists with the updater");
  await bridges.desktopAI.request({ test: true });
  assert.equal(invocations[0].channel, "ai:request");
  assert.equal(invocations[0].payload.test, true);
  assert.deepEqual(Object.keys(bridges.desktopAI).sort(), ["cancel", "forgetKey", "getConfig", "request", "saveConfig", "savePrompt"], "Only scoped IPC methods are exposed");

  await bridges.desktopAI.savePrompt("A personal prompt");
  assert.equal(invocations[1].channel, "ai:save-prompt");
  assert.equal(invocations[1].payload, "A personal prompt");

  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(html.indexOf('data-page="banlist"') < html.indexOf('data-page="ai-settings"'), "Settings tab follows Banlist");
  assert(html.includes('id="aiModeHint" role="status" aria-live="polite"'), "Generation state must be announced");
  assert(html.indexOf('src="ai-deck.js') < html.indexOf('src="app.js'), "Load shared AI codec first");
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert(source.includes('await buildConfiguredDeckChoices(seed, "ai", publicDecks)'), "Local editor must call configured AI");
  assert(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"))).build.files.includes("ai-deck.js"));
  console.log("AI checks passed: endpoint policy, format/seed/count validation, bounded repair, authentication errors, secret storage and provider isolation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
