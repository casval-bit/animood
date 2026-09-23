import { useContext } from "react";
import { ThemeContext } from "./themeContextObject.js";

export const useTheme = () => useContext(ThemeContext);
