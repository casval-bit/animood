import { useLang } from "../context/useLang.js";
import { GUEST_I18N } from "../constants/guestI18n.js";

// Textes du mode invité dans la langue courante
export function useGuestT() {
  const { lang } = useLang();
  return GUEST_I18N[lang] || GUEST_I18N.fr;
}
