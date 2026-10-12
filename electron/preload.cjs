/**
 * AniMood Desktop — Preload Script
 *
 * Runs in the renderer context but has access to Node APIs (sandboxed via
 * contextBridge).  Exposes only a safe, typed API surface to the React app via
 * `window.animood`.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("animood", {
  // ── Streaming deep-links ─────────────────────────────────────────────────
  /**
   * Open a streaming link in the system's default browser.
   * @param {"crunchyroll"|"netflix"|"amazon"|"adn"|string} service
   * @param {string} url  — full URL to the show page or episode
   * @returns {Promise<{ok: boolean, service?: string, error?: string}>}
   */
  openStream: (service, url) =>
    ipcRenderer.invoke("open-stream", { service, url }),

  /**
   * Retrouve la page d'un animé sur un site perso. @param {{host:string,titles:string[]}} req
   * @returns {Promise<{url:string|null, kind:"page"|"search"|"none"}>}
   */
  resolveSiteLink: (req) => ipcRenderer.invoke("resolve-site-link", req),

  /**
   * Open any external URL in the default browser.
   * @param {string} url
   */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  /**
   * Listen for deep-link stream events (animood://stream?...) relayed from
   * the main process.  Returns an unsubscribe function.
   * @param {(payload: {service: string, url: string}) => void} cb
   */
  onDeepLinkStream: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("deep-link-stream", handler);
    return () => ipcRenderer.off("deep-link-stream", handler);
  },

  // ── Window controls (custom title bar) ───────────────────────────────────
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close:    () => ipcRenderer.send("window-close"),

  // ── App metadata ─────────────────────────────────────────────────────────
  /** @returns {Promise<string>} */
  getVersion: () => ipcRenderer.invoke("get-version"),

  // ── Auto-updater ─────────────────────────────────────────────────────────
  /** Manually trigger an update check. */
  checkUpdate: () => ipcRenderer.invoke("check-update"),

  /** @param {(info: object) => void} cb */
  onUpdateAvailable: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.off("update-available", handler);
  },

  /** @param {(info: object) => void} cb */
  onUpdateDownloaded: (cb) => {
    const handler = (_e, info) => cb(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.off("update-downloaded", handler);
  },

  /** @param {(msg: string) => void} cb */
  onUpdateError: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.off("update-error", handler);
  },

  // ── Platform detection ───────────────────────────────────────────────────
  platform: process.platform, // "darwin" | "win32" | "linux"
  isDesktop: true,
});
