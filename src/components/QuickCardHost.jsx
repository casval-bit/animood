// ─── Carte de survol des affiches — appli de bureau uniquement ──────────────────────────────────────────────────────────────────
// Marquer un temps d'arrêt (~0,4 s) sur une affiche (recherche, profil, moodboard…) ouvre une petite carte à côté d'elle : infos de l'animé
// et actions immédiates — note en demi-étoiles, vu, highlight, watchlist, statut, listes — sans ouvrir la fiche. Inspiré de la carte de survol de Millimetre.
//   · une seule instance, montée dans App.jsx (Shell) ; les affiches se signalent avec {...quickProps(id)} (attribut data-quick-anime, utils/quickActions.js) ;
//   · le minutage (arrêt, passage d'une affiche à l'autre, délai de grâce) est dans utils/hoverIntent.js, les changements du profil dans utils/quickActions.js : tous deux testés ;
//   · la carte est un îlot sombre (data-keep-bright) : lisible dans les deux thèmes ; elle ne recouvre jamais l'en-tête (84 px, zone « déplacer la fenêtre »).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { useSound } from "../context/SoundContext.jsx";
import { sb } from "../api/supabase.js";
import { apiCache, supabaseRowToAnime } from "../api/jikan.js";
import { saveUserScore } from "../api/userVotes.js";
import { overlayProps } from "../utils/desktopWindow.js";
import { createHoverIntent } from "../utils/hoverIntent.js";
import {
  STATUS_CHOICES, hasWatched, isOnWatchlist, isHighlighted, scoreOf, statusOf, listsContaining,
  withWatchedToggled, withWatchlistToggled, withHighlightToggled, withStatus, withRating, withListToggled,
  scoreForStar, starFills, placeCard,
} from "../utils/quickActions.js";
import { episodeMinutes, genreNames, studioNames, yearOf, popularityRank, posterOf } from "../utils/animeFacts.js";
import { QUICK_CARD_I18N } from "../constants/quickCardI18n.js";
import { COMMON_I18N } from "../constants/commonI18n.js";
import { STATUS_LABELS, STATUS_COLORS } from "../constants/statuses.js";
import { BookmarkIcon, EyeIcon } from "./ui.jsx";

const CARD_W = 372;
const GOLD = "#fbbf24";

// ── Données : une ligne de anime_cache par animé et par session (ou ce que la fiche animé a déjà chargé) ─────────────────────────
const rowsById = new Map();        // id → ligne reçue
const missingIds = new Set();      // id absents du cache : on ne les redemande pas à chaque survol
const inFlight = new Map();        // id → requête en cours (partagée)
const knownRow = (id) => apiCache[`anime-${id}`]?.data || rowsById.get(id) || null;

function loadRow(id) {
  const known = knownRow(id);
  if (known) return Promise.resolve(known);
  if (missingIds.has(id)) return Promise.resolve(null);
  if (!inFlight.has(id)) {
    inFlight.set(id, sb.getAnimeFromCache(id)
      .then((r) => { if (r) rowsById.set(id, r); else missingIds.add(id); return r || null; })
      .catch(() => null)                                   // réseau : on réessaiera au prochain survol
      .finally(() => inFlight.delete(id)));
  }
  return inFlight.get(id);
}

/** Titre et affiche lus dans l'élément survolé : de quoi afficher quelque chose avant l'arrivée des données. */
function seedFromElement(el) {
  const img = el.matches?.("img") ? el : el.querySelector?.("img");
  return { title: (img?.getAttribute("alt") || "").trim(), img: img?.currentSrc || img?.getAttribute("src") || "" };
}

// ── Petits éléments d'interface ─────────────────────────────────────────────────────────────────────────────────────────────
function StarShape({ color }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M12 2.6l2.8 5.9 6.4.9-4.7 4.5 1.1 6.4L12 17.2l-5.6 3.1 1.1-6.4L2.8 9.4l6.4-.9z" fill={color} />
    </svg>
  );
}

/** 5 étoiles en deux moitiés : chaque moitié est un bouton (1 à 10). */
function Stars({ score, preview, onHover, onRate, t }) {
  const fills = starFills(preview || score);
  return (
    <div role="group" aria-label={t.yourRating} onPointerLeave={() => onHover(0)} style={{ display: "flex", gap: 2 }}>
      {fills.map((f, i) => (
        <span key={i} style={{ position: "relative", display: "inline-block", width: 24, height: 24 }}>
          <StarShape color="rgba(var(--fg-rgb),0.22)" />
          <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${f * 100}%`, overflow: "hidden" }}>
            <StarShape color={GOLD} />
          </span>
          {[scoreForStar(i + 1, true), scoreForStar(i + 1, false)].map((s, half) => (
            <button key={s} type="button" data-quick-star={s} aria-label={t.rateTitle(s)} title={t.rateTitle(s)}
              onPointerEnter={() => onHover(s)} onClick={() => onRate(s)}
              style={{ position: "absolute", top: 0, bottom: 0, left: half ? "50%" : 0, width: "50%", padding: 0, border: 0, background: "transparent", cursor: "pointer" }} />
          ))}
        </span>
      ))}
    </div>
  );
}

function ActionButton({ active, tint, onClick, label, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={!!active}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: 10, cursor: "pointer",
        fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
        color: active ? "var(--text-1)" : "var(--text-2)",
        background: active ? `rgba(${tint},0.22)` : "rgba(var(--fg-rgb),0.06)",
        border: `1px solid ${active ? `rgba(${tint},0.6)` : "rgba(var(--fg-rgb),0.1)"}`,
        boxShadow: active ? `0 0 14px rgba(${tint},0.28)` : "none",
        transition: "background .15s, border-color .15s, box-shadow .15s",
      }}>
      {children}<span>{label}</span>
    </button>
  );
}

function PanelButton({ open, onClick, children, label }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} title={label}
      style={{
        display: "flex", alignItems: "center", gap: 7, minWidth: 0, height: 34, padding: "0 10px", borderRadius: 10, cursor: "pointer",
        fontSize: 11.5, fontWeight: 700, color: "var(--text-1)", textAlign: "left",
        background: open ? "rgba(var(--fg-rgb),0.12)" : "rgba(var(--fg-rgb),0.06)",
        border: `1px solid ${open ? "rgba(var(--ac-8b5cf6),0.6)" : "rgba(var(--fg-rgb),0.1)"}`,
      }}>
      {children}
      <span aria-hidden="true" style={{ marginLeft: "auto", fontSize: 9, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}

// ── La carte ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function QuickCard({ el, id, onClose, onOpenDetail }) {
  const { me, saveMe, myUsername } = useApp();
  const { lang } = useLang();
  const { playSound } = useSound();
  const t = QUICK_CARD_I18N[lang] || QUICK_CARD_I18N.fr;
  const c = COMMON_I18N[lang] || COMMON_I18N.fr;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.fr;
  const [row, setRow] = useState(() => knownRow(id));
  const [seed] = useState(() => seedFromElement(el));
  const [panel, setPanel] = useState(null);                 // « status » | « lists » | null
  const [hover, setHover] = useState(0);                    // note survolée (aperçu des étoiles)
  const [failed, setFailed] = useState(false);              // la requête a abouti sans rien trouver (ou a échoué)
  const ref = useRef(null);
  const hasRow = !!row;

  // Données : si la fiche n'est pas déjà en mémoire, une requête (partagée et mémorisée pour la session)
  useEffect(() => {
    if (hasRow) return undefined;
    let alive = true;
    loadRow(id).then((r) => { if (!alive) return; if (r) setRow(r); else setFailed(true); });
    return () => { alive = false; };
  }, [id, hasRow]);

  // Position : à côté de l'affiche, mesurée avant l'affichage ; suit les changements de hauteur (données qui arrivent, volet ouvert)
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const place = () => {
      const p = placeCard(el.getBoundingClientRect(), { w: node.offsetWidth, h: node.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
      node.style.left = `${Math.round(p.x)}px`;
      node.style.top = `${Math.round(p.y)}px`;
      node.dataset.side = p.side;
    };
    place();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(node);
    return () => ro?.disconnect();
  }, [el]);

  // L'affiche a disparu de la page (changement d'onglet, liste mise à jour) : la carte part avec elle
  useEffect(() => {
    const timer = setInterval(() => { if (!el.isConnected) onClose(); }, 300);
    return () => clearInterval(timer);
  }, [el, onClose]);

  const title = row?.title || seed.title || "";
  const poster = posterOf(row) || seed.img || "";
  const year = yearOf(row);
  const epMin = episodeMinutes(row);
  const eps = row?.type === "Movie" ? 0 : row?.episodes;
  const meta = [year, row?.type, eps ? `${eps} ${t.epsShort}` : null, epMin ? `${epMin} ${t.minShort}` : null].filter(Boolean).join(" · ");
  const genres = genreNames(row).slice(0, 3);
  const studio = studioNames(row)[0];
  const rank = popularityRank(row);
  const mal = Number(row?.score) > 0 ? Number(row.score) : null;

  const watched = hasWatched(me, id), onList = isOnWatchlist(me, id), heart = isHighlighted(me, id);
  const score = scoreOf(me, id) || 0;
  const status = statusOf(me, id);
  const lists = me.customLists || [];
  const inLists = listsContaining(me, id);

  const apply = (next) => { playSound("click"); saveMe(next); };
  const rate = (s) => {
    const next = score === s ? 0 : s;                       // re-cliquer la même note la retire
    playSound(next ? "vote" : "click");
    saveMe(withRating(me, id, next));
    saveUserScore(myUsername, id, next, me.ratings?.[id]?.moods ?? []);   // friends / communauté : comme « Enregistrer » dans la fiche
    setHover(0);
  };
  const openSheet = () => {
    const anime = row ? (row.images ? row : supabaseRowToAnime(row)) : { mal_id: id, title, images: { jpg: { image_url: poster, large_image_url: poster } } };
    onClose();
    onOpenDetail?.({ ...anime, mal_id: id });
  };

  const shown = hover || score;

  return (
    <div ref={ref} {...overlayProps()} data-quick-card="" data-keep-bright="" role="group" aria-label={t.region} className="quick-card"
      style={{ position: "fixed", zIndex: 400, width: CARD_W, borderRadius: 18, overflow: "hidden", color: "var(--text-1)", background: "rgba(var(--ac-0d0b18),0.98)", border: "1px solid rgba(var(--ac-8b5cf6),0.4)", boxShadow: "0 18px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04), 0 0 40px rgba(var(--ac-6d28d9),0.18)" }}>
      {/* ── Identité de l'animé ── */}
      <div style={{ display: "flex", gap: 12, padding: 12 }}>
        <button type="button" onClick={openSheet} title={t.openSheet} aria-label={t.openSheet}
          style={{ flexShrink: 0, width: 88, height: 132, padding: 0, border: 0, borderRadius: 10, overflow: "hidden", cursor: "pointer", background: "rgba(var(--fg-rgb),0.06)" }}>
          {poster && <img src={poster} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />}
        </button>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" onClick={openSheet} title={t.openSheet}
            style={{ padding: 0, border: 0, background: "none", cursor: "pointer", textAlign: "left", color: "var(--text-1)", fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {title || t.loading}
          </button>
          {meta
            ? <div style={{ fontSize: 11, color: "var(--text-2)" }}>{meta}</div>
            : <div style={{ fontSize: 11, color: "var(--text-3)" }}>{failed ? t.unknown : ""}</div>}
          {(mal || rank) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-2)" }}>
              {mal && <span title={t.malScore} style={{ color: GOLD, fontWeight: 800 }}>★ {mal.toFixed(2)}</span>}
              {rank && <span>{t.popularity(rank)}</span>}
            </div>
          )}
          {genres.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {genres.map((g) => <span key={g} style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, color: "rgb(var(--ac-818cf8))", background: "rgba(var(--ac-818cf8),0.14)" }}>{g}</span>)}
            </div>
          )}
          {studio && <div style={{ fontSize: 10.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{studio}</div>}
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px 12px", borderTop: "1px solid rgba(var(--fg-rgb),0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 46, fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>{t.yourRating}</span>
          <Stars score={score} preview={hover} onHover={setHover} onRate={rate} t={t} />
          <span data-quick-score="" style={{ minWidth: 38, fontSize: 11.5, fontWeight: 800, color: shown ? GOLD : "var(--text-3)" }}>{shown ? t.ratingOf(shown) : "—"}</span>
          {score > 0 && (
            <button type="button" onClick={() => rate(score)} title={t.clearRating} aria-label={t.clearRating}
              style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: 999, border: "1px solid rgba(var(--fg-rgb),0.12)", background: "rgba(var(--fg-rgb),0.06)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          <ActionButton active={watched} tint="var(--ac-818cf8)" label={t.seen} title={watched ? c.markUnwatched : c.markWatched} onClick={() => apply(withWatchedToggled(me, id))}>
            <EyeIcon filled={watched} size={15} />
          </ActionButton>
          <ActionButton active={heart} tint="var(--ac-ec4899)" label={t.heart} title={heart ? c.removeFromHighlights : c.addToHighlights} onClick={() => apply(withHighlightToggled(me, id))}>
            <span aria-hidden="true" style={{ fontSize: 13 }}>{heart ? "❤️" : "🤍"}</span>
          </ActionButton>
          <ActionButton active={onList} tint="34,197,94" label={t.watchlist} title={onList ? c.removeFromWatchlist : c.addToWatchlist} onClick={() => apply(withWatchlistToggled(me, id))}>
            <BookmarkIcon filled={onList} size={15} />
          </ActionButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <PanelButton open={panel === "status"} label={t.status} onClick={() => setPanel(panel === "status" ? null : "status")}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: status ? STATUS_COLORS[status]?.dot : "rgba(var(--fg-rgb),0.3)" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status ? statusLabels[status] : t.noStatus}</span>
          </PanelButton>
          <PanelButton open={panel === "lists"} label={t.lists} onClick={() => setPanel(panel === "lists" ? null : "lists")}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inLists.length ? t.inLists(inLists.length) : t.addToList}</span>
          </PanelButton>
        </div>

        {panel === "status" && (
          <div role="group" aria-label={t.status} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUS_CHOICES.map((s) => {
              const on = (me.statuses || {})[id] === s;
              return (
                <button key={s} type="button" data-quick-status={s} aria-pressed={on} onClick={() => apply(withStatus(me, id, s))}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--text-1)",
                    background: on ? STATUS_COLORS[s].bg : "rgba(var(--fg-rgb),0.05)", border: `1px solid ${on ? STATUS_COLORS[s].dot : "rgba(var(--fg-rgb),0.1)"}` }}>
                  <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_COLORS[s].dot }} />{statusLabels[s]}
                </button>
              );
            })}
          </div>
        )}

        {panel === "lists" && (
          lists.length === 0
            ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.noLists}</div>
            : (
              <div role="group" aria-label={t.lists} style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 156, overflowY: "auto" }}>
                {lists.map((l) => {
                  const on = (l.animeIds || []).includes(id);
                  return (
                    <button key={l.id} type="button" data-quick-list={l.id} aria-pressed={on} onClick={() => apply(withListToggled(me, l.id, id))}
                      style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 30, padding: "0 10px", borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 700, textAlign: "left", color: "var(--text-1)",
                        background: on ? "rgba(var(--ac-8b5cf6),0.2)" : "rgba(var(--fg-rgb),0.05)", border: `1px solid ${on ? "rgba(var(--ac-8b5cf6),0.6)" : "rgba(var(--fg-rgb),0.1)"}` }}>
                      <span aria-hidden="true" style={{ width: 14, textAlign: "center", color: on ? GOLD : "var(--text-3)" }}>{on ? "✓" : "+"}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-3)" }}>{(l.animeIds || []).length}</span>
                    </button>
                  );
                })}
              </div>
            )
        )}
      </div>
    </div>
  );
}

// ── L'hôte : écoute le survol de toute la page (délégation sur data-quick-anime) et affiche la carte ────────────────────────────
let showCount = 0;

export function QuickCardHost({ onOpenDetail }) {
  const [active, setActive] = useState(null);                // { el, id, n }
  const [intent] = useState(() => createHoverIntent({
    onShow: (el) => setActive({ el, id: Number(el.getAttribute("data-quick-anime")), n: ++showCount }),
    onHide: () => setActive(null),
  }));

  useEffect(() => {
    const inCard = (node) => node instanceof Element && !!node.closest("[data-quick-card]");
    const mouseLike = (e) => !e.pointerType || e.pointerType === "mouse" || e.pointerType === "pen";   // un doigt qui touche l'écran n'ouvre pas la carte
    const onOver = (e) => {
      if (!mouseLike(e) || !(e.target instanceof Element)) return;
      if (inCard(e.target)) { intent.overCard(); return; }
      const poster = e.target.closest("[data-quick-anime]");
      if (poster) intent.overTarget(poster); else intent.leave();
    };
    const onOut = (e) => { if (!e.relatedTarget) intent.leave(); };                   // le pointeur sort de la fenêtre
    const onDown = (e) => { if (!inCard(e.target)) intent.hideNow(); };               // clic ailleurs (l'affiche elle-même ouvre sa fiche)
    const onKey = (e) => { if (e.key === "Escape" && intent.isOpen()) { e.stopPropagation(); intent.hideNow(); } };
    const hide = () => intent.hideNow();
    const onVisibility = () => { if (document.hidden) intent.hideNow(); };
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", hide, true);                                    // défilement de la page ou d'une liste : l'affiche bouge, la carte part
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
      intent.dispose();
    };
  }, [intent]);

  if (!active || !(active.id > 0) || typeof document === "undefined") return null;
  return createPortal(<QuickCard key={active.n} el={active.el} id={active.id} onClose={intent.hideNow} onOpenDetail={onOpenDetail} />, document.body);
}
