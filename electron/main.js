/**
 * AniMood Desktop — Electron Main Process
 *
 * Features:
 *  - Single BrowserWindow loading the Vite dev server (dev) or built app (prod)
 *  - Custom frameless window with native traffic-light controls on macOS
 *  - Protocol handler: animood://  for streaming deep-links
 *  - IPC bridge for opening streaming links in the default browser
 *  - Auto-updater (electron-updater) using GitHub releases
 *  - System tray icon with quick-access menu
 */

import { app, BrowserWindow, ipcMain, shell, protocol, Menu, Tray, nativeImage, session } from "electron";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import { resolveSiteLink } from "./siteResolver.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

// Sécurité : on n'ouvre dans le navigateur système QUE des liens http(s) — jamais file://, javascript:, ms-msdt:, etc.
const safeHttpUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch { return null; } };

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
// animood://stream?service=crunchyroll&url=https://...
if (!app.isDefaultProtocolClient("animood")) {
  app.setAsDefaultProtocolClient("animood");
}

// ── Window reference ───────────────────────────────────────────────────────────
let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#020617", // slate-950 — avoids white flash on load
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame: process.platform !== "darwin",
    show: false,
    icon: path.join(__dirname, "../public/logo-mark.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // le preload n'utilise que contextBridge/ipcRenderer
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Load app
  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Show window once ready to avoid white flash
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  // La fenêtre ne doit JAMAIS naviguer hors de l'appli (sinon une page distante aurait accès au pont window.animood)
  win.webContents.on("will-navigate", (e, url) => {
    const ok = url.startsWith("http://localhost:5173") || url.startsWith("file://");
    if (!ok) { e.preventDefault(); const h = safeHttpUrl(url); if (h) shell.openExternal(h); }
  });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());

  // Open external links in default browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });

  return win;
}

// ── Tray icon ──────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "../public/logo-mark.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("AniMood");

  const menu = Menu.buildFromTemplate([
    { label: "Ouvrir AniMood", click: () => { if (win) { win.show(); win.focus(); } else { createWindow(); } } },
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
app.whenReady().then(() => {
  // Aucune permission sensible (géolocalisation, caméra, micro, USB…) n'est jamais accordée à l'appli
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["notifications", "clipboard-sanitized-write"].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ["notifications", "clipboard-sanitized-write"].includes(permission));
  // Lecteur de trailer intégré : depuis file:// l'iframe YouTube part sans Referer et affiche « erreur 153 ».
  // On ajoute un Referer https UNIQUEMENT à la requête de l'iframe /embed/ de YouTube (rien d'autre n'est modifié).
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["https://www.youtube-nocookie.com/embed/*", "https://www.youtube.com/embed/*"], types: ["subFrame"] },
    (details, cb) => { const h = { ...details.requestHeaders }; if (!h.Referer && !h.referer) h.Referer = "https://animood.app/"; cb({ requestHeaders: h }); }
  );
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

app.on("window-all-closed", () => {
  // On macOS keep the process alive (tray remains)
  if (process.platform !== "darwin") app.quit();
});

// macOS: handle animood:// links when app is already open
app.on("open-url", (_event, url) => {
  handleDeepLink(url);
});

// Windows / Linux: handle animood:// links via argv
app.on("second-instance", (_event, argv) => {
  const link = argv.find((a) => a.startsWith("animood://"));
  if (link) handleDeepLink(link);
  if (win) { win.show(); win.focus(); }
});

// ── Deep link handler ─────────────────────────────────────────────────────────
/**
 * animood://stream?service=crunchyroll&url=https%3A%2F%2F...
 * Forwarded to the renderer via IPC so it can update the UI.
 */
function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.host === "stream") {
      const service = parsed.searchParams.get("service") || "";
      const streamUrl = parsed.searchParams.get("url") || "";
      if (streamUrl && win) {
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
ipcMain.handle("open-stream", async (_event, { service, url: streamUrl }) => {
  const safe = safeHttpUrl(streamUrl);
  if (!safe) return { ok: false, error: "Invalid URL" };
  try {
    await shell.openExternal(safe);
    return { ok: true, service };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/**
 * Renderer → retrouve la page d'un animé sur un site perso (domaine saisi par l'utilisateur).
 * Entrées validées ; le résolveur refuse les adresses privées et ne fait que des GET.
 */
ipcMain.handle("resolve-site-link", async (_event, req) => {
  try {
    const host = typeof req?.host === "string" ? req.host.slice(0, 120) : "";
    const titles = Array.isArray(req?.titles) ? req.titles.filter((t) => typeof t === "string").map((t) => t.slice(0, 200)).slice(0, 8) : [];
    const r = await resolveSiteLink({ host, titles });
    return { url: r.url ? safeHttpUrl(r.url) : null, kind: r.kind };
  } catch { return { url: null, kind: "none" }; }
});

/**
 * Renderer → open any external URL in the default browser.
 */
ipcMain.handle("open-external", async (_event, url) => {
  const safe = safeHttpUrl(url);
  if (!safe) return;
  await shell.openExternal(safe).catch(() => {});
});

/**
 * Renderer → window controls (custom title bar on Windows/Linux).
 */
ipcMain.on("window-minimize", () => win?.minimize());
ipcMain.on("window-maximize", () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on("window-close", () => win?.close());

/**
 * Renderer → request current app version.
 */
ipcMain.handle("get-version", () => app.getVersion());

/**
 * Renderer → manually trigger update check.
 */
ipcMain.handle("check-update", async () => {
  if (!autoUpdater) return { available: false, reason: "updater-disabled" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, info: result?.updateInfo };
  } catch (e) {
    return { available: false, error: e.message };
  }
});

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

// ── macOS single-instance guard ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
