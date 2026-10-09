// ─── DESKTOP ONLY — recherche d'animé tolérante (En boucle, favoris) ──────────
// La recherche d'origine envoyait la phrase entière à une seule source : un mot de travers, un titre en
// romaji au lieu de l'anglais, ou une phrase partielle ne donnait rien. Ici :
//   • on découpe la saisie en mots (tous les mots doivent se retrouver, dans n'importe quel titre :
//     original, anglais, japonais) ;
//   • 4 sources interrogées EN PARALLÈLE et fusionnées au fil de l'eau : base AniMood (tous les mots),
//     base AniMood (au moins un mot), AniList (recherche floue + synonymes) et Jikan ;
//   • classement par pertinence (titre exact > début de titre > tous les mots > mots proches / fautes de frappe) ;
//   • filtre de type, navigation clavier (↑ ↓ Entrée), anti-rebond.
// Le site web continue d'utiliser FavoriteSearchModal d'origine.
import { useState, useEffect, useRef, useMemo } from "react";
import { useLang } from "../context/useLang.js";
import { sb } from "../api/supabase.js";
import { jikan, supabaseRowToAnime } from "../api/jikan.js";
import { Modal } from "./Modal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const FALLBACK = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";

const TXT = {
  fr: { heading: "Choisir un animé", ph: "Titre complet, quelques mots, romaji, anglais…", hint: "Pas besoin du titre exact : tape quelques mots, en romaji, en anglais ou en japonais.", none: "Aucun résultat", noneSub: "Essaie moins de mots, ou une autre orthographe.", all: "Tout", tv: "Séries", movie: "Films", ova: "OAV / Spéciaux", loading: "Recherche…", src: "résultats", src1: "résultat" },
  en: { heading: "Pick an anime", ph: "Full title, a few words, romaji, English…", hint: "No need for the exact title: type a few words, in romaji, English or Japanese.", none: "No results", noneSub: "Try fewer words or another spelling.", all: "All", tv: "Series", movie: "Movies", ova: "OVA / Specials", loading: "Searching…", src: "results", src1: "result" },
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9぀-ヿ一-鿿 ]+/g, " ").replace(/\s+/g, " ").trim();

function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

const typeGroup = (t) => (t === "TV" ? "tv" : t === "Movie" ? "movie" : t ? "ova" : "tv");

// ── AniList ──────────────────────────────────────────────────────────────────
const AL_QUERY = `query($s:String){Page(perPage:12){media(search:$s,type:ANIME,sort:SEARCH_MATCH){idMal title{romaji english native} synonyms format episodes seasonYear averageScore popularity coverImage{large extraLarge}}}}`;
const AL_FORMAT = { TV: "TV", TV_SHORT: "TV", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };
async function fetchAniList(q, signal) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: AL_QUERY, variables: { s: q } }),
  });
  const json = await res.json();
  return (json?.data?.Page?.media || []).filter((m) => m.idMal).map((m, i) => ({
    mal_id: m.idMal, title: m.title.romaji, title_english: m.title.english, title_japanese: m.title.native,
    synonyms: m.synonyms || [], type: AL_FORMAT[m.format] || m.format, episodes: m.episodes, year: m.seasonYear,
    score: m.averageScore ? Math.round(m.averageScore) / 10 : null, popularity: m.popularity,
    images: { jpg: { image_url: m.coverImage?.large, large_image_url: m.coverImage?.extraLarge || m.coverImage?.large } },
    genres: [], _alRank: i,
  }));
}

// ── Supabase (cache AniMood) ────────────────────────────────────────────────
const SEL = "mal_id,title,title_en,title_jp,image_url,large_image,score,year,type,episodes,genres,popularity";
async function fetchCache(tokens, mode) {
  const ors = tokens.map((t) => { const e = encodeURIComponent(t); return `or(title.ilike.*${e}*,title_en.ilike.*${e}*,title_jp.ilike.*${e}*)`; });
  const filter = mode === "all" ? `and=(${ors.join(",")})` : `or=(${tokens.filter((t) => t.length >= 3).map((t) => { const e = encodeURIComponent(t); return `title.ilike.*${e}*,title_en.ilike.*${e}*,title_jp.ilike.*${e}*`; }).join(",")})`;
  const rows = await sb.query(`anime_cache?${filter}&order=score.desc.nullslast&limit=24&select=${SEL}`);
  return (rows || []).map(supabaseRowToAnime);
}

// ── Classement ───────────────────────────────────────────────────────────────
function rank(a, qn, tokens) {
  const names = [a.title, a.title_english, a.title_japanese, ...(a.synonyms || [])].map(norm).filter(Boolean);
  if (!names.length) return -1;
  let best = 0;
  for (const n of names) {
    let s = 0;
    if (n === qn) s = 100;
    else if (n.startsWith(qn)) s = 84;
    else if (n.includes(qn)) s = 70;
    else {
      const words = n.split(" ");
      let hit = 0, fuzzy = 0;
      for (const t of tokens) {
        if (n.includes(t)) hit++;
        else if (t.length >= 4 && words.some((w) => lev(w, t) <= (t.length >= 7 ? 2 : 1))) fuzzy++;
      }
      const cover = (hit + fuzzy * 0.7) / tokens.length;
      s = cover * 60 + (hit === tokens.length ? 8 : 0);
    }
    best = Math.max(best, s);
  }
  return best;
}

function mergeAll(sources, q) {
  const qn = norm(q);
  const tokens = qn.split(" ").filter((t) => t.length >= 1);
  const map = new Map();
  Object.values(sources).flat().forEach((a) => {
    if (!a?.mal_id) return;
    const prev = map.get(a.mal_id);
    if (!prev) map.set(a.mal_id, { ...a });
    else map.set(a.mal_id, { ...prev, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))), synonyms: [...(prev.synonyms || []), ...(a.synonyms || [])] });
  });
  const out = [];
  for (const a of map.values()) {
    let r = rank(a, qn, tokens);
    if (a._alRank != null) r = Math.max(r, 30) + Math.max(0, 12 - a._alRank); // AniList = pertinence floue de confiance
    if (r < 18) continue;
    r += Math.min(6, (a.score || 0) / 2) + (a.popularity ? Math.max(0, 3 - Math.log10(a.popularity + 1)) : 0);
    out.push({ ...a, _r: r });
  }
  return out.sort((x, y) => y._r - x._r).slice(0, 30);
}

export function DesktopAnimeSearchModal({ onSelect, onClose, heading }) {
  const { lang } = useLang();
  const t = TXT[lang] || TXT.fr;
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [typeF, setTypeF] = useState("all");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const run = useRef(0);
  const timer = useRef(null);
  const ctrl = useRef(null);

  useEffect(() => { const id = setTimeout(() => inputRef.current?.focus(), 120); return () => clearTimeout(id); }, []);
  useEffect(() => () => { clearTimeout(timer.current); ctrl.current?.abort(); }, []);

  const search = (val) => {
    setQ(val); setCursor(0);
    clearTimeout(timer.current);
    ctrl.current?.abort();
    const qn = norm(val);
    if (qn.length < 2) { setItems([]); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const my = ++run.current;
      ctrl.current = new AbortController();
      const tokens = qn.split(" ").filter(Boolean).slice(0, 5);
      const sources = {};
      const push = (k) => (rows) => { if (my !== run.current) return; sources[k] = rows || []; setItems(mergeAll(sources, val)); };
      const jobs = [
        fetchCache(tokens, "all").then(push("cacheAll")),
        tokens.length > 1 ? fetchCache(tokens, "any").then(push("cacheAny")) : Promise.resolve(),
        fetchAniList(val.trim(), ctrl.current.signal).then(push("anilist")),
        jikan.searchAnime({ q: val.trim(), limit: 12, page: 1 }).then((d) => push("jikan")(d?.data || [])),
      ].map((p) => p.catch(() => {}));
      await Promise.all(jobs);
      if (my === run.current) setBusy(false);
    }, 280);
  };

  const shown = useMemo(() => items.filter((a) => typeF === "all" || typeGroup(a.type) === typeF), [items, typeF]);
  useEffect(() => { setCursor(0); }, [typeF]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(shown.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter" && shown[cursor]) { e.preventDefault(); onSelect(shown[cursor]); }
  };

  const chips = [["all", t.all], ["tv", t.tv], ["movie", t.movie], ["ova", t.ova]];
  const alt = (a) => {
    const main = a.title_english || a.title;
    const others = [a.title, a.title_japanese].filter((x) => x && x !== main);
    return { main, sub: others.join(" · ") };
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl">
      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded-full" style={{ background: GRADIENT_PRIMARY }} />
          <div className="text-sm font-extrabold text-slate-100">{heading || t.heading}</div>
          {busy && <span className="ml-auto text-[10px] font-semibold text-slate-500">{t.loading}</span>}
          {!busy && q.trim().length >= 2 && shown.length > 0 && <span className="ml-auto text-[10px] font-semibold text-slate-500">{shown.length} {shown.length > 1 ? t.src : t.src1}</span>}
        </div>
        <div className="relative mb-2.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔍</span>
          <input ref={inputRef} value={q} onChange={(e) => search(e.target.value)} onKeyDown={onKey} placeholder={t.ph}
            className="w-full rounded-xl border border-white/12 bg-white/7 py-3 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/50" />
          {busy && <span className="absolute bottom-0 left-3 right-3 h-0.5 overflow-hidden rounded-full"><span className="block h-full w-1/3 animate-pulse rounded-full" style={{ background: GRADIENT_PRIMARY }} /></span>}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map(([id, label]) => (
            <button key={id} onClick={() => setTypeF(id)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${typeF === id ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
              style={{ background: typeF === id ? GRADIENT_PRIMARY : "rgba(var(--fg-rgb),0.04)", border: typeF === id ? "1px solid transparent" : "1px solid rgba(var(--fg-rgb),0.08)" }}>{label}</button>
          ))}
        </div>

        {!q.trim() && <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs leading-relaxed text-slate-500">{t.hint}</div>}
        {q.trim().length >= 2 && !busy && shown.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
            <div className="text-sm font-bold text-slate-300">{t.none}</div>
            <div className="mt-1 text-xs text-slate-500">{t.noneSub}</div>
          </div>
        )}

        <div ref={listRef} className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {shown.map((a, i) => {
            const { main, sub } = alt(a);
            const on = i === cursor;
            return (
              <button key={a.mal_id} data-i={i} onClick={() => onSelect(a)} onMouseEnter={() => setCursor(i)}
                className="flex items-center gap-3 overflow-hidden rounded-xl text-left transition"
                style={{ background: on ? "rgba(139,92,246,.12)" : "rgba(var(--fg-rgb),0.035)", border: `1px solid ${on ? "rgba(139,92,246,.4)" : "rgba(var(--fg-rgb),0.07)"}` }}>
                <img src={a.images?.jpg?.image_url || FALLBACK} alt="" loading="lazy" onError={(e) => { e.target.src = FALLBACK; }} className="h-16 w-11 shrink-0 object-cover" />
                <div className="min-w-0 flex-1 py-1.5 pr-3">
                  <div className="truncate text-[13px] font-bold leading-tight text-slate-100">{main}</div>
                  {sub && <div className="truncate text-[10px] text-slate-500">{sub}</div>}
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    {[a.year, a.type, a.episodes ? `${a.episodes} ép.` : null].filter(Boolean).join(" · ")}{a.score ? <span className="ml-1.5 text-amber-400/90">★ {Number(a.score).toFixed(1)}</span> : null}
                  </div>
                </div>
                {on && <span className="pr-3 text-[10px] font-bold text-violet-300/80">↵</span>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
