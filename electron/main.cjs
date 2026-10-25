/**
 * AniMood Desktop — Electron Main Process
 *
 * Features:
 *  - Single BrowserWindow loading the Vite dev server (dev) or the live website (prod)
 *    → the desktop UI ships with every Vercel deploy, no reinstall needed
 *  - Google login in the system browser, back into the app via animood://auth-callback
 *  - Protocol handler: animood://  for streaming deep-links
 *  - IPC bridge for opening streaming links in the default browser
 *  - Auto-updater (electron-updater) using GitHub releases (shell updates only)
 *  - System tray icon with quick-access menu
 *  - Offline page with retry when the site can't be reached
 */

// CommonJS on purpose: on some Windows setups Electron silently exits (code 0, no window) when the
// main entry is an ES module run from the project folder (`electron .`).
const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const { fileURLToPath } = require("url");
const isDev = !app.isPackaged;

// Site chargé par l'appli installée (surcharge possible : ANIMOOD_URL=http://localhost:5173)
const APP_URL = process.env.ANIMOOD_URL || (isDev ? "http://localhost:5173" : "https://animood-rho.vercel.app");
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON = path.join(__dirname, "icon.png");
const OFFLINE_PAGE = path.join(__dirname, "offline.html");

// Same origin as the site — compares the parsed origin (a prefix check would let
// "https://animood-rho.vercel.app.evil.com" through)
function isAppUrl(url) {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
}
function isOfflinePage(url) {
  try { return url.startsWith("file:") && fileURLToPath(url.split(/[?#]/)[0]) === OFFLINE_PAGE; } catch { return false; }
}
// Only web links leave the app: shell.openExternal on file:, smb:, ms-msdt:… can run programs
function isWebUrl(url) {
  try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; }
}
function openWebUrl(url) {
  if (!isWebUrl(url)) return Promise.resolve(false);
  return shell.openExternal(url).then(() => true, () => false);
}
// IPC is only accepted from the AniMood site or the local offline page (never from a third-party frame)
function trustedSender(event) {
  const url = event.senderFrame?.url || "";
  return isAppUrl(url) || isOfflinePage(url);
}

// ── Single instance (must run before anything else) ───────────────────────────
// A second launch (e.g. an animood:// link on Windows/Linux) is forwarded to the
// first instance through "second-instance", then quits.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ── Auto-updater (only in production) ─────────────────────────────────────────
let autoUpdater = null;
if (!isDev) {
  try {
    const { autoUpdater: au } = require("electron-updater");
    autoUpdater = au;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch {
    // electron-updater not installed; update checks silently disabled
  }
}

// ── Deep link protocol ─────────────────────────────────────────────────────────
// animood://auth-callback#access_token=...   (Google login, see src/api/supabase.js)
// animood://stream?service=crunchyroll&url=https://...
if (isDev && process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient("animood", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("animood");
}

// ── Window reference ───────────────────────────────────────────────────────────
let win = null;
let tray = null;
let pageReady = false;
let pendingLinks = [process.argv.find((a) => a.startsWith("animood://"))].filter(Boolean); // cold start (Windows/Linux)

function createWindow() {
  pageReady = false;
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#020617", // slate-950 — avoids white flash on load
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform !== "darwin",
    show: false,
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  win.loadURL(APP_URL);
  if (isDev) win.webContents.openDevTools({ mode: "detach" });

  // Show window once ready to avoid white flash
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  // Page loaded → deliver links received before it was ready (login callback on cold start)
  win.webContents.on("did-finish-load", () => {
    if (!isAppUrl(win.webContents.getURL())) return;
    pageReady = true;
    const links = pendingLinks;
    pendingLinks = [];
    links.forEach(handleDeepLink);
  });

  // No connection → local offline page with a retry button
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navigation aborted (normal)
    win.loadFile(OFFLINE_PAGE);
    win.show();
  });

  // Stay on AniMood: any other site opens in the default browser
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return;
    event.preventDefault();
    openWebUrl(url);
  });
  win.webContents.on("will-redirect", (event, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return;
    event.preventDefault();
    openWebUrl(url);
  });

  // Open external links in default browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    openWebUrl(url);
    return { action: "deny" };
  });

  // No <webview>, and no camera / micro / location… for the site or anything it embeds
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  const ses = win.webContents.session;
  const ALLOWED_PERMISSIONS = ["fullscreen", "mediaKeySystem", "clipboard-sanitized-write"]; // trailers / YouTube embeds
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.includes(permission)));

  win.on("closed", () => {
    win = null;
    pageReady = false;
  });

  return win;
}

function focusWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ── Tray icon ──────────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("AniMood");

  const menu = Menu.buildFromTemplate([
    { label: "Ouvrir AniMood", click: focusWindow },
    { type: "separator" },
    { label: "Quitter", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (win) { win.isVisible() ? win.hide() : win.show(); }
    else { createWindow(); }
  });
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
if (gotLock) {
  app.whenReady().then(() => {
    createWindow();
    if (process.platform !== "linux") createTray();

    // Check for updates after 3 s (avoids blocking startup)
    if (autoUpdater) {
      setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 3000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  // On macOS keep the process alive (tray remains)
  if (process.platform !== "darwin") app.quit();
});

// macOS: handle animood:// links (may fire before the window exists)
app.on("open-url", (event, url) => {
  event.preventDefault();
  receiveLink(url);
});

// Windows / Linux: handle animood:// links via argv
app.on("second-instance", (_event, argv) => {
  const link = argv.find((a) => a.startsWith("animood://"));
  if (link) receiveLink(link);
  else focusWindow();
});

function receiveLink(url) {
  if (app.isReady()) focusWindow();
  if (pageReady) handleDeepLink(url);
  else pendingLinks.push(url);
}

// ── Deep link handler ─────────────────────────────────────────────────────────
/**
 * animood://auth-callback#access_token=...  → session handed to the renderer
 * animood://stream?service=crunchyroll&url=https%3A%2F%2F...
 * Forwarded to the renderer via IPC so it can update the UI.
 */
function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "animood:") return;
    if (parsed.host === "auth-callback") {
      win?.webContents.send("auth-callback", url);
    } else if (parsed.host === "stream") {
      const service = parsed.searchParams.get("service") || "";
      const streamUrl = parsed.searchParams.get("url") || "";
      if (isWebUrl(streamUrl) && win) {
        win.webContents.send("deep-link-stream", { service, url: streamUrl });
      }
    }
  } catch {}
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

/**
 * Renderer → open a streaming link in the system browser.
 * Called from preload.js via window.animood.openStream(service, url)
 */
ipcMain.handle("open-stream", async (event, { service, url: streamUrl } = {}) => {
  if (!trustedSender(event)) return { ok: false, error: "Forbidden" };
  if (!isWebUrl(streamUrl)) return { ok: false, error: "Invalid URL" };
  return (await openWebUrl(streamUrl)) ? { ok: true, service } : { ok: false, error: "Open failed" };
});

/**
 * Renderer → open any external URL in the default browser (http/https only).
 */
ipcMain.handle("open-external", async (event, url) => {
  if (!trustedSender(event)) return;
  await openWebUrl(url);
});

/**
 * Renderer → window controls (custom title bar on Windows/Linux).
 */
ipcMain.on("window-minimize", (event) => { if (trustedSender(event)) win?.minimize(); });
ipcMain.on("window-maximize", (event) => {
  if (!trustedSender(event)) return;
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on("window-close", (event) => { if (trustedSender(event)) win?.close(); });

/**
 * Offline page → retry loading the site.
 */
ipcMain.on("retry-load", (event) => { if (trustedSender(event)) win?.loadURL(APP_URL); });

/**
 * Renderer → request current app version.
 */
ipcMain.handle("get-version", () => app.getVersion());

/**
 * Renderer → manually trigger update check.
 */
ipcMain.handle("check-update", async (event) => {
  if (!trustedSender(event)) return { available: false, reason: "forbidden" };
  if (!autoUpdater) return { available: false, reason: "updater-disabled" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, info: result?.updateInfo };
  } catch (e) {
    return { available: false, error: e.message };
  }
});

/**
 * Renderer → restart now and install the downloaded update.
 */
ipcMain.on("install-update", (event) => { if (trustedSender(event)) autoUpdater?.quitAndInstall(); });

// Relay auto-updater events to the renderer
if (autoUpdater) {
  autoUpdater.on("update-available", (info) => {
    win?.webContents.send("update-available", info);
  });
  autoUpdater.on("update-downloaded", (info) => {
    win?.webContents.send("update-downloaded", info);
  });
  autoUpdater.on("error", (err) => {
    win?.webContents.send("update-error", err?.message);
  });
}
