import { useContext } from "react";
import { AppContext } from "./appContextObject.js";

export const useApp = () => useContext(AppContext);
