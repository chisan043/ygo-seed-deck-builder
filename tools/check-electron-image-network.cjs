const { app, net, session } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ygo-image-electron-"));
app.setPath("userData", profile);

app.whenReady().then(async () => {
  try {
    const { checkNetwork, fixtureFetch, sourceCalls } = await import(pathToFileURL(path.join(__dirname, "check-card-image-network.mjs")));
    // Intercept only in this isolated test process; production downloads use
    // the real Chromium session and its system proxy settings.
    session.defaultSession.protocol.handle("https", request => fixtureFetch(request.url, { signal: request.signal }));
    // Inject fault cases directly: protocol handlers do not faithfully forward
    // thrown errors or cancellation. Real image/metadata requests use net.fetch.
    await checkNetwork((url, options) => /\/[345]\.jpg$/.test(url) ? fixtureFetch(url, options) : net.fetch(url, options));
    if (!sourceCalls.some(url => url.includes("/sc/")) || !sourceCalls.some(url => url.includes("/jp/"))) throw new Error("Chromium did not handle both localized sources");
    console.log("Native Electron image checks passed: the server uses Chromium for every language with an empty cache and blocked Node networking");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on("quit", () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows can hold the session's temporary files until exit. */ } });
