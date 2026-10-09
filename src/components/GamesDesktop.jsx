// ─── DESKTOP ONLY — onglet Jeux : cartes aérées par catégorie + classement à droite ───
// Le site web garde le GamePanel d'origine (grille compacte). Même logique de données, autre présentation.
import { useState, useEffect } from "react";
import { sb } from "../api/supabase.js";
import { useLang } from "../context/useLang.js";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const TXT = {
  fr: { title: "Mini-jeux", sub: "Affronte la communauté AniMood", solo: "Solo", duel: "Duel en ligne", multi: "Multijoueur", tools: "Outils",
        soloT: "Solo", duelT: "Duel · Elo", multiT: "Multijoueur", pts: "pts", total: "Ton total", totalSub: "Débloque des cadres de profil", rank: "Classement", you: "toi", noRank: "Pas encore de classement" },
  en: { title: "Mini-games", sub: "Take on the AniMood community", solo: "Solo", duel: "Online duel", multi: "Multiplayer", tools: "Tools",
        soloT: "Solo", duelT: "Duel · Elo", multiT: "Multiplayer", pts: "pts", total: "Your total", totalSub: "Unlocks profile frames", rank: "Leaderboard", you: "you", noRank: "No ranking yet" },
};

function Section({ label, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="h-3.5 w-1 rounded-full" style={{ background: GRADIENT_PRIMARY }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>{children}</div>
    </section>
  );
}

function GameCard({ g, sub, ptsLabel, hasElo }) {
  const [hover, setHover] = useState(false);
  const rgb = g.color;
  return (
    <button onClick={g.onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 18, textAlign: "left", cursor: "pointer",
        background: hover ? `rgba(${rgb},0.07)` : "rgba(var(--fg-rgb),0.035)",
        border: `1px solid ${hover ? `rgba(${rgb},0.4)` : "rgba(var(--fg-rgb),0.07)"}`,
        boxShadow: hover ? `0 12px 30px rgba(${rgb},0.14)` : "none",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all .2s ease",
      }}>
      <span style={{ display: "flex", width: 48, height: 48, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 14, fontSize: 23,
        background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.26)` }}>{g.emoji}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
        <span style={{ display: "block", marginTop: 3, fontSize: 11, fontWeight: 600, color: "var(--text-4)" }}>{sub}</span>
      </span>
      {g.pts !== null && (
        <span style={{ flexShrink: 0, textAlign: "right" }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 900, color: `rgb(${rgb})`, lineHeight: 1 }}>{hasElo ? g.pts : "—"}</span>
          <span style={{ display: "block", marginTop: 3, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-5)" }}>{ptsLabel}</span>
        </span>
      )}
    </button>
  );
}

export function GamePanelDesktop({ myUsername, following, onWordle, onPoster, onOpQuiz, onChain, onTimeline, onCluescale, onUndercover, onTierlist, t }) {
  const { lang } = useLang();
  const x = TXT[lang] || TXT.fr;
  const [elo, setElo] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    if (!myUsername) return;
    sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&limit=1`).then((r) => { if (r?.[0]) setElo(r[0]); }).catch(() => {});
  }, [myUsername]);

  useEffect(() => {
    sb.query("game_elo?select=username,elo_chain,elo_timeline,pts_wordle,pts_poster,pts_opquiz,pts_cluescale,pts_undercover&limit=200")
      .then((rows) => {
        if (!rows?.length) return;
        const ranked = rows.map((r) => ({
          username: r.username,
          total: (r.elo_chain || 400) + (r.elo_timeline || 400) + (r.pts_wordle || 0) + (r.pts_poster || 0) + (r.pts_opquiz || 0) + (r.pts_cluescale || 0) + (r.pts_undercover || 0),
        })).sort((a, b) => b.total - a.total);
        setLeaderboard(ranked.slice(0, 20));
        const pos = ranked.findIndex((r) => r.username === myUsername);
        setMyRank(pos >= 0 ? { rank: pos + 1, total: ranked[pos].total } : null);
      }).catch(() => {});
  }, [myUsername]);

  const followingSet = new Set(following || []);
  const color = (u) => (u === myUsername ? "#c084fc" : followingSet.has(u) ? "#22c55e" : "var(--text-2)");
  const hasElo = !!elo;
  const total = elo ? (elo.elo_chain || 400) + (elo.elo_timeline || 400) + (elo.pts_wordle || 0) + (elo.pts_poster || 0) + (elo.pts_opquiz || 0) + (elo.pts_cluescale || 0) + (elo.pts_undercover || 0) : null;

  const solo = [
    { id: "wordle", emoji: "🎯", label: t.wordleLabel, color: "124,58,237", pts: elo?.pts_wordle || 0, onClick: onWordle },
    { id: "poster", emoji: "🖼", label: t.posterLabel, color: "236,72,153", pts: elo?.pts_poster || 0, onClick: onPoster },
    { id: "opquiz", emoji: "🎵", label: t.opquizLabel, color: "56,189,248", pts: elo?.pts_opquiz || 0, onClick: onOpQuiz },
  ];
  const duel = [
    { id: "chain", emoji: "⛓", label: t.chainLabel, color: "251,191,36", pts: elo?.elo_chain || 400, onClick: onChain },
    { id: "timeline", emoji: "📅", label: t.timelineLabel, color: "34,197,94", pts: elo?.elo_timeline || 400, onClick: onTimeline },
  ];
  const multi = [
    { id: "cluescale", emoji: "🎭", label: t.cluescaleLabel, color: "251,113,133", pts: elo?.pts_cluescale || 0, onClick: onCluescale },
    { id: "undercover", emoji: "🕵️", label: t.undercoverLabel, color: "244,114,182", pts: elo?.pts_undercover || 0, onClick: onUndercover },
  ];
  const tools = [{ id: "tierlist", emoji: "📊", label: t.tierlistLabel, color: "34,211,238", pts: null, onClick: onTierlist }];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 32, alignItems: "start" }}>
      <div>
        <Section label={x.solo}>{solo.map((g) => <GameCard key={g.id} g={g} sub={x.soloT} ptsLabel={x.pts} hasElo={hasElo} />)}</Section>
        <Section label={x.duel}>{duel.map((g) => <GameCard key={g.id} g={g} sub={x.duelT} ptsLabel="elo" hasElo={hasElo} />)}</Section>
        <Section label={x.multi}>{multi.map((g) => <GameCard key={g.id} g={g} sub={x.multiT} ptsLabel={x.pts} hasElo={hasElo} />)}</Section>
        <Section label={x.tools}>{tools.map((g) => <GameCard key={g.id} g={g} sub={t.gameTypeTool} ptsLabel="" hasElo={hasElo} />)}</Section>
      </div>

      {/* Colonne droite : total + classement */}
      <aside style={{ position: "sticky", top: 96, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ borderRadius: 18, padding: "18px 20px", background: "rgba(var(--fg-rgb),0.035)", border: "1px solid rgba(var(--fg-rgb),0.07)" }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{x.total}</div>
          <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, lineHeight: 1, letterSpacing: -1, background: GRADIENT_PRIMARY, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{total ?? "—"}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-4)" }}>{x.totalSub}{myRank ? ` · #${myRank.rank}` : ""}</div>
        </div>

        <div style={{ borderRadius: 18, padding: "16px 14px 12px", background: "rgba(var(--fg-rgb),0.035)", border: "1px solid rgba(var(--fg-rgb),0.07)" }}>
          <div className="mb-2.5 flex items-center gap-2.5 px-1.5">
            <span className="h-3.5 w-1 rounded-full" style={{ background: GRADIENT_PRIMARY }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{t.leaderboardTitle || x.rank}</span>
          </div>
          {leaderboard.length === 0 && <div style={{ padding: "14px 8px", textAlign: "center", fontSize: 11, color: "var(--text-5)" }}>{x.noRank}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 440, overflowY: "auto" }}>
            {leaderboard.map((r, i) => {
              const isMe = r.username === myUsername;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={r.username} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10,
                  background: isMe ? "rgba(124,58,237,0.12)" : "transparent", border: isMe ? "1px solid rgba(124,58,237,0.25)" : "1px solid transparent" }}>
                  <span style={{ width: 20, textAlign: "center", fontSize: medal ? 14 : 11, fontWeight: 700, color: "var(--text-5)", flexShrink: 0 }}>{medal || i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: isMe || followingSet.has(r.username) ? 800 : 600, color: color(r.username), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.username}{isMe && <span style={{ marginLeft: 5, fontSize: 10, color: "#c084fc" }}>({x.you})</span>}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)", flexShrink: 0 }}>{r.total}</span>
                </div>
              );
            })}
            {myRank && myRank.rank > 20 && (
              <>
                <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-6)", padding: "2px 0" }}>· · ·</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 10, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
                  <span style={{ width: 20, textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-5)" }}>{myRank.rank}</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: "#c084fc" }}>{myUsername}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)" }}>{myRank.total}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
