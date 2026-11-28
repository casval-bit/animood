// ─── Cartes « ticket » à partager (appli de bureau) : billet d'un animé noté, billet de profil ──────────────────────────────────────────────
// La carte à l'écran EST l'image exportée (comme la grille 2026) : un bloc de largeur fixe, aux couleurs fixes (îlot sombre, `data-keep-bright`),
// dessiné en PNG par utils/posterExport.js (copier, partager, télécharger). Les encoches du billet sont des disques de la couleur du « papier »
// (fond de l'image) posés sur le bord : html2canvas ne sait pas découper une forme, mais il sait dessiner ça.
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal.jsx";
import { Poster } from "./Poster.jsx";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { loadAnimeMeta } from "../api/animeMeta.js";
import { getStatusLabel, STATUS_COLORS } from "../constants/statuses.js";
import { SHARE_TICKET_I18N } from "../constants/shareTicketI18n.js";
import { MOODS } from "../constants/moods.js";
import { memberData, sampleLibrary } from "../utils/compatibility.js";
import { statusOf } from "../utils/quickActions.js";
import { buildAnimeTicket, buildProfileTicket, topGenresOf, clipText, NOTE_MAX } from "../utils/shareTicket.js";
import { renderToCanvas, downloadCanvas, copyCanvas, canShareImages, shareCanvas, safeFileName } from "../utils/posterExport.js";

const PAPER = "#0f0a1e";                                   // fond de l'image : les encoches ont cette couleur
const INK = "#f8fafc", MUTED = "rgba(226,232,240,0.62)", FAINT = "rgba(226,232,240,0.38)", GOLD = "#fbbf24";
const TICKET_BG = "linear-gradient(135deg,#2b1666 0%,#1a0f3d 50%,#3b1553 100%)";
const EDGE = "rgba(255,255,255,0.14)";
const WIDTH = 700, STUB = 176, NOTCH = 24;
const moodEmoji = (id) => MOODS.find((m) => m.id === id)?.emoji || "";

// ── Éléments communs ──────────────────────────────────────────────────────────────────────────────────────────────────────
function Barcode({ bars }) {
  return (
    // la largeur du code-barres suit toujours celle du talon : chaque barre grandit en proportion de son poids (1, 2 ou 3)
    <div style={{ display: "flex", alignItems: "stretch", width: "100%", height: 34, gap: 1.5 }} aria-hidden="true">
      {bars.map((w, i) => <div key={i} style={{ flex: w, background: "rgba(248,250,252,0.78)" }} />)}
    </div>
  );
}

const pill = (extra = {}) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, lineHeight: 1.5, border: `1px solid ${EDGE}`, color: "rgba(226,232,240,0.88)", background: "rgba(255,255,255,0.06)", ...extra });

/** Le billet : papier sombre, corps à gauche, talon à droite séparé par une ligne de perforation et deux encoches. */
function TicketShell({ innerRef, kind, children, stub, minHeight }) {
  return (
    <div ref={innerRef} data-keep-bright="" data-ticket={kind} style={{ width: WIDTH, boxSizing: "border-box", padding: 22, background: PAPER, color: INK, fontFamily: "inherit" }}>
      <div style={{ position: "relative", display: "flex", minHeight, borderRadius: 20, overflow: "hidden", background: TICKET_BG, border: `1px solid ${EDGE}`, boxShadow: "0 10px 34px rgba(0,0,0,0.45)" }}>
        <div style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: 20 }}>{children}</div>
        <div style={{ width: STUB, boxSizing: "border-box", padding: "20px 16px", borderLeft: "2px dashed rgba(255,255,255,0.28)", display: "flex", flexDirection: "column", alignItems: "center" }}>{stub}</div>
        <span style={{ position: "absolute", top: -NOTCH / 2, right: STUB - NOTCH / 2 + 1, width: NOTCH, height: NOTCH, borderRadius: "50%", background: PAPER }} />
        <span style={{ position: "absolute", bottom: -NOTCH / 2, right: STUB - NOTCH / 2 + 1, width: NOTCH, height: NOTCH, borderRadius: "50%", background: PAPER }} />
      </div>
    </div>
  );
}

// ── Billet d'un animé ───────────────────────────────────────────────────────────────────────────────────────────────────────
function AnimeTicket({ innerRef, tk, t, lang }) {
  const statusColor = tk.statusId ? STATUS_COLORS[tk.statusId]?.dot : null;
  return (
    <TicketShell innerRef={innerRef} kind="anime" minHeight={300}
      stub={(
        <>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2.4, color: GOLD, textAlign: "center" }}>{tk.score ? t.myRating : t.unrated}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "center", color: tk.score ? INK : FAINT }}>
            <span style={{ fontSize: 66, fontWeight: 900, lineHeight: 1 }} data-ticket-score={tk.score ?? ""}>{tk.score ?? "—"}</span>
            {tk.score && <span style={{ fontSize: 18, fontWeight: 800, color: MUTED, marginLeft: 3 }}>/10</span>}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 3 }} aria-hidden="true">
            {tk.pips.map((on, i) => <span key={i} style={{ width: 10, height: 6, borderRadius: 2, background: on ? GOLD : "rgba(255,255,255,0.14)" }} />)}
          </div>
          {tk.statusId && (
            <div style={{ marginTop: 12, ...pill({ color: INK }) }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor || GOLD }} />{getStatusLabel(tk.statusId, lang)}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <Barcode bars={tk.bars} />
          <div style={{ marginTop: 6, fontSize: 9.5, letterSpacing: 1.6, fontWeight: 800, color: MUTED }}>N° {tk.number}</div>
        </>
      )}>
      <div style={{ display: "flex", gap: 18 }}>
        <div style={{ width: 142, height: 213, flexShrink: 0, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 22px rgba(0,0,0,0.5)", border: `1px solid ${EDGE}` }}>
          <Poster anime={tk.poster} name={tk.title} w={142} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 260 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2.6, color: GOLD }}>🎟️ {t.admit}</div>
          <div data-ticket-title="" style={{ marginTop: 8, fontSize: tk.titleSize, fontWeight: 900, lineHeight: 1.12, letterSpacing: -0.3, color: INK, maxHeight: 96, overflow: "hidden" }}>{tk.title}</div>
          {tk.romaji && <div style={{ marginTop: 3, fontSize: 11, color: FAINT }}>{clipText(tk.romaji, 38)}</div>}
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: MUTED }}>{tk.meta.join("  ·  ")}</div>
          {tk.genres.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>{tk.genres.map((g) => <span key={g} style={pill()}>{g}</span>)}</div>}
          {(tk.studio || tk.malScore) && (
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: MUTED }}>
              {tk.studio}{tk.studio && tk.malScore ? "  ·  " : ""}{tk.malScore && <span>{t.malScore} <span style={{ color: GOLD }}>★ {tk.malScore}</span></span>}
            </div>
          )}
          {tk.moods.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 5 }}>
              {tk.moods.map((m) => <span key={m} style={pill({ borderColor: "rgba(196,181,253,0.4)", background: "rgba(139,92,246,0.18)" })}>{moodEmoji(m)} {t.moodLabels[m] || m}</span>)}
            </div>
          )}
          {tk.note && <div data-ticket-note="" style={{ marginTop: 9, fontSize: 12, fontStyle: "italic", lineHeight: 1.35, color: "rgba(248,250,252,0.86)", maxHeight: 52, overflow: "hidden", overflowWrap: "anywhere" }}>« {tk.note} »</div>}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 9.5, letterSpacing: 1.6, fontWeight: 800, color: FAINT }}>{tk.date.toUpperCase()}  ·  ANIMOOD.ME</div>
        </div>
      </div>
    </TicketShell>
  );
}

// ── Billet d'un profil ──────────────────────────────────────────────────────────────────────────────────────────────────────
function ProfileTicket({ innerRef, tk, t }) {
  const avatarIsImage = /^(https?:|data:)/.test(tk.avatar || "");
  return (
    <TicketShell innerRef={innerRef} kind="profile" minHeight={330}
      stub={(
        <>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2.4, color: GOLD, textAlign: "center" }}>{t.member}</div>
          <div style={{ marginTop: 14, fontSize: 40 }} aria-hidden="true">🎟️</div>
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: INK, textAlign: "center", wordBreak: "break-all" }}>@{tk.username}</div>
          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "center" }}>{tk.date}</div>
          <div style={{ flex: 1 }} />
          <Barcode bars={tk.bars} />
          <div style={{ marginTop: 6, fontSize: 9.5, letterSpacing: 1.6, fontWeight: 800, color: MUTED }}>N° {tk.number}</div>
        </>
      )}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
          background: "linear-gradient(135deg,#6d5bff,#8b5cf6,#ec4899)", border: `2px solid ${EDGE}` }}>
          {avatarIsImage
            ? <img src={tk.avatar} data-raw={tk.avatar} alt={tk.name} referrerPolicy="no-referrer" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : (tk.avatar || "👤")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-ticket-name="" style={{ fontSize: tk.name.length > 18 ? 20 : 26, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.3, color: INK, maxHeight: 60, overflow: "hidden" }}>{tk.name}</div>
          <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>@{tk.username}</span>
            {tk.badge && <span style={pill({ color: GOLD, borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)" })}>{tk.badge.emoji} {tk.badge.label}</span>}
          </div>
        </div>
      </div>
      {tk.motto && <div data-ticket-motto="" style={{ marginTop: 10, fontSize: 12, fontStyle: "italic", lineHeight: 1.35, color: "rgba(248,250,252,0.82)", maxHeight: 52, overflow: "hidden", overflowWrap: "anywhere" }}>« {tk.motto} »</div>}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        {[[tk.stats.watched, t.statWatched], [tk.stats.rated, t.statRated], [tk.stats.avg != null ? tk.stats.avg.toFixed(1) : "—", t.statAvg]].map(([v, label]) => (
          <div key={label} style={{ flex: 1, padding: "8px 6px", textAlign: "center", borderRadius: 12, border: `1px solid ${EDGE}`, background: "rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: INK }}>{v}</div>
            <div style={{ marginTop: 2, fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>{label}</div>
          </div>
        ))}
      </div>
      {tk.topGenres.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <span style={{ marginRight: 3, fontSize: 9.5, fontWeight: 900, letterSpacing: 1.8, color: GOLD }}>{t.genres}</span>
          {tk.topGenres.map((g) => <span key={g} style={pill()}>{g}</span>)}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 9.5, fontWeight: 900, letterSpacing: 1.8, color: GOLD }}>{t.favorites}</div>
      {tk.favorites.length > 0 ? (
        <div style={{ marginTop: 6, display: "flex", gap: 10 }}>
          {tk.favorites.map((f) => (
            <div key={f.id} data-ticket-fav={f.id} style={{ width: 80, height: 120, flexShrink: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${EDGE}`, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
              <Poster anime={f.poster} name={f.title} w={80} />
            </div>
          ))}
        </div>
      ) : <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", color: FAINT }}>{t.noFavorites}</div>}
    </TicketShell>
  );
}

// ── La fenêtre ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const toolBtn = (disabled) => ({ padding: "8px 14px", borderRadius: 12, fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
  border: "1px solid rgba(var(--fg-rgb),0.18)", background: "transparent", color: "var(--text-2)" });

/**
 * @param {"anime"|"profile"} kind
 * @param {object} [anime]  l'animé (objet « Jikan » ou ligne anime_cache) pour kind="anime"
 * @param {{label: string, emoji?: string}} [badge]  badge affiché sur le billet de profil
 */
export function ShareTicketModal({ kind, anime, badge, onClose }) {
  const { me, myUsername } = useApp();
  const { lang } = useLang();
  const t = SHARE_TICKET_I18N[lang] || SHARE_TICKET_I18N.fr;
  const ref = useRef(null);
  const [now] = useState(() => new Date());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);                 // null | "png" | "copied"
  const [failed, setFailed] = useState(false);
  const canShare = useMemo(() => canShareImages(), []);

  // Profil : fiches des 5 favoris + un échantillon de la bibliothèque (pour les genres préférés)
  const mine = useMemo(() => memberData(me), [me]);
  const sample = useMemo(() => (kind === "profile" ? sampleLibrary(mine, 150) : []), [kind, mine]);
  const ids = useMemo(() => (kind === "profile" ? [...new Set([...(me.favorites || []).filter(Boolean), ...sample])] : []), [kind, me.favorites, sample]);
  const [loaded, setLoaded] = useState({ rows: {}, done: false });
  useEffect(() => {
    if (kind !== "profile") return undefined;
    let cancelled = false;
    loadAnimeMeta(ids).then(({ rows }) => { if (!cancelled) setLoaded({ rows, done: true }); });
    return () => { cancelled = true; };
  }, [kind, ids]);

  const ticket = useMemo(() => {
    if (kind === "anime") {
      const r = me.ratings?.[anime?.mal_id];
      return buildAnimeTicket({ anime, score: r?.score ?? null, moods: r?.moods || [], statusId: statusOf(me, anime?.mal_id), note, seed: myUsername, lang, now });
    }
    const rows = loaded.rows;
    return buildProfileTicket({
      name: me.name, username: myUsername, avatar: me.avatar_base64 || me.avatar, bio: me.bio, badge,
      watched: me.watched, ratings: me.ratings, lang, now,
      favorites: (me.favorites || []).filter(Boolean).map((id) => ({ id, title: rows[id]?.title_en || rows[id]?.title, row: rows[id] })),
      topGenres: topGenresOf({ ids: sample, ratings: mine.ratings }, rows, 3),
    });
  }, [kind, anime, me, myUsername, lang, now, note, loaded.rows, sample, mine.ratings, badge]);

  const title = kind === "anime" ? t.titleAnime : t.titleProfile;
  const fileName = kind === "anime" ? `animood-ticket-${safeFileName(ticket.title, `anime-${ticket.id}`)}.png` : `animood-profil-${safeFileName(ticket.username, "profil")}.png`;
  const run = async (what) => {
    if (!ref.current || busy) return;
    setBusy("png"); setFailed(false);
    try {
      const canvas = await renderToCanvas(ref.current, { backgroundColor: PAPER, scale: 2 });
      if (what === "download") downloadCanvas(canvas, fileName);
      else if (what === "copy") { await copyCanvas(canvas); setBusy("copied"); setTimeout(() => setBusy(null), 1600); return; }
      else await shareCanvas(canvas, { fileName, title, text: kind === "anime" ? t.shareTextAnime(ticket.title) : t.shareTextProfile(ticket.name) });
    } catch (e) { console.error(e); setFailed(true); }
    setBusy(null);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {(close) => (
        <div className="p-6" data-ticket-modal={kind}>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-slate-100">🎟️ {title}</h2>
            <button type="button" onClick={close} aria-label={t.close} title={t.close}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/8 hover:text-slate-300">✕</button>
          </div>
          <p className="mb-4 text-xs text-slate-500">{kind === "anime" ? t.hintAnime : t.hintProfile}</p>
          {kind === "anime" && (
            <input value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} aria-label={t.noteLabel} data-ticket-note-input=""
              className="mb-4 w-full rounded-xl border border-white/10 bg-white/4 px-3.5 py-2.5 text-[13px] text-slate-200 outline-none transition focus:border-violet-400/60" />
          )}
          <div className="overflow-x-auto pb-1">
            <div className="mx-auto" style={{ width: WIDTH }}>
              {kind === "anime"
                ? <AnimeTicket innerRef={ref} tk={ticket} t={t} lang={lang} />
                : <ProfileTicket innerRef={ref} tk={ticket} t={t} />}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {failed && <span className="mr-auto text-xs text-rose-400" role="alert" data-ticket-error="">{t.exportError}</span>}
            <button type="button" onClick={() => run("copy")} disabled={!!busy} data-ticket-copy="" style={toolBtn(!!busy)}>{busy === "copied" ? t.copied : `⧉ ${t.copy}`}</button>
            {canShare && <button type="button" onClick={() => run("share")} disabled={!!busy} data-ticket-share="" style={toolBtn(!!busy)}>↗ {t.share}</button>}
            <button type="button" onClick={() => run("download")} disabled={!!busy} data-ticket-download=""
              style={{ ...toolBtn(!!busy), border: "none", color: "#1f1300", background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>{busy === "png" ? t.exporting : `⬇ ${t.download}`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
