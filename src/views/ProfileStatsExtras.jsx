// ─── Stats en plus de l'onglet « Stats » du profil (appli de bureau) : goût « de niche », santé de la watchlist, calendrier d'activité ─────────────
// Trois cartes dans le style HUD de l'onglet. Les calculs sont dans utils/statsExtras.js (pur, testé) ; ici : la lecture des données et l'affichage.
//  · ObscurityCard : rangs de popularité déjà lus par l'onglet (statsData.popRows), aucune requête en plus
//  · WatchlistCard : fiches des animés « à voir » (api/animeMeta.js, par lots de 100)
//  · ActivityCard  : dates des notes (api/voteActivity.js, 3 000 au plus)
import { useEffect, useMemo, useState } from "react";
import { useLang } from "../context/useLang.js";
import { HudCard, HudTitle } from "./profileHud.jsx";
import { loadAnimeMeta } from "../api/animeMeta.js";
import { loadVoteTimes, MAX_PAGES, PAGE_SIZE } from "../api/voteActivity.js";
import { STATS_EXTRAS_I18N } from "../constants/statsExtrasI18n.js";
import { obscurityOf, watchlistHealth, formatSpan, activityStats, dayLabel } from "../utils/statsExtras.js";
import { formatRuntime } from "../utils/shareTicket.js";
import { formatHours } from "../utils/animeFacts.js";
import { quickProps } from "../utils/quickActions.js";
import { withAlpha } from "../utils/withAlpha.js";

const GOLD = "#fbbf24";
const MUTED = "rgba(148,163,184,.85)";
const SOFT = "rgba(148,163,184,.6)";
const useT = () => { const { lang } = useLang(); return { lang, t: STATS_EXTRAS_I18N[lang] || STATS_EXTRAS_I18N.fr }; };
const Empty = ({ children, ...rest }) => <div {...rest} style={{ padding: "26px 8px", textAlign: "center", fontSize: 11, color: SOFT }}>{children}</div>;
const Note = ({ children, ...rest }) => <div {...rest} style={{ fontSize: 10, fontStyle: "italic", color: SOFT }}>{children}</div>;
const SubTitle = ({ children, hint }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-2)" }}>{children}</div>
    {hint && <div style={{ fontSize: 9, color: SOFT, textAlign: "right" }}>{hint}</div>}
  </div>
);
const seedOf = (it) => ({ mal_id: it.id, title: it.title, title_english: it.title, title_en: it.title, image_url: it.img, type: it.type || undefined, score: it.score || undefined, images: { jpg: { image_url: it.img, large_image_url: it.img } } });

/** Chiffre-clé à plat (les cartes HUD s'emboîtent mal les unes dans les autres). */
function Tile({ icon, label, value, sub, color, ...rest }) {
  return (
    <div {...rest} style={{ padding: "10px 6px", textAlign: "center", borderRadius: 12, border: "1px solid rgba(var(--ac-8b5cf6),0.16)", background: "rgba(var(--ac-8b5cf6),0.06)", minWidth: 0 }}>
      {icon && <div style={{ fontSize: 12, color, marginBottom: 3, filter: `drop-shadow(0 0 6px ${withAlpha(color, "88")})` }}>{icon}</div>}
      <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1.15, textShadow: `0 0 12px ${withAlpha(color, "66")}` }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(148,163,184,0.7)", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Une rangée d'affiches cliquables (ouvre la fiche ; la carte de survol marche dessus) avec une légende dessous. */
function Shelf({ shelf, title, hint, items, columns, caption, onOpen, maxPoster = 108 }) {
  if (!items.length) return null;
  return (
    <section data-extras-shelf={shelf} style={{ minWidth: 0 }}>
      <SubTitle hint={hint}>{title}</SubTitle>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, ${maxPoster}px))`, gap: 10, justifyContent: "start" }}>
        {items.map((it) => (
          <div key={it.id} style={{ minWidth: 0 }}>
            <button type="button" {...quickProps(it.id)} onClick={() => onOpen?.(seedOf(it))} title={it.title} data-extras-poster={it.id}
              style={{ display: "block", width: "100%", aspectRatio: "2 / 3", padding: 0, cursor: "pointer", overflow: "hidden", borderRadius: 9,
                border: "1px solid rgba(var(--ac-8b5cf6),0.28)", background: "rgba(0,0,0,.3)", transition: "transform .15s, border-color .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(var(--ac-8b5cf6),0.6)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "rgba(var(--ac-8b5cf6),0.28)"; }}>
              {it.img && <img loading="lazy" decoding="async" src={it.img} alt={it.title} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />}
            </button>
            <div style={{ marginTop: 4, textAlign: "center", fontSize: 9.5, fontWeight: 800, lineHeight: 1.2, color: MUTED }}>{caption(it)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 1. Obscurité du goût ────────────────────────────────────────────────────────────────────────────────────────────────────
function SpectrumBar({ score, ends }) {
  return (
    <div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "linear-gradient(90deg,#22d3ee,rgb(var(--ac-8b5cf6)),#ec4899)", boxShadow: "0 0 14px rgba(var(--ac-8b5cf6),0.35)" }}>
        <span data-obscurity-marker={score} style={{ position: "absolute", top: "50%", left: `${score}%`, width: 20, height: 20, marginLeft: -10, marginTop: -10, borderRadius: "50%", background: "#fff", border: "3px solid rgb(var(--ac-6d28d9))", boxShadow: "0 0 12px rgba(255,255,255,.65)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: SOFT }}><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

export function ObscurityCard({ rows, onOpenDetail }) {
  const { t } = useT();
  const o = useMemo(() => obscurityOf(rows), [rows]);
  const maxBand = Math.max(...o.bands, 1);
  return (
    <HudCard corners={["tl", "br"]}>
      <div data-extras="obscurity" data-obscurity-score={o.score ?? ""} data-obscurity-level={o.level ?? ""}>
        <HudTitle right={o.n ? t.obscCount(o.n) : null}>🧭 {t.obscTitle}</HudTitle>
        {o.score == null ? <Empty data-extras-empty="">{t.obscEmpty}</Empty> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="grid items-start gap-6 min-[760px]:grid-cols-2">
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
                  <span data-obscurity-label="" style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: -0.5, textShadow: "0 0 14px rgba(var(--ac-a855f7),0.5)" }}>{t.obscLevels[o.level]}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: GOLD }}>{t.obscScore(o.score)}</span>
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>{t.obscSentences[o.level]}</div>
                <SpectrumBar score={o.score} ends={t.obscEnds} />
                <div style={{ marginTop: 9, fontSize: 10, color: SOFT }}>{t.obscMedian(o.median)} · {t.obscHint}</div>
                {!o.reliable && <div data-obscurity-indicative="" style={{ marginTop: 4, fontSize: 10, fontStyle: "italic", color: SOFT }}>{t.obscIndicative}</div>}
              </div>

              <div>
                <SubTitle>{t.obscBandsTitle}</SubTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {o.bands.map((count, i) => (
                    <div key={i} data-obscurity-band={i} data-count={count} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5 }}>
                      <span style={{ width: 98, flexShrink: 0, color: MUTED, fontWeight: 600 }}>{t.obscBands[i]}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(var(--ac-8b5cf6),0.1)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / maxBand) * 100}%`, borderRadius: 999, background: "linear-gradient(90deg,rgb(var(--ac-7c3aed)),rgb(var(--ac-c084fc)))", transition: "width .4s ease" }} />
                      </div>
                      <span style={{ width: 70, flexShrink: 0, textAlign: "right", fontWeight: 800, color: "var(--text-2)" }}>{count} <span style={{ color: SOFT, fontWeight: 600 }}>· {Math.round((count / o.n) * 100)}%</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(o.mostPopular.length > 0 || o.mostObscure.length > 0) && (
              <div className="grid gap-6 min-[760px]:grid-cols-2">
                <Shelf shelf="popular" title={t.obscMostPopular} items={o.mostPopular} columns={3} caption={(it) => t.obscRank(it.pop)} onOpen={onOpenDetail} />
                <Shelf shelf="obscure" title={t.obscMostObscure} items={o.mostObscure} columns={3} caption={(it) => t.obscRank(it.pop)} onOpen={onOpenDetail} />
              </div>
            )}
          </div>
        )}
      </div>
    </HudCard>
  );
}

// ── 2. Santé de la watchlist ────────────────────────────────────────────────────────────────────────────────────────────────
const idsOfKey = (key) => (key ? key.split(",").map(Number) : []);

export function WatchlistCard({ statuses, onOpenDetail }) {
  const { lang, t } = useT();
  // identifiants des animés « à voir », en une chaîne : ne change que si la watchlist change (pas à chaque note ou statut d'un autre animé)
  const key = useMemo(() => Object.entries(statuses || {}).filter(([, s]) => s === "watchlist").map(([id]) => Number(id)).filter((n) => n > 0).sort((a, b) => a - b).join(","), [statuses]);
  const [loaded, setLoaded] = useState(null);                       // { key, rows, failed } — null tant que rien n'est lu
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    loadAnimeMeta(idsOfKey(key)).then(({ rows, failed }) => { if (!cancelled) setLoaded({ key, rows, failed }); });
    return () => { cancelled = true; };
  }, [key]);
  const count = idsOfKey(key).length;
  const ready = !key || loaded?.key === key;
  const h = useMemo(() => (key && ready ? watchlistHealth(idsOfKey(key).map((id) => loaded.rows[id]).filter(Boolean)) : null), [key, ready, loaded]);
  const notCounted = h ? count - h.knownCount : 0;
  const duration = (min) => formatRuntime(min, lang) || "—";

  return (
    <HudCard corners={["tl", "br"]}>
      <div data-extras="watchlist" data-watchlist-count={count} data-watchlist-minutes={h ? h.minutes : ""}>
        <HudTitle right={t.wlHint}>⏳ {t.wlTitle}</HudTitle>
        {!key ? <Empty data-extras-empty="">{t.wlEmpty}</Empty>
          : !ready ? <Empty>{t.loading}</Empty>
          : loaded.failed && !h.knownCount ? <Empty data-extras-failed="">{t.wlFailed}</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="grid grid-cols-2 gap-2.5 min-[700px]:grid-cols-4">
                <Tile data-extras-tile="count" icon="🔖" label={t.wlCount} value={count.toLocaleString()} color="rgb(var(--ac-a855f7))" />
                <Tile data-extras-tile="hours" icon="⏱" label={t.wlHours} value={formatHours(h.minutes, lang)} color="#22d3ee" />
                <Tile data-extras-tile="quick" icon="⚡" label={t.wlQuickShort} value={h.quickCount} color={GOLD} />
                <Tile data-extras-tile="marathon" icon="🏔" label={t.wlMarathonShort} value={h.marathonCount} color="#fb7185" />
              </div>

              {h.minutes > 0 && (
                <div data-extras-clear="">
                  <SubTitle>{t.wlClear}</SubTitle>
                  <div className="grid grid-cols-3 gap-2.5">
                    {h.clear.map((c) => (
                      <div key={c.perDay} data-extras-pace={c.perDay} data-days={c.days} style={{ padding: "9px 6px", textAlign: "center", borderRadius: 12, border: "1px solid rgba(var(--ac-8b5cf6),0.18)", background: "rgba(var(--ac-8b5cf6),0.06)" }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", textShadow: "0 0 10px rgba(var(--ac-a855f7),0.45)" }}>{formatSpan(c.days, lang)}</div>
                        <div style={{ marginTop: 2, fontSize: 9.5, color: MUTED }}>{t.wlPace(c.perDay)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {h.quick.length > 0
                ? <Shelf shelf="quick" title={t.wlQuick} hint={t.wlQuickHint} items={h.quick} columns={6} caption={(it) => duration(it.minutes)} onOpen={onOpenDetail} />
                : <Note>{t.wlNoQuick}</Note>}
              <Shelf shelf="marathons" title={t.wlMarathons} hint={t.wlMarathonsHint} items={h.marathons} columns={6} caption={(it) => formatHours(it.minutes, lang)} onOpen={onOpenDetail} />
              {notCounted > 0 && <Note data-extras-uncounted={notCounted}>{t.wlUnknown(notCounted)}</Note>}
              {loaded.failed && <Note data-extras-partial="">{t.wlPartial}</Note>}
            </div>
          )}
      </div>
    </HudCard>
  );
}

// ── 3. Calendrier d'activité ────────────────────────────────────────────────────────────────────────────────────────────────
const CELL = 12, PITCH = 15, LEFT = 28, TOP = 16;
const LEVEL_FILL = ["rgba(var(--ac-8b5cf6),0.09)", "rgba(var(--ac-8b5cf6),0.34)", "rgba(var(--ac-a855f7),0.58)", "rgba(var(--ac-c084fc),0.82)", "rgb(var(--ac-f0abfc))"];

function Heatmap({ a, t, lang }) {
  const W = LEFT + a.cols.length * PITCH, H = TOP + 7 * PITCH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.actTitle} data-activity-grid="" style={{ display: "block", width: "100%", height: "auto" }}>
      {a.months.map((m) => <text key={m.col} x={LEFT + m.col * PITCH} y={10} fontSize="9" fontWeight="700" fill="rgba(148,163,184,0.75)">{t.actMonths[m.month]}</text>)}
      {[0, 2, 4].map((row) => <text key={row} x={0} y={TOP + row * PITCH + 10} fontSize="8.5" fontWeight="700" fill="rgba(148,163,184,0.65)">{t.actWeekdays[row]}</text>)}
      {a.cols.map((col, w) => col.map((cell, i) => cell.future ? null : (
        <rect key={cell.day} x={LEFT + w * PITCH} y={TOP + i * PITCH} width={CELL} height={CELL} rx="3" data-activity-cell={cell.day} data-count={cell.count} data-level={cell.level}
          style={{ fill: LEVEL_FILL[cell.level], stroke: cell.day === a.today ? "rgba(255,255,255,0.85)" : "none", strokeWidth: 1.2 }}>
          <title>{t.actCell(dayLabel(cell.day, lang), cell.count)}</title>
        </rect>
      )))}
    </svg>
  );
}

function WeekdayBars({ a, t }) {
  const max = Math.max(...a.weekdays, 1), top = a.weekdays.indexOf(Math.max(...a.weekdays));
  return (
    <div data-activity-weekdays="">
      <SubTitle>{t.actWeekdaysTitle}</SubTitle>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 78 }}>
        {a.weekdays.map((c, i) => (
          <div key={i} title={`${t.actWeekdaysFull[i]} · ${c}`} data-weekday={i} data-count={c} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: i === top ? GOLD : SOFT, marginBottom: 3 }}>{c}</div>
            <div style={{ width: "100%", maxWidth: 30, height: `${Math.max(4, (c / max) * 52)}px`, borderRadius: 6, background: i === top ? "linear-gradient(180deg,#fde68a,#f59e0b)" : "linear-gradient(180deg,rgb(var(--ac-c084fc)),rgb(var(--ac-6d28d9)))", opacity: c ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 5 }}>{t.actWeekdays.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, fontWeight: 700, color: i === top ? GOLD : SOFT }}>{d}</div>)}</div>
    </div>
  );
}

export function ActivityCard({ username }) {
  const { lang, t } = useT();
  const [today] = useState(() => new Date());
  const [state, setState] = useState(null);                         // { username, times, failed, truncated } — null tant que rien n'est lu
  useEffect(() => {
    let cancelled = false;
    loadVoteTimes(username).then((r) => { if (!cancelled) setState({ username, ...r }); });
    return () => { cancelled = true; };
  }, [username]);
  const ready = state?.username === username;
  const a = useMemo(() => (ready ? activityStats(state.times, { today }) : null), [ready, state, today]);
  const favorite = a && a.total >= 10 ? a.weekdays.indexOf(Math.max(...a.weekdays)) : -1;

  return (
    <HudCard corners={["tl", "tr", "bl", "br"]}>
      <div data-extras="activity" data-activity-total={a ? a.total : ""} data-activity-current={a ? a.current : ""} data-activity-longest={a ? a.longest : ""}>
        <HudTitle right={t.actHint}>🔥 {t.actTitle}</HudTitle>
        {!ready ? <Empty>{t.loading}</Empty>
          : state.failed && !a.total ? <Empty data-extras-failed="">{t.actFailed}</Empty>
          : a.total === 0 ? <Empty data-extras-empty="">{t.actEmpty}</Empty> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="grid grid-cols-2 gap-2.5 min-[700px]:grid-cols-4">
                <Tile data-extras-tile="current" icon="🔥" label={t.actCurrent} value={t.actDays(a.current)} color="#fb923c" />
                <Tile data-extras-tile="longest" icon="🏆" label={t.actLongest} value={t.actDays(a.longest)} color={GOLD} />
                <Tile data-extras-tile="active" icon="📆" label={t.actActive} value={a.activeDays.toLocaleString()} color="rgb(var(--ac-a855f7))" />
                <Tile data-extras-tile="best" icon="⭐" label={t.actBest} value={a.best.count.toLocaleString()} sub={dayLabel(a.best.day, lang)} color="#22d3ee" />
              </div>
              <div>
                <Heatmap a={a} t={t} lang={lang} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6, fontSize: 9.5, color: SOFT }}>
                  <span data-activity-year={a.inGrid}>{t.actYear(a.inGrid)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {t.actLess}{LEVEL_FILL.map((fill, i) => <i key={i} style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: fill }} />)}{t.actMore}
                  </span>
                </div>
              </div>
              <div className="grid items-end gap-6 min-[700px]:grid-cols-2">
                <WeekdayBars a={a} t={t} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                  {favorite >= 0 && <div data-activity-favorite={favorite} style={{ fontWeight: 800, color: "var(--text-1)" }}>{t.actFavoriteDay(t.actWeekdaysFull[favorite])}</div>}
                  <div style={{ fontSize: 10, color: SOFT }}>{t.actStreakHint}</div>
                  {state.truncated && <Note data-activity-truncated="">{t.actTruncated(MAX_PAGES * PAGE_SIZE)}</Note>}
                  {state.failed && <Note data-activity-partial="">{t.actFailed}</Note>}
                </div>
              </div>
            </div>
          )}
      </div>
    </HudCard>
  );
}
