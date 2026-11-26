// ─── Onglet « Top 3 » : mon vote + résultats (communauté / amis, points / plus de n°1 / ratio de n°1) ───────────────────────────────
// Mon top 3 : 3 places (1er = 3 points, 2e = 2, 3e = 1). Choisir un animé déjà placé échange les deux places. Le brouillon est gardé
// sur l'appareil ; « Enregistrer » l'envoie (un seul vote par membre, le renvoyer remplace le précédent).
// Résultats : classements calculés par utils/awards2026.js à partir des votes lus par useAwardsData.
import { useState, useEffect, useMemo } from "react";
import { useApp } from "../../context/useApp.js";
import { useLang } from "../../context/useLang.js";
import { awardsText } from "../../constants/awardsI18n.js";
import { saveMyBallot, deleteMyBallot } from "../../api/awards2026.js";
import { notifyAwardsChanged } from "../../utils/awardsSync.js";
import {
  placePick, clearPick, slotsToPicks, sameTop3, readTop3Draft, writeTop3Draft, lightAnime, animeName, RANK_MODES, SCOPES,
} from "../../utils/awards2026.js";
import { Poster } from "../Poster.jsx";

const GOLD = "251,191,36";
const MEDALS = ["🥇", "🥈", "🥉"];
const safeLocal = () => { try { return window.localStorage; } catch { return null; } };

const chip = (active) => ({
  minHeight: 34, padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  border: `1px solid ${active ? "rgb(var(--ac-a78bfa))" : "rgba(var(--ac-8b5cf6),0.22)"}`,
  background: active ? "rgba(var(--ac-8b5cf6),0.28)" : "rgba(var(--ac-8b5cf6),0.06)",
  color: active ? "rgb(var(--ac-ddd6fe))" : "var(--text-3)",
});
const smallBtn = { minHeight: 32, padding: "5px 10px", borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer",
  border: "1px solid rgba(var(--ac-8b5cf6),0.25)", background: "rgba(var(--ac-8b5cf6),0.08)", color: "rgb(var(--ac-c4b5fd))" };

function Slot({ index, anime, label, onPick, onRemove, t }) {
  return (
    <div data-testid={`top3-slot-${index + 1}`} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 900, color: `rgb(${GOLD})` }}>
        <span aria-hidden="true">{MEDALS[index]}</span><span>{label}</span>
      </div>
      <button type="button" onClick={onPick} aria-label={`${label} — ${anime ? animeName(anime) : t.pickAnime}`}
        style={{ position: "relative", display: "block", width: "100%", aspectRatio: "2 / 3", borderRadius: 12, overflow: "hidden", padding: 0, cursor: "pointer",
          border: anime ? `2px solid rgba(${GOLD},0.75)` : "2px dashed rgba(var(--ac-8b5cf6),0.45)", background: anime ? "rgb(var(--ac-1a1030))" : "rgba(var(--ac-8b5cf6),0.06)",
          boxShadow: anime ? `0 6px 18px rgba(${GOLD},0.16)` : "none" }}>
        {anime
          ? <Poster anime={anime} name={animeName(anime)} w={110} />
          : <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "rgb(var(--ac-c4b5fd))" }}>
              <span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 11, fontWeight: 800 }}>{t.pickAnime}</span>
            </span>}
      </button>
      <div style={{ minHeight: 30, fontSize: 11.5, fontWeight: 800, lineHeight: 1.25, color: "var(--text-1)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {anime ? animeName(anime) : ""}
      </div>
      {anime && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={onPick} style={smallBtn}>{t.changeAnime}</button>
          <button type="button" onClick={onRemove} style={{ ...smallBtn, color: "var(--text-4)" }} aria-label={`${t.removeAnime} — ${animeName(anime)}`}>✕</button>
        </div>
      )}
    </div>
  );
}

function stat(mode, r, t) {
  if(mode === "firsts") return { main: t.firstsCount(r.firsts), sub: `${r.points} ${t.pts}` };
  if(mode === "ratio") return { main: `${Math.round(r.ratio * 100)} %`, sub: `${r.firsts} / ${r.mentions}` };
  return { main: `${r.points} ${t.pts}`, sub: t.mentionsCount(r.mentions) };
}

function PodiumCard({ rank, row, anime, mode, t }) {
  const st = stat(mode, row, t);
  const first = rank === 0;
  return (
    <div data-testid={`podium-${rank + 1}`} data-id={row.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0, marginTop: first ? 0 : 16 }}>
      <span aria-hidden="true" style={{ fontSize: first ? 26 : 20, lineHeight: 1 }}>{MEDALS[rank]}</span>
      <div style={{ width: "100%", aspectRatio: "2 / 3", borderRadius: 12, overflow: "hidden", background: "rgb(var(--ac-1a1030))",
        border: `2px solid rgba(${GOLD},${first ? 0.85 : 0.45})`, boxShadow: first ? `0 8px 24px rgba(${GOLD},0.25)` : "0 3px 10px rgba(0,0,0,0.25)" }}>
        <Poster anime={anime} name={animeName(anime)} w={110} />
      </div>
      <div style={{ width: "100%", textAlign: "center", fontSize: 11.5, fontWeight: 800, lineHeight: 1.25, color: "var(--text-1)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{animeName(anime)}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: `rgb(${GOLD})` }}>{st.main}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-4)" }}>{st.sub}</div>
    </div>
  );
}

export function Top3Panel({ data, pickAnime }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = awardsText(lang);
  const storage = safeLocal();

  const [draft0] = useState(() => readTop3Draft(storage, myUsername));
  const [slots, setSlots] = useState(draft0.slots);
  const [savedIds, setSavedIds] = useState(draft0.savedIds);
  const [status, setStatus] = useState("idle");               // idle | saving | saved | local | error
  const [confirmClear, setConfirmClear] = useState(false);
  const [scope, setScope] = useState("community");
  const [mode, setMode] = useState("points");
  const [expanded, setExpanded] = useState(false);

  // Le serveur fait foi pour mon vote enregistré : voté depuis un autre appareil → on reprend ce vote ; retiré ailleurs → il n'est plus « enregistré ».
  // (Ajustement pendant l'affichage, une seule fois par lecture du serveur : pas d'effet qui modifie l'état.)
  const { loading, myPicks, details } = data;
  const serverKey = loading ? null : `${myPicks ? myPicks.join(",") : "none"}|${data.missing ? "m" : ""}`;
  const [adopted, setAdopted] = useState(null);
  if(serverKey !== null && serverKey !== adopted) {
    setAdopted(serverKey);
    if(myPicks) {
      const sameBase = !!savedIds && savedIds.every((id, i) => id === myPicks[i]);
      if(!sameBase) {
        const next = myPicks.map(id => lightAnime(details.get(id)));
        setSlots(next.every(Boolean) ? next : [null, null, null]);
      }
      setSavedIds(myPicks);
    } else if(savedIds && !data.missing) setSavedIds(null);
  }

  useEffect(() => { writeTop3Draft(storage, myUsername, { slots, savedIds }); }, [slots, savedIds]);   // eslint-disable-line react-hooks/exhaustive-deps

  const picks = slotsToPicks(slots);
  const isSaved = !!picks && sameTop3(slots, savedIds);
  const labels = [t.slotFirst, t.slotSecond, t.slotThird];

  const choose = async (i) => {
    const taken = new Map(slots.map((s, k) => (s ? [s.mal_id, k + 1] : null)).filter(Boolean));
    const row = await pickAnime({ title: `${MEDALS[i]} ${labels[i]}`, taken });
    if(row) { setSlots(prev => placePick(prev, i, row)); setStatus("idle"); }
  };

  const save = async () => {
    if(!picks || status === "saving") return;
    setStatus("saving");
    try {
      const res = await saveMyBallot(myUsername, picks);
      if(res.missing) { setStatus("local"); return; }
      setSavedIds(picks); setStatus("saved"); data.refresh();
      notifyAwardsChanged();                    // le podium du bloc de fin d'année se recalcule tout de suite
    } catch { setStatus("error"); }
  };

  const clearVote = async () => {
    if(!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); return; }
    setConfirmClear(false);
    try { await deleteMyBallot(myUsername); } catch { /* hors ligne : le vote reste, rien n'est effacé ici */ setStatus("error"); return; }
    setSlots([null, null, null]); setSavedIds(null); setStatus("idle"); data.refresh();
    notifyAwardsChanged();
  };

  // ── Résultats ──
  const ranking = data.rankings?.[scope]?.[mode];
  const list = ranking?.list || [];
  const podium = list.slice(0, 3);
  const rest = list.slice(3);
  const emptyText = useMemo(() => {
    if(data.missing) return t.resultsMissing;
    if(scope === "friends" && data.friends.length === 0) return t.noFriends;
    if(!ranking || ranking.voters === 0) return scope === "friends" ? t.noFriendVotes : t.noVotes;
    return list.length === 0 ? t.noRanked : "";
  }, [data.missing, data.friends.length, scope, ranking, list.length, t]);
  const help = mode === "ratio" ? t.modeHelpRatio(ranking?.minMentions ?? 2) : mode === "firsts" ? t.modeHelpFirsts : t.modeHelpPoints;
  const modeLabel = { points: t.modePoints, firsts: t.modeFirsts, ratio: t.modeRatio };
  const scopeLabel = { community: t.scopeCommunity, friends: t.scopeFriends };

  return (
    <div style={{ padding: "14px 14px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── Mon top 3 ── */}
      <section aria-label={t.myTop3}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>{t.myTop3}</h3>
        <p style={{ margin: "4px 0 12px", fontSize: 12, lineHeight: 1.5, color: "var(--text-3)" }}>{t.myTop3Hint}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, maxWidth: 520 }}>
          {[0, 1, 2].map(i => (
            <Slot key={i} index={i} anime={slots[i]} label={labels[i]} t={t}
              onPick={() => choose(i)} onRemove={() => { setSlots(prev => clearPick(prev, i)); setStatus("idle"); }} />
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={save} disabled={!picks || isSaved || status === "saving"} data-testid="top3-save"
            style={{ minHeight: 40, padding: "9px 18px", borderRadius: 12, border: "none", fontSize: 12.5, fontWeight: 900,
              cursor: !picks || isSaved || status === "saving" ? "default" : "pointer", opacity: !picks || isSaved ? 0.55 : 1,
              color: "#1f1300", background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>
            {status === "saving" ? t.saving : savedIds ? t.updateTop3 : t.saveTop3}
          </button>
          {savedIds && (
            <button type="button" onClick={clearVote} data-testid="top3-clear" style={{ ...smallBtn, minHeight: 40, color: confirmClear ? "#fb7185" : "var(--text-4)" }}>
              {confirmClear ? "✕ " : ""}{t.clearVote}
            </button>
          )}
          <span role="status" data-testid="top3-status" style={{ fontSize: 12, fontWeight: 700, color: status === "error" ? "#fb7185" : isSaved ? "#22c55e" : "var(--text-4)" }}>
            {status === "error" ? t.saveError : status === "local" ? t.localOnly : isSaved ? t.saved : picks ? (savedIds ? t.unsaved : "") : t.needThree}
          </span>
        </div>
      </section>

      {/* ── Résultats ── */}
      <section aria-label={t.results} data-testid="top3-results">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--text-1)" }}>{t.results}</h3>
          {ranking && ranking.voters > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-4)" }}>{t.voters(ranking.voters)}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 2 }} role="tablist" aria-label={t.results}>
          {SCOPES.map(sc => <button key={sc} type="button" role="tab" aria-selected={scope === sc} onClick={() => { setScope(sc); setExpanded(false); }} style={chip(scope === sc)} data-testid={`scope-${sc}`}>{scopeLabel[sc]}</button>)}
          <span aria-hidden="true" style={{ width: 1, background: "rgba(var(--ac-8b5cf6),0.2)", flexShrink: 0 }} />
          {RANK_MODES.map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setExpanded(false); }} style={chip(mode === m)} data-testid={`mode-${m}`}>{modeLabel[m]}</button>)}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--text-4)" }}>
          {help}{scope === "friends" ? ` ${t.scopeFriendsHelp}` : ""}
        </p>

        {data.loading ? (
          <div style={{ padding: "26px 0", textAlign: "center", fontSize: 12, color: "var(--text-4)" }}>{t.loading}</div>
        ) : data.error ? (
          <div style={{ padding: "22px 0", textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
            {t.resultsError} <button type="button" onClick={data.refresh} style={{ ...smallBtn, marginLeft: 8 }}>{t.retry}</button>
          </div>
        ) : emptyText ? (
          <div data-testid="top3-empty" style={{ padding: "26px 8px", textAlign: "center", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-3)" }}>{emptyText}</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 14, maxWidth: 520 }}>
              {[podium[1], podium[0], podium[2]].map((row, k) => {
                if(!row) return <div key={k} />;
                const rank = row === podium[0] ? 0 : row === podium[1] ? 1 : 2;
                return <PodiumCard key={row.id} rank={rank} row={row} anime={data.details.get(row.id)} mode={mode} t={t} />;
              })}
            </div>
            {rest.length > 0 && (
              <div style={{ marginTop: 14, maxWidth: 520 }}>
                <button type="button" onClick={() => setExpanded(v => !v)} style={chip(false)} aria-expanded={expanded} data-testid="top10-toggle">{expanded ? t.hideTen : t.showTen}</button>
                {expanded && (
                  <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {rest.map((row, i) => {
                      const a = data.details.get(row.id); const st = stat(mode, row, t);
                      return (
                        <li key={row.id} data-testid="top10-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 8px", borderRadius: 10, background: "rgba(var(--fg-rgb),0.04)" }}>
                          <span style={{ width: 22, textAlign: "center", fontSize: 12, fontWeight: 900, color: "var(--text-4)" }}>{i + 4}</span>
                          <span style={{ width: 30, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgb(var(--ac-1a1030))" }}><Poster anime={a} name="" w={30} /></span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{animeName(a)}</span>
                          <span style={{ textAlign: "right", flexShrink: 0 }}>
                            <span style={{ display: "block", fontSize: 12, fontWeight: 900, color: `rgb(${GOLD})` }}>{st.main}</span>
                            <span style={{ display: "block", fontSize: 10, color: "var(--text-4)" }}>{st.sub}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
