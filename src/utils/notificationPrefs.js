// ─── Réglages de notifications (cloche) ───────────────────────────────────────────────────────────────────────────
// Trois sortes d'alertes, réglables une par une, toutes activées par défaut :
//   comments : commentaires et réponses sur mes posts / discussions (ou celles où j'ai répondu)
//   mentions : quelqu'un a écrit mon @pseudo
//   invites  : invitations à une partie (LinkUp, Timeline, Cluescale, Imposteur)
// Stockés sur l'appareil (localStorage), par pseudo, comme le reste des préférences de lecture : il n'y a pas de colonne côté serveur.
// Les messages privés gardent leur propre pastille dans l'en-tête (ils ne passent pas par la cloche).
//
// Ancien réglage : un seul interrupteur « animood_notifications_enabled_<pseudo> » ("0" = coupé). On le relit tant que le nouveau n'existe pas
// (coupé → commentaires et mentions coupés ; les invitations n'étaient pas concernées) : personne ne retrouve des alertes qu'il avait coupées.

export const NOTIF_KINDS = ["comments", "mentions", "invites"];
export const DEFAULT_NOTIF_PREFS = Object.freeze({ comments: true, mentions: true, invites: true });

export const notifPrefsKey = (username) => `animood_notif_prefs_${username}`;
const legacyKey = (username) => `animood_notifications_enabled_${username}`;

/** Valeurs inconnues ou absentes → activé ; seules les valeurs `false` coupent. */
export function normalizeNotifPrefs(raw) {
  const out = { ...DEFAULT_NOTIF_PREFS };
  if(raw && typeof raw === "object") for(const k of NOTIF_KINDS) if(raw[k] === false) out[k] = false;
  return out;
}

export function readNotifPrefs(storage, username) {
  if(!username) return { ...DEFAULT_NOTIF_PREFS };
  try {
    const raw = storage?.getItem?.(notifPrefsKey(username));
    if(raw) return normalizeNotifPrefs(JSON.parse(raw));
    if(storage?.getItem?.(legacyKey(username)) === "0") return { ...DEFAULT_NOTIF_PREFS, comments: false, mentions: false };
  } catch { /* stockage bloqué ou JSON abîmé : réglages par défaut */ }
  return { ...DEFAULT_NOTIF_PREFS };
}

export function writeNotifPrefs(storage, username, prefs) {
  if(!username) return;
  try { storage?.setItem?.(notifPrefsKey(username), JSON.stringify(normalizeNotifPrefs(prefs))); } catch { /* stockage plein ou bloqué */ }
}

/** Changement d'un réglage (kind ∈ NOTIF_KINDS) ; une clé inconnue ne change rien. */
export function withNotifPref(prefs, kind, enabled) {
  if(!NOTIF_KINDS.includes(kind)) return normalizeNotifPrefs(prefs);
  return { ...normalizeNotifPrefs(prefs), [kind]: !!enabled };
}

export const allNotifPrefs = (enabled) => Object.fromEntries(NOTIF_KINDS.map(k => [k, !!enabled]));
export const anyActivityNotif = (prefs) => !!(prefs?.comments || prefs?.mentions);
