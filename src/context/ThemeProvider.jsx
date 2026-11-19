import { useState, useEffect, useCallback } from "react";
import { ThemeContext } from "./themeContextObject.js";
import { readStoredPalette, applyPalette, applyThemeColor, PALETTE_IDS, PALETTE_STORAGE_KEY, DEFAULT_PALETTE } from "../constants/palettes.js";

const STORAGE_KEY = "animood_theme";

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || "dark");
  // Palette de couleurs (site, APK et appli de bureau) ; sans choix mémorisé : « default » = les couleurs d'origine
  const [palette, setPaletteState] = useState(readStoredPalette);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyPalette(palette);
    applyThemeColor(palette);
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
