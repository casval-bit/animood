// ─── FORUM — EXPLORATEUR DE DISCUSSIONS (appli de bureau uniquement) ──────────
// Recherche par mots-clés (titre, contenu, auteur, animé), filtres (tags, période, tri,
// sans réponse, mes sujets, auteur) et une frise « Archives » par mois : pour retrouver
// une discussion vieille de dix ans, on clique le mois au lieu de faire défiler.
// Les résultats sont groupés par période (Aujourd'hui / Cette semaine / mois / année).
import { useState, useEffect, useRef, useMemo } from "react";
import { sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { Avatar } from "./Avatar.jsx";
import { TagPill, timeAgo } from "./ForumThreadModal.jsx";
import { Spinner } from "./Spinner.jsx";
import { getForumTags } from "../constants/forumTags.js";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY } from "../constants/theme.js";

const PAGE = 15;
const HIST_LIMIT = 5000;

const TX = {
  fr: {
    title: "Discussions", search: "Rechercher un sujet, un mot-clé, un auteur, un animé…", newTopic: "➕ Nouveau sujet",
    tags: "Tags", period: "Période", sort: "Trier par", quick: "Filtres rapides", author: "Auteur", authorPh: "pseudo…",
    all: "Tout", d1: "24 h", d7: "7 jours", d30: "30 jours", y1: "1 an",
    sRecent: "Plus récents", sActivity: "Dernière activité", sReplies: "Plus de réponses", sOldest: "Plus anciens",
    unanswered: "Sans réponse", mine: "Mes sujets", withAnime: "Inclure les discussions d'animés",
    reset: "Tout effacer", results: (n, cap) => `${n}${cap ? "+" : ""} sujet${n !== 1 ? "s" : ""}`,
    archives: "Archives", archivesHint: "Clique un mois pour t'y rendre",
    more: "Charger la suite", none: "Aucun sujet ne correspond", noneSub: "Essaie d'autres mots-clés ou retire un filtre.",
    today: "Aujourd'hui", week: "Cette semaine", month: "Ce mois-ci", topicsIn: (n) => `${n} sujet${n !== 1 ? "s" : ""}`,
    loading: "Chargement…", replies: (n) => `${n} réponse${n !== 1 ? "s" : ""}`, focus: "Appuie sur / pour chercher",
  },
  en: {
    title: "Discussions", search: "Search a topic, keyword, author, anime…", newTopic: "➕ New topic",
    tags: "Tags", period: "Period", sort: "Sort by", quick: "Quick filters", author: "Author", authorPh: "username…",
    all: "All time", d1: "24 h", d7: "7 days", d30: "30 days", y1: "1 year",
    sRecent: "Newest", sActivity: "Latest activity", sReplies: "Most replies", sOldest: "Oldest",
    unanswered: "No replies yet", mine: "My topics", withAnime: "Include anime discussions",
    reset: "Clear all", results: (n, cap) => `${n}${cap ? "+" : ""} topic${n !== 1 ? "s" : ""}`,
    archives: "Archives", archivesHint: "Click a month to jump there",
    more: "Load more", none: "No topic matches", noneSub: "Try other keywords or remove a filter.",
    today: "Today", week: "This week", month: "This month", topicsIn: (n) => `${n} topic${n !== 1 ? "s" : ""}`,
    loading: "Loading…", replies: (n) => `${n} repl${n !== 1 ? "ies" : "y"}`, focus: "Press / to search",
  },
};

const clean = (s) => s.replace(/[,()*%\\"']/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function monthLabel(key, lang) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { month: "long", year: "numeric" });
}

function Highlight({ text, words }) {
  if(!words.length || !text) return <>{text}</>;
  const re = new RegExp(`(${words.map(esc).join("|")})`, "ig");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1
          ? <mark key={i} style={{ background: "rgba(139,92,246,.35)", color: "#f5f3ff", borderRadius: 3, padding: "0 2px" }}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function snippetOf(body, words) {
  const flat = (body || "").replace(/\s+/g, " ").trim();
  if(!flat) return "";
  if(words.length) {
    const m = flat.search(new RegExp(words.map(esc).join("|"), "i"));
    if(m > 60) return "… " + flat.slice(Math.max(0, m - 60), m + 110) + (flat.length > m + 110 ? " …" : "");
  }
  return flat.slice(0, 170) + (flat.length > 170 ? " …" : "");
}

function Chip({ active, onClick, children, color }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] font-bold transition"
      style={active
        ? { background: `${color || "#8B5CF6"}30`, color: color || "#c4b5fd", boxShadow: `inset 0 0 0 1px ${(color || "#8B5CF6")}80` }
        : { background: "rgba(255,255,255,.05)", color: "var(--text-2)" }}>
      {children}
    </button>
  );
}

function Block({ title, children }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function ResultRow({ th, words, profile, replyCount, unread, onOpen, lang, t }) {
  const snippet = snippetOf(th.body, words);
  return (
    <button type="button" onClick={() => onOpen(th)}
      className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3.5 border-b border-white/5 px-4 py-3 text-left transition last:border-b-0 hover:bg-white/5">
      {th.image_url
        ? <img loading="lazy" decoding="async" src={th.image_url} alt="" className="h-11 w-11 rounded-xl object-cover" onError={e => { e.target.style.display = "none"; }} />
        : th.anime_image
          ? <img loading="lazy" decoding="async" src={th.anime_image} alt="" className="h-11 w-11 rounded-xl object-cover" onError={e => { e.target.style.display = "none"; }} />
          : <Avatar profile={profile} size={40} fallback={th.username.slice(0, 2).toUpperCase()} className="text-[11px]" />}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13.5px] font-bold leading-tight text-slate-100"><Highlight text={th.title} words={words} /></span>
          {(th.tags || []).slice(0, 3).map(id => <TagPill key={id} id={id} />)}
          {th.anime_title && (
            <span className="max-w-[220px] truncate rounded-full bg-white/6 px-2 py-0.5 text-[9.5px] font-bold text-slate-400">🎬 <Highlight text={th.anime_title} words={words} /></span>
          )}
        </div>
        {snippet && <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500"><Highlight text={snippet} words={words} /></div>}
        <div className="mt-1 text-[10.5px] text-slate-500">
          <span className="font-semibold text-violet-300"><Highlight text={profile?.name || th.username} words={words} /></span>
          {" · "}{timeAgo(th.created_at, lang)}
          {th.last_reply_at && replyCount > 0 && <> {" · "}<span className="text-slate-600">↳ {timeAgo(th.last_reply_at, lang)}</span></>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-[11.5px] font-bold ${unread > 0 ? "text-slate-100" : "text-slate-500"}`} title={t.replies(replyCount)}>💬 {replyCount}</span>
        {unread > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </div>
    </button>
  );
}

// ─── Frise « Archives » — un bâton par mois, clic = filtrer sur ce mois ─────────
function ArchiveStrip({ dates, selected, onSelect, lang, t }) {
  const data = useMemo(() => {
    if(!dates.length) return [];
    const counts = {};
    let min = null;
    dates.forEach(iso => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      counts[key] = (counts[key] || 0) + 1;
      if(!min || d < min) min = d;
    });
    const now = new Date();
    const out = [];
    let y = min.getFullYear(), m = min.getMonth();
    while(y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      out.push({ key, n: counts[key] || 0, y, m });
      m++; if(m > 11) { m = 0; y++; }
    }
    return out;
  }, [dates]);

  if(data.length < 2) return null;
  const max = Math.max(...data.map(d => d.n), 1);
  return (
    <div className="mb-4 rounded-2xl border border-white/6 bg-white/3 px-4 pb-2.5 pt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">🗂 {t.archives}</div>
        <div className="text-[10px] text-slate-600">{t.archivesHint}</div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex h-14 items-end gap-[3px]" style={{ minWidth: Math.max(data.length * 11, 0) }}>
          {data.map(d => {
            const active = selected === d.key;
            return (
              <button key={d.key} type="button" disabled={!d.n}
                onClick={() => onSelect(active ? null : d.key)}
                title={`${monthLabel(d.key, lang)} · ${t.topicsIn(d.n)}`}
                className="group relative flex h-full w-2 shrink-0 items-end disabled:cursor-default">
                <span className="block w-full rounded-t-[3px] transition-all group-hover:brightness-125"
                  style={{
                    height: d.n ? `${Math.max(14, (d.n / max) * 100)}%` : "3px",
                    background: active ? GRADIENT_PRIMARY : d.n ? "rgba(139,92,246,.55)" : "rgba(255,255,255,.07)",
                    boxShadow: active ? "0 0 10px rgba(139,92,246,.7)" : "none",
                  }} />
              </button>
            );
          })}
        </div>
        <div className="relative mt-1 flex gap-[3px]" style={{ minWidth: Math.max(data.length * 11, 0) }}>
          {data.map(d => (
            <div key={d.key} className="w-2 shrink-0 overflow-visible whitespace-nowrap text-[9px] font-bold text-slate-600">{d.m === 0 ? d.y : ""}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ForumExplorer({ lang = "fr", unreadCounts = {}, blockedUsers, onOpenThread, onNewThread, refreshKey = 0 }) {
  const t = TX[lang] || TX.fr;
  const { myUsername } = useApp();
  const tagList = getForumTags(lang);

  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [tags, setTags] = useState([]);
  const [period, setPeriod] = useState("all"); // all | 24h | 7d | 30d | 1y
  const [month, setMonth] = useState(null);    // "YYYY-MM"
  const [sort, setSort] = useState("recent");
  const [unanswered, setUnanswered] = useState(false);
  const [mine, setMine] = useState(false);
  const [withAnime, setWithAnime] = useState(false);
  const [author, setAuthor] = useState("");
  const [authorD, setAuthorD] = useState("");

  const [rows, setRows] = useState([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState([]);
  const [replyCounts, setReplyCounts] = useState({});
  const [profiles, setProfiles] = useState({});
  const reqRef = useRef(0);
  const rawRef = useRef(0); // nombre de lignes brutes déjà chargées (avant retrait des utilisateurs bloqués)
  const inputRef = useRef(null);

  useEffect(() => { const h = setTimeout(() => setQd(q), 320); return () => clearTimeout(h); }, [q]);
  useEffect(() => { const h = setTimeout(() => setAuthorD(author), 320); return () => clearTimeout(h); }, [author]);

  // « / » pour aller dans la recherche
  useEffect(() => {
    const onKey = (e) => {
      if(e.key !== "/" || e.ctrlKey || e.metaKey) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if(tag === "input" || tag === "textarea") return;
      e.preventDefault(); inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const words = useMemo(() => clean(qd).split(/\s+/).filter(w => w.length > 0).slice(0, 6), [qd]);

  // Construit la requête PostgREST (sans le filtre de période, pour la frise)
  const baseFilters = useMemo(() => {
    const and = [];
    words.forEach(w => and.push(`or(title.ilike.*${w}*,body.ilike.*${w}*,username.ilike.*${w}*,anime_title.ilike.*${w}*)`));
    const a = clean(authorD);
    if(a) and.push(`username.ilike.*${a}*`);
    if(unanswered) and.push("or(reply_count.eq.0,reply_count.is.null)");
    const parts = [];
    if(and.length) parts.push(`and=${encodeURIComponent(`(${and.join(",")})`)}`);
    if(tags.length) parts.push(`tags=${encodeURIComponent(`ov.{${tags.join(",")}}`)}`);
    if(mine && myUsername) parts.push(`username=eq.${encodeURIComponent(myUsername)}`);
    if(!withAnime) parts.push("anime_id=is.null");
    return parts.join("&");
  }, [words, authorD, unanswered, tags, mine, myUsername, withAnime]);

  const periodFilter = useMemo(() => {
    if(month) {
      const [y, m] = month.split("-").map(Number);
      return `created_at=gte.${encodeURIComponent(new Date(y, m - 1, 1).toISOString())}&created_at=lt.${encodeURIComponent(new Date(y, m, 1).toISOString())}`;
    }
    const ms = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5, "1y": 365 * 864e5 }[period];
    return ms ? `created_at=gte.${encodeURIComponent(new Date(Date.now() - ms).toISOString())}` : "";
  }, [period, month]);

  const order = { recent: "created_at.desc", activity: "last_reply_at.desc.nullslast,created_at.desc", replies: "reply_count.desc.nullslast,created_at.desc", oldest: "created_at.asc" }[sort];

  const fetchPage = async (offset, my) => {
    const url = `forum_threads?select=*&${[baseFilters, periodFilter].filter(Boolean).join("&")}&order=${order}&limit=${PAGE}&offset=${offset}`;
    const got = (await sb.query(url).catch(() => [])) || [];
    if(my !== reqRef.current) return null;
    const visible = blockedUsers?.size ? got.filter(r => !blockedUsers.has(r.username)) : got;
    // compteurs de réponses + profils des nouveaux auteurs
    const ids = visible.map(r => r.id);
    const [counts, profs] = await Promise.all([
      ids.length ? sb.getReplyCounts(ids, [...(blockedUsers || [])]) : {},
      (async () => {
        const names = [...new Set(visible.map(r => r.username))];
        if(!names.length) return [];
        return sb.query(`profiles?username=in.(${names.map(encodeURIComponent).join(",")})&select=username,name,avatar,avatar_base64`).catch(() => []);
      })(),
    ]);
    if(my !== reqRef.current) return null;
    setReplyCounts(prev => ({ ...prev, ...counts }));
    setProfiles(prev => { const n = { ...prev }; (profs || []).forEach(p => { n[p.username] = p; }); return n; });
    return { visible, full: got.length === PAGE, raw: got.length };
  };

  // Nouvelle recherche / nouveau filtre → on repart de zéro
  useEffect(() => {
    const my = ++reqRef.current;
    setLoading(true);
    fetchPage(0, my).then(res => {
      if(!res) return;
      rawRef.current = res.raw; setRows(res.visible); setDone(!res.full); setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilters, periodFilter, order, refreshKey]);

  // Frise : toutes les dates correspondant aux filtres (hors période)
  useEffect(() => {
    let cancelled = false;
    sb.query(`forum_threads?select=created_at${baseFilters ? "&" + baseFilters : ""}&order=created_at.desc&limit=${HIST_LIMIT}`)
      .then(r => { if(!cancelled) setDates((r || []).map(x => x.created_at)); })
      .catch(() => { if(!cancelled) setDates([]); });
    return () => { cancelled = true; };
  }, [baseFilters, refreshKey]);

  const loadMore = async () => {
    const my = reqRef.current;
    const res = await fetchPage(rawRef.current, my);
    if(!res) return;
    rawRef.current += res.raw;
    setRows(prev => [...prev, ...res.visible]); setDone(!res.full);
  };

  const activeCount = (words.length ? 1 : 0) + tags.length + (period !== "all" ? 1 : 0) + (month ? 1 : 0) + (unanswered ? 1 : 0) + (mine ? 1 : 0) + (withAnime ? 1 : 0) + (clean(authorD) ? 1 : 0);
  const reset = () => { setQ(""); setQd(""); setTags([]); setPeriod("all"); setMonth(null); setUnanswered(false); setMine(false); setWithAnime(false); setAuthor(""); setAuthorD(""); setSort("recent"); };
  const toggleTag = (id) => setTags(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  // Groupes par période (quand le tri est chronologique)
  const groups = useMemo(() => {
    if(sort === "replies") return [{ key: "all", label: null, items: rows }];
    const now = new Date();
    const out = [];
    const find = (key, label) => { let g = out.find(x => x.key === key); if(!g) { g = { key, label, items: [] }; out.push(g); } return g; };
    rows.forEach(r => {
      const d = new Date(sort === "activity" && r.last_reply_at ? r.last_reply_at : r.created_at);
      const days = (now - d) / 864e5;
      if(days < 1 && d.getDate() === now.getDate()) find("today", t.today).items.push(r);
      else if(days < 7) find("week", t.week).items.push(r);
      else if(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) find("month", t.month).items.push(r);
      else {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = days < 365 ? monthLabel(key, lang) : String(d.getFullYear());
        find(days < 365 ? key : String(d.getFullYear()), label).items.push(r);
      }
    });
    return out;
  }, [rows, sort, lang, t]);

  const SORTS = [["recent", t.sRecent], ["activity", t.sActivity], ["replies", t.sReplies], ["oldest", t.sOldest]];
  const PERIODS = [["all", t.all], ["24h", t.d1], ["7d", t.d7], ["30d", t.d30], ["1y", t.y1]];
  const capped = dates.length >= HIST_LIMIT;

  return (
    <section className="mb-10">
      {/* Barre de recherche */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t.search}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-24 text-[14px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/60 focus:bg-white/7" />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:bg-white/15">✕</button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-600" title={t.focus}>/</span>
          )}
        </div>
        <button type="button" onClick={onNewThread}
          className="shrink-0 rounded-2xl px-5 py-3 text-[13px] font-black text-white shadow-lg transition hover:scale-[1.03]" style={{ background: GRADIENT_PRIMARY }}>
          {t.newTopic}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* ── Filtres ── */}
        <aside className={`self-start p-4 lg:sticky lg:top-24 ${GLASS}`} style={GLASS_STYLE}>
          <Block title={t.tags}>
            <div className="flex flex-wrap gap-1.5">
              {tagList.map(tag => <Chip key={tag.id} active={tags.includes(tag.id)} color={tag.color} onClick={() => toggleTag(tag.id)}>{tag.emoji} {tag.label}</Chip>)}
            </div>
          </Block>
          <Block title={t.period}>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map(([id, label]) => <Chip key={id} active={!month && period === id} onClick={() => { setMonth(null); setPeriod(id); }}>{label}</Chip>)}
            </div>
            {month && (
              <button type="button" onClick={() => setMonth(null)} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-bold capitalize text-violet-200">
                📅 {monthLabel(month, lang)} ✕
              </button>
            )}
          </Block>
          <Block title={t.sort}>
            <div className="flex flex-col gap-1">
              {SORTS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setSort(id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold transition ${sort === id ? "bg-violet-500/15 text-violet-200" : "text-slate-400 hover:bg-white/5"}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: sort === id ? "#a78bfa" : "rgba(255,255,255,.18)" }} />{label}
                </button>
              ))}
            </div>
          </Block>
          <Block title={t.quick}>
            {[[unanswered, setUnanswered, t.unanswered], [mine, setMine, t.mine], [withAnime, setWithAnime, t.withAnime]].map(([v, set, label]) => (
              <label key={label} className="flex cursor-pointer items-center gap-2 py-1 text-[12px] font-semibold text-slate-300">
                <input type="checkbox" checked={v} onChange={e => set(e.target.checked)} className="h-3.5 w-3.5 accent-violet-500" />{label}
              </label>
            ))}
          </Block>
          <Block title={t.author}>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder={t.authorPh}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/50" />
          </Block>
          {activeCount > 0 && (
            <button type="button" onClick={reset} className="mt-1 w-full rounded-lg border border-white/10 py-1.5 text-[11px] font-bold text-slate-400 transition hover:bg-white/5">{t.reset} ({activeCount})</button>
          )}
        </aside>

        {/* ── Résultats ── */}
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-[15px] font-black tracking-wide text-slate-100">🔥 {t.title}</h2>
            <div className="text-[11.5px] font-semibold text-slate-500">{t.results(month ? rows.length : dates.length, capped && !month)}</div>
          </div>

          <ArchiveStrip dates={dates} selected={month} onSelect={(k) => { setMonth(k); if(k) setPeriod("all"); }} lang={lang} t={t} />

          <div className={`overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
            {loading ? (
              <div className="p-6"><Spinner small label={t.loading} /></div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mb-1 text-sm font-bold text-slate-300">{t.none}</div>
                <div className="text-[11.5px] text-slate-500">{t.noneSub}</div>
              </div>
            ) : (
              groups.map(gr => (
                <div key={gr.key}>
                  {gr.label && (
                    <div className="flex items-center justify-between border-b border-white/6 bg-white/3 px-4 py-1.5 text-[10.5px] font-black uppercase capitalize tracking-[0.14em] text-slate-500">
                      <span style={{ textTransform: "capitalize" }}>{gr.label}</span><span className="text-slate-600">{gr.items.length}</span>
                    </div>
                  )}
                  {gr.items.map(th => (
                    <ResultRow key={th.id} th={th} words={words} profile={profiles[th.username]}
                      replyCount={replyCounts[th.id] ?? th.reply_count ?? 0} unread={unreadCounts[th.id] || 0}
                      onOpen={onOpenThread} lang={lang} t={t} />
                  ))}
                </div>
              ))
            )}
            {!loading && rows.length > 0 && !done && (
              <button type="button" onClick={loadMore} className="w-full border-t border-white/6 px-4 py-3 text-center text-[12px] font-bold text-violet-300 transition hover:bg-white/5">↓ {t.more}</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
