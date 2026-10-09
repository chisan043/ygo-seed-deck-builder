const { EventEmitter } = require("node:events");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { officialPageAction } = require("./deck-transfer-page.cjs");
const HOME = "https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en";

function konamiUserAgent(value) {
  // Keep this runtime's Chromium/platform versions, without application tokens
  // that make the official login treat the browser as an unsupported client.
  const prefix = value.match(/^Mozilla\/5\.0 .*?\(KHTML, like Gecko\)/)?.[0];
  const chrome = value.match(/\bChrome\/[\d.]+/)?.[0];
  const safari = value.match(/\bSafari\/[\d.]+/)?.[0];
  return prefix && chrome && safari ? `${prefix} ${chrome} ${safari}` : value;
}

function trustedKonamiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      url.hostname === "www.db.yugioh-card.com" || url.hostname === "konami.net" || url.hostname.endsWith(".konami.net")
      || url.hostname === "konami.com" || url.hostname.endsWith(".konami.com")
    );
  } catch { return false; }
}

function validateRecipe(input) {
  if (!input || !["zh", "ja", "en"].includes(input.language) || typeof input.name !== "string" || input.name.length > 100 || !Array.isArray(input.main) || !Array.isArray(input.extra)) throw new Error("invalidRecipe");
  const groups = { monster: [], spell: [], trap: [], extra: [], side: [] };
  const totals = new Map();
  for (const section of ["main", "extra"]) {
    if (input[section].length > (section === "main" ? 60 : 15)) throw new Error("invalidRecipe");
    for (const row of input[section]) {
      if (!row || !Number.isInteger(row.id) || row.id <= 0 || !Number.isInteger(row.konamiId) || row.konamiId <= 0 || !Number.isInteger(row.qty) || row.qty < 1 || row.qty > 3 || typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 || !["monster", "spell", "trap", "extra"].includes(row.group) || (section === "extra") !== (row.group === "extra")) throw new Error("invalidRecipe");
      const count = (totals.get(row.konamiId) || 0) + row.qty;
      if (count > 3) throw new Error("invalidRecipe");
      totals.set(row.konamiId, count);
      groups[row.group].push({ name: row.name, konamiId: row.konamiId, qty: row.qty });
    }
  }
  const count = section => input[section].reduce((sum, row) => sum + row.qty, 0);
  if (count("main") < 40 || count("main") > 60 || count("extra") > 15) throw new Error("invalidRecipe");
  return { name: input.name.trim() || "Seed Deck", language: input.language, groups };
}

function createDeckTransferManager({ BrowserWindow, WebContentsView, session, parentWindow, partition = "persist:konami-decks" }) {
  const events = new EventEmitter();
  const shellFile = path.join(__dirname, "deck-transfer-window.html");
  const officialSession = session.fromPartition(partition);
  officialSession.setUserAgent(konamiUserAgent(officialSession.getUserAgent()));
  officialSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  officialSession.setPermissionCheckHandler(() => false);
  let window, view, recipe, created = false, filled = false, revision = 0, pageFailed = false, navigation = 0, headerHeight = 164;
  let sequence = 0;
  const loginWindows = new Set();
  let state = { phase: "closed", language: "zh", name: "", origin: "", sequence };
  function publish(phase, extra = {}) {
    state = { ...state, phase, ...extra, sequence: ++sequence };
    events.emit("change", { ...state });
    if (window && !window.isDestroyed()) window.webContents.send("deck-transfer:state", state);
  }
  function getState() { return { ...state }; }
  function resize() {
    if (!window || !view || window.isDestroyed()) return;
    const [width, height] = window.getContentSize();
    view.setBounds({ x: 0, y: headerHeight, width, height: Math.max(0, height - headerHeight) });
  }
  function resizeHeader(height) {
    if (!Number.isInteger(height) || height < 100 || height > 300) throw new Error("Invalid header size");
    headerHeight = height; resize();
  }
  function trustedShellSender(event) {
    return Boolean(window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === pathToFileURL(shellFile).href);
  }
  async function navigate(url) {
    if (!view || view.webContents.isDestroyed() || !trustedKonamiUrl(url)) return;
    const token = ++navigation;
    const contents = view.webContents;
    pageFailed = false;
    publish("loading", { origin: new URL(url).origin });
    const timeout = setTimeout(() => {
      if (token !== navigation || contents.isDestroyed()) return;
      pageFailed = true; contents.stop(); publish("network");
    }, 25000);
    const source = contents.getURL();
    const options = trustedKonamiUrl(source) ? { httpReferrer: { url: source, policy: "strict-origin-when-cross-origin" } } : {};
    try { await contents.loadURL(url, options); } catch (error) {
      if (token === navigation && error.code !== "ERR_ABORTED" && error.errno !== -3) { pageFailed = true; publish("network"); }
    } finally { clearTimeout(timeout); }
  }
  function guardOfficialContents(contents) {
    contents.on("did-navigate", (_event, url, statusCode) => {
      if (statusCode < 400) return;
      if (contents === view?.webContents) pageFailed = true;
      publish(statusCode === 403 ? "auth" : "network", { origin: new URL(url).origin });
    });
    for (const name of ["will-navigate", "will-redirect"]) contents.on(name, (event, url) => {
      if (!trustedKonamiUrl(url)) { event.preventDefault(); publish("blocked"); }
      else if (contents === view?.webContents) pageFailed = false;
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (!trustedKonamiUrl(url) && url !== "about:blank") { publish("blocked"); return { action: "deny" }; }
      // Let Chromium create the login window: replaying its URL as a GET loses
      // target=_blank POST data, referrer, and the OAuth opener relationship.
      return { action: "allow", overrideBrowserWindowOptions: {
        parent: window, width: 1000, height: 760, backgroundColor: "#fff",
        webPreferences: { session: officialSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
      } };
    });
    contents.on("did-create-window", popup => {
      loginWindows.add(popup);
      guardOfficialContents(popup.webContents);
      popup.on("closed", () => loginWindows.delete(popup));
      popup.webContents.on("did-finish-load", () => {
        if (!view || popup.isDestroyed()) return;
        const url = new URL(popup.webContents.getURL());
        if (url.origin === new URL(HOME).origin && url.pathname === "/yugiohdb/member_deck.action") {
          navigate(HOME); popup.close();
        }
      });
    });
  }
  async function advance() {
    if (!view || view.webContents.isDestroyed() || filled || pageFailed) return;
    const current = view.webContents;
    const token = revision;
    const url = new URL(current.getURL());
    if (!trustedKonamiUrl(url.href)) return;
    publish("login", { origin: url.origin });
    if (url.origin !== "https://www.db.yugioh-card.com" || url.pathname !== "/yugiohdb/member_deck.action") return;
    let action;
    try { action = await current.executeJavaScript(`(${officialPageAction.toString()})(${JSON.stringify(recipe)})`); }
    catch { if (token === revision) publish("schema"); return; }
    if (token !== revision || current.isDestroyed() || current.getURL() !== url.href) return;
    if (action.kind === "filled") { filled = true; publish("filled", { nameFilled: action.nameFilled }); return; }
    if (action.kind === "my-decks" || action.kind === "edit") {
      if (trustedKonamiUrl(action.url) && action.url !== current.getURL()) await navigate(action.url);
    } else if (action.kind === "create" && !created) {
      created = true;
      await navigate(action.url);
    } else if (action.kind === "language") {
      url.searchParams.set("request_locale", "en");
      if (url.href !== current.getURL()) await navigate(url.href); else publish("schema");
    } else publish(["schema", "occupied"].includes(action.kind) ? action.kind : "manual");
  }
  function open(input) {
    const next = validateRecipe(input);
    if (window && !window.isDestroyed()) {
      // A visible transfer belongs to one snapshot. Repeated clicks never
      // replace an in-progress form or create more blank official decks.
      window.show(); window.focus();
      if (JSON.stringify(next) !== JSON.stringify(recipe)) throw new Error("transferBusy");
      return getState();
    }
    recipe = next; created = false; filled = false; pageFailed = false; revision += 1;
    state = { phase: "loading", name: recipe.name, language: recipe.language, origin: new URL(HOME).origin, sequence: ++sequence };
    window = new BrowserWindow({
      width: 1120, height: 850, minWidth: 900, minHeight: 650,
      title: recipe.language === "zh" ? "大师决斗 · 官方卡组" : recipe.language === "ja" ? "マスターデュエル · 公式デッキ" : "Master Duel · Official Deck",
      backgroundColor: "#111418", parent: parentWindow?.(),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "deck-transfer-window-preload.cjs") },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: officialSession } });
    window.contentView.addChildView(view);
    window.on("resize", resize); resize();
    guardOfficialContents(view.webContents);
    view.webContents.on("did-finish-load", () => advance());
    view.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => { if (isMainFrame && code !== -3) { pageFailed = true; publish("network"); } });
    window.on("closed", () => {
      revision += 1; navigation += 1;
      for (const popup of loginWindows) if (!popup.isDestroyed()) popup.close();
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
      view = null; window = null; recipe = null; publish("closed");
    });
    window.loadFile(shellFile).catch(() => publish("network"));
    navigate(HOME);
    return getState();
  }
  function retry() {
    if (!window || window.isDestroyed()) return getState();
    if (filled) { window.show(); window.focus(); return getState(); }
    for (const popup of loginWindows) if (!popup.isDestroyed()) popup.close();
    navigate(HOME);
    return getState();
  }
  function close() { window?.close(); }
  return { events, open, retry, close, getState, trustedShellSender, resizeHeader };
}

module.exports = { createDeckTransferManager, trustedKonamiUrl, validateRecipe, konamiUserAgent };
