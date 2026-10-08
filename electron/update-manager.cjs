const fs = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { EventEmitter } = require("node:events");

const REPO = "chisan043/ygo-seed-deck-builder";
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

function versionParts(value) {
  const match = String(value || "").match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error("Invalid stable release version");
  return match.slice(1).map(Number);
}

function newerVersion(next, current) {
  const a = versionParts(next), b = versionParts(current);
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function trustedAssetUrl(asset, tag) {
  const url = new URL(asset.browser_download_url);
  const prefix = `/${REPO}/releases/download/${encodeURIComponent(tag)}/`;
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(prefix) || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid release asset URL");
  }
  if (decodeURIComponent(url.pathname.slice(prefix.length)) !== asset.name || path.basename(asset.name) !== asset.name || /[\\/]/.test(asset.name)) {
    throw new Error("Invalid release asset name");
  }
  return url.href;
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function createUpdateManager({ app, shell, fetch, platform = process.platform, arch = process.arch, nativeUpdater = null }) {
  const events = new EventEmitter();
  let state = { status: "idle", currentVersion: app.getVersion(), installMode: nativeUpdater ? "restart" : "open-installer" };
  let checking = null;
  let installer = null;
  let installerDigest = null;
  const cacheDir = path.join(app.getPath("userData"), "app-updates");
  const publish = (patch) => { state = { ...state, error: null, ...patch }; events.emit("change", { ...state }); };
  const fail = (error) => publish({ status: "error", error: error.message });
  async function request(url, timeout = 30000) {
    const response = await fetch(url, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`Update request failed (${response.status})`);
    return response;
  }

  if (nativeUpdater) {
    nativeUpdater.autoDownload = true;
    nativeUpdater.autoInstallOnAppQuit = false;
    nativeUpdater.allowPrerelease = false;
    nativeUpdater.allowDowngrade = false;
    nativeUpdater.on("checking-for-update", () => publish({ status: "checking" }));
    nativeUpdater.on("update-available", (info) => publish({ status: "downloading", version: info.version, percent: 0 }));
    nativeUpdater.on("update-not-available", () => publish({ status: "current" }));
    nativeUpdater.on("download-progress", (info) => publish({ status: "downloading", percent: Math.round(info.percent) }));
    nativeUpdater.on("update-downloaded", (info) => publish({ status: "ready", version: info.version, percent: 100 }));
    nativeUpdater.on("error", fail);
  }

  async function downloadInstaller(release, version) {
    const suffix = platform === "darwin" ? `-${arch}.dmg` : `-${arch}-setup.exe`;
    const asset = release.assets.find((item) => item.name === `ygo-seed-deck-builder-${version}${suffix}`);
    const checksums = release.assets.find((item) => item.name === `SHA256SUMS-v${version}.txt`);
    if (!asset || !checksums) throw new Error("Release installer or checksum is not available yet");
    const url = trustedAssetUrl(asset, release.tag_name);
    const content = await (await request(trustedAssetUrl(checksums, release.tag_name))).text();
    const line = content.split(/\r?\n/).find((row) => row.slice(66) === asset.name && /^[a-f0-9]{64}  /.test(row));
    if (!line) throw new Error("Missing installer checksum");
    const expected = line.slice(0, 64);
    installerDigest = expected;
    await fs.mkdir(cacheDir, { recursive: true });
    const target = path.join(cacheDir, asset.name);
    if (await sha256(target).then((value) => value === expected).catch(() => false)) {
      installer = target;
      publish({ status: "ready", version, percent: 100 });
      return;
    }
    publish({ status: "downloading", version, percent: 0 });
    const partial = `${target}.partial`;
    try {
      const response = await request(url, 30 * 60 * 1000);
      let transferred = 0, lastPercent = -1;
      const progress = new Transform({ transform(chunk, encoding, callback) {
        transferred += chunk.length;
        const percent = asset.size > 0 ? Math.min(99, Math.floor(transferred * 100 / asset.size)) : 0;
        if (percent !== lastPercent) { lastPercent = percent; publish({ status: "downloading", percent }); }
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partial));
      if (transferred !== asset.size || await sha256(partial) !== expected) throw new Error("Installer checksum or size mismatch");
      await fs.rename(partial, target);
      installer = target;
      publish({ status: "ready", version, percent: 100 });
    } catch (error) {
      await fs.rm(partial, { force: true });
      throw error;
    }
  }

  async function checkNow() {
    if (!app.isPackaged || !["darwin", "win32"].includes(platform)) {
      publish({ status: "unavailable" });
      return;
    }
    if (state.status === "ready") return;
    publish({ status: "checking" });
    try {
      if (nativeUpdater) {
        const result = await nativeUpdater.checkForUpdates();
        if (result?.downloadPromise) await result.downloadPromise;
        return;
      }
      const release = await (await request(RELEASE_API)).json();
      if (release.draft || release.prerelease) throw new Error("Invalid stable release");
      const version = versionParts(release.tag_name).join(".");
      if (!newerVersion(version, state.currentVersion)) { publish({ status: "current" }); return; }
      await downloadInstaller(release, version);
    } catch (error) { fail(error); }
  }

  return {
    events,
    getState: () => ({ ...state }),
    check() {
      if (!checking) checking = checkNow().finally(() => { checking = null; });
      return checking.then(() => ({ ...state }));
    },
    async install() {
      if (state.status !== "ready") throw new Error("Update has not been verified and downloaded");
      if (nativeUpdater) { nativeUpdater.quitAndInstall(true, true); return { ...state }; }
      // Only open the verified installer. macOS security checks remain enabled.
      if (await sha256(installer).catch(() => null) !== installerDigest) {
        const error = new Error("Installer checksum mismatch; download again");
        fail(error);
        throw error;
      }
      const error = await shell.openPath(installer);
      if (error) { fail(new Error(error)); throw new Error(error); }
      return { ...state };
    },
  };
}

function trustedUpdateSender(event, mainWindow, root, liveServerUrl) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame) return false;
  try {
    const url = new URL(event.senderFrame.url);
    if (liveServerUrl && url.origin === new URL(liveServerUrl).origin && url.pathname === "/index.html") return true;
    const { pathToFileURL } = require("node:url");
    return url.href === pathToFileURL(path.join(root, "index.html")).href;
  } catch { return false; }
}

module.exports = { createUpdateManager, newerVersion, trustedAssetUrl, trustedUpdateSender };
