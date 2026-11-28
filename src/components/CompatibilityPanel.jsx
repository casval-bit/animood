// ─── Compatibilité avec un membre (panneau du profil d'un membre, appli de bureau) ───────────────────────────────────────────────────────────────
// Les profils sont déjà en mémoire (le mien : useApp().me, le sien : chargé par UserProfileModal) ; il ne manque que les fiches des animés
// (genres, studios, affiches), lues par lots dans anime_cache (api/animeMeta.js). Le calcul est dans utils/compatibility.js (pur, testé) :
// il est refait à chaque changement de mes notes (carte de survol, fiche animé…), sans nouvelle requête pour les animés déjà connus.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { AnimePoster } from "./AnimeCard.jsx";
import { Spinner } from "./Spinner.jsx";
import { supabaseRowToAnime } from "../api/jikan.js";
import { loadAnimeMeta } from "../api/animeMeta.js";
import { memberData, idsToLoad, computeCompatibility } from "../utils/compatibility.js";
import { COMPAT_I18N } from "../constants/compatI18n.js";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";

const GAUGE = 124, RADIUS = 50, CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Gauge({ score }) {
  return (
    <div className="relative shrink-0" style={{ width: GAUGE, height: GAUGE }}>
      <svg viewBox={`0 0 ${GAUGE} ${GAUGE}`} width={GAUGE} height={GAUGE} aria-hidden="true">
        <defs>
          <linearGradient id="compat-gauge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "rgb(var(--ac-6d5bff))" }} />
            <stop offset="0.55" style={{ stopColor: "rgb(var(--ac-8b5cf6))" }} />
            <stop offset="1" style={{ stopColor: "rgb(var(--ac-ec4899))" }} />
          </linearGradient>
        </defs>
        <circle cx={GAUGE / 2} cy={GAUGE / 2} r={RADIUS} fill="none" strokeWidth="10" style={{ stroke: "rgba(var(--fg-rgb),0.1)" }} />
        <circle cx={GAUGE / 2} cy={GAUGE / 2} r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round" stroke="url(#compat-gauge)"
          className="compat-gauge-arc" strokeDasharray={`${(CIRCUMFERENCE * score) / 100} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${GAUGE / 2} ${GAUGE / 2})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span data-compat-score={score} className="text-[32px] font-black leading-none text-slate-100">{score}<span className="text-base font-bold text-slate-400">%</span></span>
      </div>
    </div>
  );
}

function PartBar({ label, tip, value, part }) {
  const pct = value == null ? null : Math.round(value * 100);
  return (
    <div title={tip} data-compat-part={part}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10.5px]">
        <span className="font-semibold text-slate-400">{label}</span>
        <span className="font-black text-slate-300">{pct == null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(var(--fg-rgb),0.1)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: GRADIENT_PRIMARY }} />
      </div>
    </div>
  );
}

function Chips({ label, items, kind }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-compat-chips={kind}>
      <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {items.map((x) => (
        <span key={x} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">{x}</span>
      ))}
    </div>
  );
}

/** Une étagère d'affiches avec, sous chacune, une petite légende (notes, « dans sa watchlist »…). */
function Shelf({ id, title, hint, items, animeOf, note, onOpenDetail }) {
  if (!items.length) return null;
  return (
    <section className="mt-4" data-compat-shelf={id}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h4>
        {hint && <span className="shrink-0 text-[10px] text-slate-500">{hint}</span>}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
        {items.map((it) => (
          <div key={it.id} className="flex min-w-0 flex-col">
            <AnimePoster anime={animeOf(it.id)} onClick={onOpenDetail} />
            <div className="mt-1 text-center text-[10px] font-bold leading-tight text-slate-400">{note?.(it)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CompatibilityPanel({ profile, username, onOpenDetail, onClose }) {
  const { me } = useApp();
  const { lang } = useLang();
  const t = COMPAT_I18N[lang] || COMPAT_I18N.fr;

  const mine = useMemo(() => memberData(me), [me]);
  const theirs = useMemo(() => memberData(profile), [profile]);
  const ids = useMemo(() => idsToLoad(mine, theirs), [mine, theirs]);

  const [loaded, setLoaded] = useState({ rows: {}, failed: false, done: false });
  useEffect(() => {
    let cancelled = false;
    loadAnimeMeta(ids).then(({ rows, failed }) => { if (!cancelled) setLoaded({ rows, failed, done: true }); });
    return () => { cancelled = true; };
  }, [ids]);

  const result = useMemo(() => computeCompatibility(mine, theirs, loaded.rows), [mine, theirs, loaded.rows]);
  const animes = useMemo(() => Object.fromEntries(Object.entries(loaded.rows).map(([id, row]) => [id, supabaseRowToAnime(row)])), [loaded.rows]);
  const animeOf = (id) => animes[id] || { mal_id: id, title: `#${id}`, images: { jpg: {} } };
  const { lists, basis } = result;
  const noteOf = (it) => (
    <span className="tabular-nums">
      <span style={{ color: "rgb(var(--ac-a78bfa))" }}>{it.mine}</span> · <span style={{ color: "rgb(var(--ac-f472b6))" }}>{it.theirs}</span>
    </span>
  );

  return (
    <section data-compat-panel="" aria-label={t.title(username)} className="mb-5 rounded-2xl border border-white/8 p-4" style={{ background: "var(--surface-1)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">🤝 {t.title(username)}</h3>
        <button type="button" onClick={onClose} aria-label={t.close} title={t.close}
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-white/8 hover:text-slate-300">✕</button>
      </div>

      {!loaded.done ? (
        <div className="flex justify-center py-6"><Spinner label={t.loading} /></div>
      ) : result.score == null ? (
        <div className="py-3 text-center" data-compat-empty="">
          <div className="text-sm font-bold text-slate-300">{t.noData}</div>
          <div className="mx-auto mt-1 max-w-md text-[11.5px] text-slate-500">{t.noDataHint}</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-5">
            <Gauge score={result.score} />
            <div className="min-w-0 flex-1">
              <div className={`text-lg font-black ${GRADIENT_TEXT}`} data-compat-level={result.level}>{t.levels[result.level]}</div>
              <div className="mt-0.5 text-[11.5px] text-slate-400">{t.basis(basis.commonRated, basis.commonSeen)}</div>
              {!basis.reliable && <div className="mt-0.5 text-[11px] italic text-slate-500" data-compat-indicative="">{t.indicative}</div>}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <PartBar part="ratings" label={t.partRatings} tip={t.tipRatings} value={result.parts.ratings} />
                <PartBar part="library" label={t.partLibrary} tip={t.tipLibrary} value={result.parts.library} />
                <PartBar part="genres" label={t.partGenres} tip={t.tipGenres} value={result.parts.genres} />
                <PartBar part="favorites" label={t.partFavorites} tip={t.tipFavorites} value={result.parts.favorites} />
              </div>
              {basis.avgGap != null && <div className="mt-2 text-[10.5px] text-slate-500">{t.closeNotes(basis.close, basis.avgGap, lang)}</div>}
            </div>
          </div>
          {loaded.failed && <div className="mt-2 text-[11px] italic text-slate-500" data-compat-partial="">{t.partial}</div>}

          {(result.genres.length > 0 || result.decades.length > 0 || result.studios.length > 0) && (
            <div className="mt-4 space-y-2">
              <Chips kind="genres" label={t.commonGenres} items={result.genres.map((g) => g.name)} />
              <Chips kind="decades" label={t.commonDecades} items={result.decades.map((d) => `${d.decade}s`)} />
              <Chips kind="studios" label={t.commonStudios} items={result.studios.map((s) => s.name)} />
            </div>
          )}

          {/* deux colonnes : les étagères de 3-4 affiches ne laissent pas la moitié de la fenêtre vide */}
          <div className="grid gap-x-6 md:grid-cols-2" data-compat-shelves="">
            <Shelf id="lovedTogether" title={t.lovedTogether} hint={t.pairHint(username)} items={lists.lovedTogether} animeOf={animeOf} note={noteOf} onOpenDetail={onOpenDetail} />
            <Shelf id="favorites" title={t.favorites} items={lists.favorites} animeOf={animeOf} onOpenDetail={onOpenDetail} />
            <Shelf id="gaps" title={t.gaps} hint={t.pairHint(username)} items={lists.gaps} animeOf={animeOf} note={noteOf} onOpenDetail={onOpenDetail} />
            <Shelf id="theyLoved" title={t.theyLoved(username)} items={lists.theyLoved} animeOf={animeOf} onOpenDetail={onOpenDetail}
              note={(it) => <>★ {it.theirs}{it.onMyWatchlist && <div className="font-semibold text-slate-500">{t.onYourWatchlist}</div>}</>} />
            <Shelf id="iLoved" title={t.iLoved(username)} items={lists.iLoved} animeOf={animeOf} onOpenDetail={onOpenDetail}
              note={(it) => <>★ {it.mine}{it.onTheirWatchlist && <div className="font-semibold text-slate-500">{t.onTheirWatchlist}</div>}</>} />
            <Shelf id="watchlist" title={t.watchlist} items={lists.watchlist} animeOf={animeOf} onOpenDetail={onOpenDetail} />
          </div>
        </>
      )}
    </section>
  );
}
