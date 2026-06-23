const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const https = require("node:https");
const path = require("node:path");

const DEFAULT_PORT = Number(process.env.PORT || 5173);
const CONNECTIVITY_CHECK_URLS = [
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?num=1&offset=0",
  "https://www.db.yugioh-card.com/yugiohdb/",
];
const CONNECTIVITY_TIMEOUT_MS = 1200;

let mainWindow = null;
let liveServer = null;
let liveServerUrl = null;

function appRoot() {
  return app.getAppPath();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: "Yu-Gi-Oh! Seed Deck Builder",
    backgroundColor: "#0b111a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

function openCachedMode() {
  if (!mainWindow) return;
  mainWindow.loadFile(path.join(appRoot(), "index.html"));
}

async function openAutoMode() {
  if (!mainWindow) return;

  const online = await hasNetworkAccess();
  if (!online) {
    openCachedMode();
    return;
  }

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

async function ensureLiveServer() {
  if (liveServerUrl && liveServer && !liveServer.killed) return liveServerUrl;

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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

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
      if (match) finish(`http://127.0.0.1:${match[1]}/index.html?api=1`);
    });

    child.stderr.on("data", (chunk) => {
      console.error(chunk.toString());
    });

    child.once("error", fail);
    child.once("exit", (code) => {
      liveServer = null;
      liveServerUrl = null;
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

function hasNetworkAccess() {
  return new Promise((resolve) => {
    let pending = CONNECTIVITY_CHECK_URLS.length;
    let settled = false;
    const done = (online) => {
      if (settled) return;
      if (online) {
        settled = true;
        resolve(true);
        return;
      }
      pending -= 1;
      if (pending <= 0) {
        settled = true;
        resolve(false);
      }
    };

    for (const url of CONNECTIVITY_CHECK_URLS) {
      const req = https.get(url, { timeout: CONNECTIVITY_TIMEOUT_MS }, (res) => {
        res.resume();
        done(res.statusCode >= 200 && res.statusCode < 500);
      });

      req.once("timeout", () => {
        req.destroy();
        done(false);
      });
      req.once("error", () => done(false));
    }

    setTimeout(() => {
      done(false);
      pending = 0;
      done(false);
    }, CONNECTIVITY_TIMEOUT_MS + 250).unref();
  });
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
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", stopLiveServer);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
