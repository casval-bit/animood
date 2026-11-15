import { useState, useEffect, useCallback } from "react";
import { ThemeContext } from "./themeContextObject.js";
import { readStoredPalette, applyPalette, PALETTE_IDS, PALETTE_STORAGE_KEY, DEFAULT_PALETTE } from "../constants/palettes.js";

const STORAGE_KEY = "animood_theme";

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || "dark");
  // Palette de couleurs (appli de bureau uniquement ; sur le site web elle reste « default » et rien n'est écrit)
  const [palette, setPaletteState] = useState(readStoredPalette);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyPalette(palette);
    if (document.documentElement.dataset.app !== "desktop") return;
    try { localStorage.setItem(PALETTE_STORAGE_KEY, palette); } catch { /* stockage indisponible : le choix ne sera pas mémorisé */ }
  }, [palette]);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === "dark" ? "light" : "dark"));
  }, []);

  const setPalette = useCallback((id) => {
    setPaletteState(PALETTE_IDS.includes(id) ? id : DEFAULT_PALETTE);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}
