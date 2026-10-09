const { app, BrowserWindow, Menu, dialog, shell, ipcMain, net: electronNet, safeStorage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { createUpdateManager, trustedUpdateSender } = require("./update-manager.cjs");
const { attachCardImageNetwork } = require("./card-image-network.cjs");

const { createAiManager } = require("./ai-client.cjs");

const DEFAULT_PORT = Number(process.env.PORT || 5173);

let mainWindow = null;
let liveServer = null;
let liveServerUrl = null;
let serverIsOffline = false;
let updates;

function appRoot() {
  return app.getAppPath();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1280,
    minHeight: 720,
    title: "Yu-Gi-Oh! Seed Deck Builder",
    backgroundColor: "#0b111a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.argv.includes("--offline")) {
    openCachedMode();
  } else {
    openAutoMode();
  }
}

async function openCachedMode() {
  if (!mainWindow) return;
  try {
    const url = await ensureLiveServer({ offline: true });
    await mainWindow.loadURL(url);
  } catch {
    await mainWindow.loadFile(path.join(appRoot(), "index.html"));
  }
}

async function openAutoMode() {
  if (!mainWindow) return;
  await openLiveMode({ silentFallback: true });
}

async function openLiveMode(options = {}) {
  if (!mainWindow) return;

  try {
    const url = await ensureLiveServer();
    await mainWindow.loadURL(url);
  } catch (error) {
    if (!options.silentFallback) {
      dialog.showErrorBox(
        "实时刷新服务启动失败",
        `${error.message}\n\n可以继续使用离线缓存模式。`,
      );
    }
    openCachedMode();
  }
}

async function ensureLiveServer({ offline = false } = {}) {
  if (liveServerUrl && liveServer && !liveServer.killed && serverIsOffline === offline) return liveServerUrl;
  stopLiveServer();
  serverIsOffline = offline;

  const root = appRoot();
  const serverScript = path.join(root, "tools", "serve-with-refresh.mjs");
  const port = await findFreePort(DEFAULT_PORT);
  const resourceCacheDir = path.join(app.getPath("userData"), "resource-cache");
  const child = spawn(process.execPath, [serverScript], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      YGO_RESOURCE_CACHE_DIR: resourceCacheDir,
      YGO_DATA_DIR: path.join(app.getPath("userData"), "data-cache"),
      YGO_OFFLINE: offline ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    serialization: "advanced",
  });
  attachCardImageNetwork(child, (...args) => electronNet.fetch(...args));

  liveServer = child;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("本地刷新服务启动超时。"));
    }, 8000);

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      liveServerUrl = url;
      resolve(url);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) finish(`http://127.0.0.1:${match[1]}/index.html?api=${offline ? "0" : "1"}`);
    });

    child.stderr.on("data", (chunk) => {
      console.error(chunk.toString());
    });

    child.once("error", fail);
    child.once("exit", (code) => {
      if (liveServer === child) {
        liveServer = null;
        liveServerUrl = null;
      }
      if (!settled) fail(new Error(`本地刷新服务已退出，退出码：${code ?? "unknown"}`));
    });
  });
}

function stopLiveServer() {
  if (liveServer && !liveServer.killed) {
    liveServer.kill();
  }
  liveServer = null;
  liveServerUrl = null;
}

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    const tryPort = () => {
      if (port >= startPort + 50) {
        reject(new Error("没有找到可用端口。"));
        return;
      }

      const server = net.createServer();
      server.once("error", () => {
        port += 1;
        tryPort();
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };

    tryPort();
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about", label: "关于" },
            { type: "separator" },
            { role: "quit", label: "退出" },
          ],
        }]
      : []),
    {
      label: "模式",
      submenu: [
        {
          label: "切换到离线缓存模式",
          accelerator: "CmdOrCtrl+1",
          click: openCachedMode,
        },
        {
          label: "切换到实时刷新模式",
          accelerator: "CmdOrCtrl+2",
          click: openLiveMode,
        },
        {
          label: "自动选择模式",
          accelerator: "CmdOrCtrl+0",
          click: openAutoMode,
        },
        {
          label: "停止实时刷新服务",
          click: stopLiveServer,
        },
        { type: "separator" },
        {
          label: "重新载入",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.reload(),
        },
      ],
    },
    {
      label: "开发",
      submenu: [
        {
          label: "切换开发者工具",
          accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  app.setName("Yu-Gi-Oh! Seed Deck Builder");
  const installedWindows = app.isPackaged && process.platform === "win32" && !process.env.PORTABLE_EXECUTABLE_FILE && fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
  updates = createUpdateManager({
    app, shell, fetch: (...args) => electronNet.fetch(...args),
    nativeUpdater: installedWindows ? require("electron-updater").autoUpdater : null,
  });
  updates.events.on("change", (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:state", state);
  });
  for (const [channel, method] of [["updates:get-state", "getState"], ["updates:check", "check"], ["updates:install", "install"]]) {
    ipcMain.handle(channel, (event) => {
      if (!trustedUpdateSender(event, mainWindow, appRoot(), liveServerUrl)) throw new Error("Untrusted update request");
      return updates[method]();
    });
  }
  const aiManager = createAiManager({ directory: app.getPath("userData"), safeStorage, fetch: (...args) => electronNet.fetch(...args) });
  for (const [channel, method] of [["ai:config", "getConfig"], ["ai:save", "saveConfig"], ["ai:forget-key", "forgetKey"], ["ai:request", "request"], ["ai:cancel", "cancel"]]) {
    ipcMain.handle(channel, async (event, payload) => {
      if (!trustedUpdateSender(event, mainWindow, appRoot(), liveServerUrl)) throw new Error("Untrusted AI request");
      try { return { ok: true, value: await aiManager[method](payload) }; }
      catch (error) { return { ok: false, error: /^ai\w+(?::\d+)?$/.test(error.message) ? error.message : "aiSettingsError" }; }
    });
  }
  app.on("before-quit", () => aiManager.cancel());
  buildMenu();
  createWindow();
  setTimeout(() => updates.check(), 8000).unref();
  setInterval(() => updates.check(), 6 * 60 * 60 * 1000).unref();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", stopLiveServer);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
