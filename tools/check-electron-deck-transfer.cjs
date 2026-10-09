const { app, BrowserWindow, WebContentsView, session, ipcMain, webContents } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createDeckTransferManager } = require("../electron/deck-transfer-manager.cjs");
const { recipe } = require("./check-native-deck-transfer.cjs");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ygo-transfer-electron-"));
app.setPath("userData", profile);
const HOME = "https://www.db.yugioh-card.com/yugiohdb/member_deck.action?request_locale=en";
const captureDir = process.env.YGO_TRANSFER_QA_DIR;
app.whenReady().then(async () => {
  let manager;
  try {
    const partition = "persist:fixture-konami";
    const officialSession = session.fromPartition(partition);
    let creates = 0, posts = 0, loginPosts = 0, mode = "normal", networkFailure = false, authFailure = false;
    const fixtures = (url) => {
      const operation = url.searchParams.get("ope");
      if (url.pathname.includes("member_login")) return '<form method="post" rel="opener" target="_blank" action="https://my.konami.net/fixture-login"><input type="hidden" name="fixtureNonce" value="fixture-only"><button id="fixtureLogin">Fixture sign in</button></form>';
      if (operation === "4") return '<div id="deck_recipe"></div><a href="/yugiohdb/member_deck.action?ope=6&cgid=fixture">Add a deck</a>';
      if (operation === "6") { creates += 1; return `<input class="link_value" value="/yugiohdb/member_deck.action?ope=1&dno=${creates}&cgid=fixture">`; }
      if (operation === "2") {
        const groups = ["monster", "spell", "trap", "extra", "side"];
        let html = '<input name="dnm"><button id="btn_regist" onclick="window.fixtureSaves++">Save (fixture only)</button><script>window.fixtureSaves=0</script>';
        for (const group of groups) for (let index = 1; index <= (group === "extra" || group === "side" ? 20 : 65); index += 1) {
          const prefix = group.slice(0, 2);
          html += `<input id="${prefix}nm_${index}" value="${mode === "occupied" && group === "monster" && index === 1 ? "Existing card" : ""}"><input ${mode === "schema" && group === "extra" && index === 1 ? "" : `id="${prefix}num_${index}"`}><input name="${group}CardId"><input id="imgs_${prefix}_${index}">`;
        }
        return html;
      }
      return '<a class="menu_my_decks" href="/yugiohdb/member_deck.action?ope=4&cgid=fixture">My Deck</a>';
    };
    // Only this temporary test session intercepts HTTPS. No real account is
    // signed in and no remote recipe is created or saved by these checks.
    officialSession.protocol.handle("https", async request => {
      const url = new URL(request.url);
      if (request.method !== "GET" && url.hostname === "www.db.yugioh-card.com") posts += 1;
      if (networkFailure) return new Response("Fixture network error", { status: 503 });
      if (url.hostname === "my.konami.net") {
        assert.equal(request.method, "POST", "Native login popup must preserve POST instead of replaying GET");
        assert.equal(new URL(request.referrer).origin, new URL(HOME).origin);
        assert.equal(await request.text(), "fixtureNonce=fixture-only");
        loginPosts += 1;
        await officialSession.cookies.set({ url: HOME, name: "fixtureLogin", value: "yes" });
        return new Response(`<button id="fixtureReturn" onclick="location.href='${HOME}'">Return to database (fixture only)</button>`, { headers: { "Content-Type": "text/html" } });
      }
      if (url.pathname.includes("member_login")) {
        if (authFailure) return new Response("KONAMI ID 403 (fixture)", { status: 403 });
        assert.equal(new URL(request.referrer).origin, new URL(HOME).origin, "Automatic login navigation preserves its source");
      }
      const loggedIn = (await officialSession.cookies.get({ url: HOME, name: "fixtureLogin" })).length > 0;
      const html = !loggedIn && !url.pathname.includes("member_login") ? '<a class="menu_my_decks" href="/yugiohdb/member_login.action">Log in</a>' : fixtures(url);
      return new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body class="en"><p>OFFICIAL PAGE TEST FIXTURE</p>${html}</body></html>`, { headers: { "Content-Type": "text/html" } });
    });
    manager = createDeckTransferManager({ BrowserWindow, WebContentsView, session, partition });
    assert(!officialSession.getUserAgent().includes("Electron/"), "Official session uses standard Chromium identification");
    ipcMain.handle("deck-transfer:window-state", event => { assert(manager.trustedShellSender(event)); return manager.getState(); });
    ipcMain.handle("deck-transfer:retry", event => { assert(manager.trustedShellSender(event)); return manager.retry(); });
    ipcMain.handle("deck-transfer:resize-header", (event, height) => { assert(manager.trustedShellSender(event)); return manager.resizeHeader(height); });
    const waitPhase = (phase) => new Promise((resolve, reject) => {
      if (manager.getState().phase === phase) { resolve(); return; }
      const timer = setTimeout(() => { manager.events.removeListener("change", listener); reject(new Error(`Expected ${phase}, got ${manager.getState().phase}`)); }, 10000);
      const listener = state => { if (state.phase === phase) { clearTimeout(timer); manager.events.removeListener("change", listener); resolve(); } };
      manager.events.on("change", listener);
    });
    const remote = () => webContents.getAllWebContents().find(contents => /^https:\/\/(www\.db\.yugioh-card\.com|my\.konami\.net)\//.test(contents.getURL()));
    const capture = async name => {
      if (!captureDir) return;
      fs.mkdirSync(captureDir, { recursive: true });
      const shell = BrowserWindow.getAllWindows()[0];
      await shell.webContents.executeJavaScript('document.fonts.ready');
      const expected = manager.getState();
      await shell.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 3000;
        const check = () => {
          if (document.getElementById('status').textContent === messages[${JSON.stringify(expected.language)}][${JSON.stringify(expected.phase)}]) requestAnimationFrame(() => requestAnimationFrame(resolve));
          else if (Date.now() > deadline) reject(new Error('Shell status not rendered'));
          else setTimeout(check, 10);
        }; check();
      })`);
      const dimensions = await shell.webContents.executeJavaScript('({height:document.querySelector("header").offsetHeight,width:innerWidth,bottom:document.getElementById("hint").getBoundingClientRect().bottom})');
      assert(dimensions.bottom <= dimensions.height, "Header copy must fit above the official page");
      fs.writeFileSync(path.join(captureDir, `${name}-shell.png`), (await shell.webContents.capturePage({ x: 0, y: 0, width: dimensions.width, height: dimensions.height })).toPNG());
      // capturePage only includes the shell's webContents, excluding the
      // separate native official-page view. Capture our own macOS window.
      if (process.platform === "darwin") {
        const windowId = shell.getMediaSourceId().split(":")[1];
        execFileSync("/usr/sbin/screencapture", ["-x", "-l", windowId, path.join(captureDir, `${name}-full.png`)]);
      }
    };
    manager.open(recipe);
    await waitPhase("login");
    // Wait for the real login fixture navigation; loading-home status also
    // briefly says login while the DOM adapter is selecting the next page.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Login fixture not reached")), 10000);
      const check = () => { if (remote()?.getURL().includes("member_login")) { clearTimeout(timer); manager.events.removeListener("change", check); resolve(); } };
      manager.events.on("change", check); check();
    });
    assert.equal(await remote().executeJavaScript("typeof require"), "undefined");
    assert.equal(await remote().executeJavaScript("typeof desktopDeckTransfer"), "undefined");
    assert(!manager.trustedShellSender({ sender: remote(), senderFrame: remote().mainFrame }));
    await capture("native-login");
    await remote().executeJavaScript('document.getElementById("fixtureLogin").click()');
    const popup = await new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        const found = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes("my.konami.net"));
        if (found && !found.webContents.isLoading()) resolve(found);
        else if (Date.now() > deadline) reject(new Error("Login popup did not load")); else setTimeout(check, 20);
      }; check();
    });
    assert.equal(await popup.webContents.executeJavaScript("typeof require"), "undefined");
    assert.equal(await popup.webContents.executeJavaScript("typeof desktopDeckTransfer"), "undefined");
    assert.equal(await popup.webContents.executeJavaScript("window.opener !== null"), true, "OAuth popup keeps its opener");
    assert(!manager.trustedShellSender({ sender: popup.webContents, senderFrame: popup.webContents.mainFrame }));
    assert.equal(loginPosts, 1);
    await popup.webContents.executeJavaScript('location.href="https://evil.example/"');
    await waitPhase("blocked");
    assert(!popup.webContents.getURL().includes("evil.example"), "Login windows keep the same official navigation boundary");
    await popup.webContents.executeJavaScript('document.getElementById("fixtureReturn").click()');
    await waitPhase("filled");
    assert.equal(creates, 1);
    const filled = await remote().executeJavaScript(`({ names: [...document.getElementsByName('monsterCardId')].filter(n=>n.value).map(n=>n.value), qty: Array.from({length:14},(_,i)=>Number(document.getElementById('monum_'+(i+1)).value)), deckName: document.querySelector('[name="dnm"]').value, saves: window.fixtureSaves })`);
    assert.deepEqual(filled.names, recipe.main.map(row => String(row.konamiId)));
    assert.equal(filled.qty.reduce((sum, qty) => sum + qty, 0), 40);
    assert.equal(filled.deckName, recipe.name);
    assert.equal(filled.saves, 0, "Never click the official Save button");
    assert.equal(posts, 0, "Never submit the official form");
    manager.open(recipe);
    assert.equal(creates, 1, "Repeated clicks reuse one transfer window");
    assert.throws(() => manager.open({ ...recipe, name: "Another Deck" }), /transferBusy/);
    await capture("native-filled");
    await remote().executeJavaScript('location.href="https://evil.example/"');
    await waitPhase("blocked");
    assert(!remote().getURL().includes("evil.example"));
    manager.close();
    await waitPhase("closed");
    // The same partition reuses only its own login cookie across windows.
    for (const scenario of ["occupied", "schema", "schema-en", "normal"]) {
      mode = scenario.startsWith("schema") ? "schema" : scenario;
      manager.open({ ...recipe, language: scenario === "schema" ? "ja" : "en" });
      if (scenario === "schema-en") BrowserWindow.getAllWindows()[0].setContentSize(900, 700);
      await waitPhase(scenario === "normal" ? "filled" : mode);
      if (scenario !== "normal") {
        assert.equal(await remote().executeJavaScript("document.getElementById('monum_1').value"), "", "Preflight failures must not partially fill a recipe");
        await capture(`native-${scenario}`);
      }
      assert.equal(posts, 0);
      manager.close();
      await waitPhase("closed");
    }
    networkFailure = true;
    manager.open(recipe);
    await waitPhase("network");
    await capture("native-network");
    networkFailure = false;
    manager.retry();
    await waitPhase("filled");
    manager.close();
    await waitPhase("closed");
    await officialSession.clearStorageData();
    authFailure = true;
    for (const language of ["zh", "ja", "en"]) {
      manager.open({ ...recipe, language });
      BrowserWindow.getAllWindows()[0].setContentSize(900, 700);
      await waitPhase("auth");
      await capture(`native-auth-${language}`);
      if (language === "en") {
        authFailure = false;
        manager.retry();
        await waitPhase("login");
      }
      manager.close(); await waitPhase("closed");
    }
    authFailure = false;
    manager.open(recipe);
    await waitPhase("login");
    manager.close();
    console.log("Native Electron transfer passed: login referrer/POST/opener retained, standard Chromium UA, isolated session reuse, exact fill, no recipe Save/POST, busy/preflight protection, origin/IPC isolation, network and 403 retry.");
    app.exit(0);
  } catch (error) { console.error(error); manager?.close(); app.exit(1); }
});
app.on("window-all-closed", () => {});
app.on("quit", () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} });
