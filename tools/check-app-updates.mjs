import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { createUpdateManager, newerVersion, trustedAssetUrl, trustedUpdateSender } = require("../electron/update-manager.cjs");
const root = fileURLToPath(new URL("..", import.meta.url));
const repo = "chisan043/ygo-seed-deck-builder";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ygo-update-test-"));
try {
  assert.ok(newerVersion("v0.7.2", "0.7.1"));
  assert.ok(newerVersion("0.10.0", "0.9.9"));
  assert.ok(!newerVersion("0.7.0", "0.7.1"));
  assert.throws(() => newerVersion("0.7.2-beta", "0.7.1"));
  const data = Buffer.from("verified installer fixture");
  const hash = createHash("sha256").update(data).digest("hex");
  const asset = { name: "ygo-seed-deck-builder-0.7.2-arm64.dmg", size: data.length };
  asset.browser_download_url = `https://github.com/${repo}/releases/download/v0.7.2/${asset.name}`;
  const sums = { name: "SHA256SUMS-v0.7.2.txt", browser_download_url: `https://github.com/${repo}/releases/download/v0.7.2/SHA256SUMS-v0.7.2.txt` };
  const release = { tag_name: "v0.7.2", draft: false, prerelease: false, assets: [asset, sums] };
  for (const url of [asset.browser_download_url.replace("github.com", "evil.example"), asset.browser_download_url.replace(repo, "someone/other"), asset.browser_download_url.replace("https:", "http:"), asset.browser_download_url + "?token=x"]) {
    assert.throws(() => trustedAssetUrl({ ...asset, browser_download_url: url }, "v0.7.2"));
  }
  const calls = [], opened = [];
  let broken = false, requestFailure = false;
  async function fetch(url) {
    calls.push(url);
    if (requestFailure) throw new Error("offline");
    if (url.endsWith("/releases/latest")) return Response.json(release);
    if (url.endsWith(".txt")) return new Response(`${hash}  ${asset.name}\n`);
    return new Response(broken ? Buffer.from("tampered") : data);
  }
  const app = { isPackaged: true, getVersion: () => "0.7.1", getPath: () => directory };
  const shell = { openPath: async (file) => { opened.push(file); return ""; } };
  const manager = createUpdateManager({ app, shell, fetch, platform: "darwin", arch: "arm64" });
  await assert.rejects(manager.install(), /not been verified/);
  const statuses = [];
  manager.events.on("change", (state) => statuses.push(state.status));
  await Promise.all([manager.check(), manager.check()]);
  assert.equal(calls.filter((url) => url.endsWith("/releases/latest")).length, 1, "concurrent checks must share a download");
  assert.equal(manager.getState().status, "ready");
  assert.equal(manager.getState().installMode, "open-installer");
  assert.ok(statuses.includes("downloading"));
  await manager.install();
  assert.deepEqual(await fs.readFile(opened[0]), data);
  const cached = createUpdateManager({ app, shell, fetch, platform: "darwin", arch: "arm64" });
  const downloadsBefore = calls.filter((url) => url.endsWith(".dmg")).length;
  await cached.check();
  assert.equal(calls.filter((url) => url.endsWith(".dmg")).length, downloadsBefore, "verified cached installers should not download twice");
  await fs.writeFile(opened[0], "tampered cache");
  await assert.rejects(cached.install(), /checksum mismatch/);
  assert.equal(opened.length, 1, "modified installers must never be opened");
  broken = true;
  const invalid = createUpdateManager({ app, shell, fetch, platform: "darwin", arch: "arm64" });
  await invalid.check();
  assert.equal(invalid.getState().status, "error");
  await assert.rejects(invalid.install());
  await assert.rejects(fs.stat(`${opened[0]}.partial`), { code: "ENOENT" });
  broken = false;
  await invalid.check();
  assert.equal(invalid.getState().status, "ready", "failed downloads must be retryable");
  const offline = createUpdateManager({ app, shell, fetch, platform: "darwin", arch: "arm64" });
  requestFailure = true;
  await offline.check();
  assert.equal(offline.getState().status, "error");
  requestFailure = false;
  release.tag_name = "v0.7.0";
  await offline.check();
  assert.equal(offline.getState().status, "current", "never download or install older releases");
  const dev = createUpdateManager({ app: { ...app, isPackaged: false }, shell, fetch });
  assert.equal((await dev.check()).status, "unavailable");

  const nativeUpdater = new EventEmitter();
  let installs = 0;
  nativeUpdater.checkForUpdates = async () => {
    nativeUpdater.emit("checking-for-update");
    nativeUpdater.emit("update-available", { version: "0.7.2" });
    return { downloadPromise: Promise.resolve().then(() => {
      nativeUpdater.emit("download-progress", { percent: 45.5 });
      nativeUpdater.emit("update-downloaded", { version: "0.7.2" });
    }) };
  };
  nativeUpdater.quitAndInstall = () => { installs += 1; };
  const native = createUpdateManager({ app, shell, fetch, platform: "win32", nativeUpdater });
  await native.check();
  assert.equal(native.getState().status, "ready");
  assert.equal(installs, 0, "downloading must never close the app or install without user action");
  assert.equal(nativeUpdater.autoInstallOnAppQuit, false);
  await native.install();
  assert.equal(installs, 1);
  nativeUpdater.emit("error", new Error("installation failed"));
  assert.equal(native.getState().status, "error");

  const sender = { mainFrame: { url: "http://127.0.0.1:5173/index.html?api=1" } };
  const event = { sender, senderFrame: sender.mainFrame };
  const window = { webContents: sender };
  assert.ok(trustedUpdateSender(event, window, root, sender.mainFrame.url));
  assert.ok(!trustedUpdateSender({ ...event, senderFrame: { url: sender.mainFrame.url } }, window, root, sender.mainFrame.url), "subframes cannot install updates");
  sender.mainFrame.url = "https://example.com/index.html";
  assert.ok(!trustedUpdateSender(event, window, root, "http://127.0.0.1:5173/index.html?api=1"));

  const ipc = new EventEmitter();
  ipc.invoke = (channel) => channel;
  let bridge;
  vm.runInNewContext(await fs.readFile(path.join(root, "electron/preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (name, value) => { if (name === "desktopUpdates") bridge = value; } }, ipcRenderer: ipc }),
  });
  let delivered;
  const dispose = bridge.onChange((state) => { delivered = state; });
  ipc.emit("updates:state", { secretEvent: true }, { status: "ready" });
  assert.equal(delivered.status, "ready");
  assert.equal(delivered.secretEvent, undefined, "preload must not expose raw IPC events");
  dispose();
  assert.equal(ipc.listenerCount("updates:state"), 0);
  assert.equal(bridge.install(), "updates:install");

  const appSource = await fs.readFile(path.join(root, "app.js"), "utf8");
  const renderSource = appSource.slice(appSource.indexOf("function renderDesktopUpdate("), appSource.indexOf("function dismissUpdateDialog()"));
  const button = {}, title = {}, body = {}, classes = new Set(["hidden"]);
  const ui = vm.createContext({
    desktopUpdateState: null, state: {}, localStorage: { getItem: () => null }, showToast: () => {},
    t: (key) => key, format: (text, values) => `${text}:${JSON.stringify(values)}`,
    els: { updateDialogTitle: title, updateDialogBody: body, updateDownloadButton: button, updateDialog: { classList: { contains: (value) => classes.has(value), remove: (value) => classes.delete(value) } } },
  });
  vm.runInContext(renderSource, ui);
  ui.renderDesktopUpdate({ status: "downloading", version: "0.7.2", percent: 50 });
  assert.equal(button.disabled, true);
  ui.renderDesktopUpdate({ status: "ready", version: "0.7.2", installMode: "restart" });
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "updateRestartInstall");
  ui.renderDesktopUpdate({ status: "ready", version: "0.7.2", installMode: "open-installer" });
  assert.equal(button.textContent, "updateOpenInstaller");
  ui.renderDesktopUpdate({ status: "error" });
  assert.equal(button.textContent, "updateRetry");
  console.log("App update checks passed: verified downloads, retry/cache recovery, no downgrade, native install consent, IPC isolation and progress UI");
} finally { await fs.rm(directory, { recursive: true, force: true }); }
