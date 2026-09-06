import { useContext } from "react";
import { LangContext } from "./langContextObject.js";

export const useLang = () => useContext(LangContext);
