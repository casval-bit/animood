import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { jikan, supabaseRowToAnime, fetchPopularAnime, fetchTitleSuggestions } from "../api/jikan.js";
import { fetchPopularStudios, getStudioCountries } from "../api/studios.js";
import { fetchPopularArtists } from "../api/animethemes.js";
import { searchAnime, searchStudios, searchArtists, searchMembers } from "../api/search.js";
import { sb, follows } from "../api/supabase.js";
import { ptsStore } from "../api/moods.js";
import { STATUS_COLORS } from "../constants/statuses.js";
import { AnimeCard } from "../components/AnimeCard.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { StudioModal } from "../components/StudioModal.jsx";
import { ArtistModal } from "../components/ArtistModal.jsx";
import { AiringCalendar } from "../components/search/AiringCalendar.jsx";
import { MemberCard, StudioCard, ArtistCard } from "../components/search/SearchCards.jsx";
import { GLASS, GLASS_STYLE } from "../constants/theme.js";
import { Chip, ChipGroup, SectionLabel } from "../components/ui.jsx";
import { SEARCH_I18N } from "../constants/searchI18n.js";

const FALLBACK = "https://placehold.co/64x92/1a1a2e/818cf8?text=?";

function getTabs(t) {
  return [
    { id:"anime",   label:t.tabAnime,   emoji:"📺" },
    { id:"season",  label:t.tabSeason,  emoji:"📅" },
    { id:"studio",  label:t.tabStudio,  emoji:"🎬" },
    { id:"artist",  label:t.tabArtist,  emoji:"🎤" },
    { id:"members", label:t.tabMembers, emoji:"👥" },
  ];
}
function getTypeFilters(t) {
  return [
    { id:"all",   label:t.filterAll,   emoji:"🔀" },
    { id:"TV",    label:t.filterAnime, emoji:"📺" },
    { id:"Movie", label:t.filterMovie, emoji:"🎬" },
    { id:"OVA",   label:t.filterOva,   emoji:"💿" },
  ];
}

// "Populaires" only makes sense for TV series — films & OAV are rarer, so we frame
// them as curated picks instead of implying a huge, ranked pool.
function getPopularLabels(t) {
  return {
    all:   t.popularNow,
    TV:    t.popularNow,
    Movie: t.popularMovies,
    OVA:   t.popularOva,
  };
}

// The Saison tab has no search of its own — typing there searches anime.
const searchTabFor = (tab) => tab === "season" ? "anime" : tab;

export function SearchView({ onOpenDetail, onOpenUser }) {
  const { me, myUsername, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = SEARCH_I18N[lang] || SEARCH_I18N.fr;
  const TABS = getTabs(t);
  const TYPE_FILTERS = getTypeFilters(t);
  const POPULAR_LABELS = getPopularLabels(t);
  const [tab, setTab]           = useState("anime");
  const [query, setQuery]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [studioModal, setStudioModal] = useState(null);
  const [artistModal, setArtistModal] = useState(null);

  const [popularAnime, setPopularAnime]     = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [popularStudios, setPopularStudios] = useState([]);
  const [loadingStudios, setLoadingStudios] = useState(true);
  const [popularArtists, setPopularArtists] = useState([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [artistsError, setArtistsError]     = useState(false);

  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // Default members list (following + followers)
  const [defaultMembers, setDefaultMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  // Bumped on every search so a slow response from a previous tab/query
  // can't overwrite the results of a newer one.
  const searchIdRef = useRef(0);

  const statusDot = (id) => STATUS_COLORS[(me.statuses||{})[id]]?.dot;

  useEffect(() => {
    // loadingMembers is flipped on in changeTab (the event handler), like
    // loadingPopular in changeTypeFilter.
    if(tab !== "members" || defaultMembers.length) return;
    (async () => {
      try {
        const [followingList, followerList] = await Promise.all([
          follows.getFollowing(myUsername).catch(()=>[]),
          follows.getFollowers(myUsername).catch(()=>[]),
        ]);
        const allUsernames = [...new Set([...followingList, ...followerList])].filter(u=>u!==myUsername);
        if(!allUsernames.length) { setDefaultMembers([]); setLoadingMembers(false); return; }
        const [rows, counts] = await Promise.all([
          sb.query(`profiles?username=in.(${allUsernames.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64,bio,watched`),
          follows.getCounts(allUsernames).catch(() => ({})),
        ]);
        setDefaultMembers((rows||[]).map(u => ({
          ...u,
          followerCount:  counts[u.username]?.followers ?? 0,
          followingCount: counts[u.username]?.following ?? 0,
          isFollowing: followingList.includes(u.username),
          isFollower:  followerList.includes(u.username),
        })));
      } catch { /* leave the list empty — the empty state explains it */ }
      setLoadingMembers(false);
    })();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Artist tab is backed by a third-party API — fetched lazily on first visit
  // (like the members tab) rather than eagerly on mount (unlike studios,
  // which is a single cheap Supabase query).
  useEffect(() => {
    if(tab !== "artist" || popularArtists.length) return;
    loadPopularArtists();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  function loadPopularArtists() {
    setLoadingArtists(true); setArtistsError(false);
    fetchPopularArtists(16)
      .then(setPopularArtists)
      .catch(() => setArtistsError(true))
      .finally(() => setLoadingArtists(false));
  }

  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 150); return () => clearTimeout(t); }, []);

  // Categories are never empty — prefill popular anime, refetched per type filter so
  // "Film"/"OAV" don't just show a TV-dominated list under the wrong label.
  // loadingPopular is flipped back on in changeTypeFilter (the event handler), not here,
  // so the effect body only synchronizes with the fetch instead of driving state itself.
  useEffect(() => {
    let cancelled = false;
    fetchPopularAnime(24, typeFilter==="all" ? null : typeFilter)
      .then(rows => { if(!cancelled) setPopularAnime(rows); })
      .finally(() => { if(!cancelled) setLoadingPopular(false); });
    return () => { cancelled = true; };
  }, [typeFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchPopularStudios(12, lang).then(rows => { if(!cancelled) setPopularStudios(rows); }).catch(() => {}).finally(() => { if(!cancelled) setLoadingStudios(false); });
    return () => { cancelled = true; };
  }, [lang]);

  // Progressive, non-blocking logo enhancement — never gates the initial render.
  // Gated on the Studio tab being active (like the artist fetch above) so this
  // Jikan-backed enrichment doesn't burn the shared rate-limited queue — and
  // risk starving a studio modal opened moments later — while the user is
  // still browsing another tab.
  useEffect(() => {
    if(tab !== "studio" || !popularStudios.length) return;
    let cancelled = false;
    popularStudios.forEach((s, i) => {
      if("logo" in s) return;
      setTimeout(async () => {
        if(cancelled) return;
        let url = null;
        try { url = (await jikan.getProducerFull(s.mal_id))?.data?.images?.jpg?.image_url || null; } catch { /* keep text logo fallback */ }
        if(!cancelled) setPopularStudios(prev => prev.map(p => p.mal_id === s.mal_id ? { ...p, logo: url } : p));
      }, i * 450);
    });
    return () => { cancelled = true; };
  }, [popularStudios.length, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDocClick = e => { if(boxRef.current && !boxRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const doSearch = async (q, fromTab = tab, type = typeFilter) => {
    const trimmed = q.trim(); if(!trimmed) return;
    const searchTab = searchTabFor(fromTab);
    if(searchTab !== tab) setTab(searchTab);
    const id = ++searchIdRef.current;
    setQuery(trimmed); setSubmitted(true); setLoading(true); setError(null); setShowSuggestions(false); setResults([]);
    try {
      let rows = [];
      if(searchTab === "anime")        rows = await searchAnime(trimmed, type);
      else if(searchTab === "studio")  rows = await searchStudios(trimmed, lang);
      else if(searchTab === "artist")  rows = await searchArtists(trimmed, 24);
      else if(searchTab === "members") rows = await searchMembers(trimmed, blockedUsers);
      if(id !== searchIdRef.current) return;
      setResults(rows);
      if(searchTab === "studio") {
        // Country badges filled in the background
        getStudioCountries(rows.map(s => s.mal_id), lang).then(countries => {
          if(id !== searchIdRef.current || !Object.keys(countries).length) return;
          setResults(prev => prev.map(s => countries[s.mal_id] ? { ...s, country: countries[s.mal_id] } : s));
        }).catch(() => {});
      }
    } catch(e) {
      if(id !== searchIdRef.current) return;
      if(e.message?.includes("AnimeThemes")) {
        setError(t.animeThemesDown);
      } else if(e.message?.includes("504") || e.message?.includes("Gateway") || e.message?.includes("fetch")) {
        setError(t.jikanDown);
      } else setError(e.message);
    } finally {
      if(id === searchIdRef.current) setLoading(false);
    }
  };

  const clearSearch = () => {
    searchIdRef.current++;
    setQuery(""); setSubmitted(false); setResults([]); setLoading(false); setError(null);
    setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus();
  };
  // The query survives a tab change: an active search re-runs on the new tab.
  const changeTab = (id) => {
    setTab(id); setSuggestions([]); setShowSuggestions(false);
    if(id === "members" && !defaultMembers.length) setLoadingMembers(true);
    if(submitted && id !== "season") doSearch(query, id);
  };
  const changeTypeFilter = (id) => {
    setLoadingPopular(true); setTypeFilter(id);
    if(submitted && tab === "anime") doSearch(query, "anime", id);
  };

  const suggestsAnime = searchTabFor(tab) === "anime";

  const onQueryChange = (val) => {
    setQuery(val);
    setActiveSuggestion(-1);
    if(submitted && !val) { clearSearch(); return; }
    if(!suggestsAnime) return;
    if(debounceRef.current) clearTimeout(debounceRef.current);
    if(!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const rows = await fetchTitleSuggestions(val, 10);
      setSuggestions(rows);
      setShowSuggestions(true);
    }, 220);
  };

  const selectSuggestion = (row) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery("");
    onOpenDetail(supabaseRowToAnime(row));
  };

  const onInputKeyDown = (e) => {
    if(suggestsAnime && showSuggestions && suggestions.length > 0) {
      if(e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestion(i => (i+1) % suggestions.length); return; }
      if(e.key === "ArrowUp")   { e.preventDefault(); setActiveSuggestion(i => (i-1+suggestions.length) % suggestions.length); return; }
      if(e.key === "Escape")    { setShowSuggestions(false); return; }
      if(e.key === "Enter") {
        e.preventDefault();
        if(activeSuggestion >= 0 && suggestions[activeSuggestion]) selectSuggestion(suggestions[activeSuggestion]);
        else doSearch(query);
        return;
      }
    }
    if(e.key === "Enter") doSearch(query);
    if(e.key === "Escape") setShowSuggestions(false);
  };

  const placeholder = { studio:t.placeholderStudio, artist:t.placeholderArtist, members:t.placeholderMembers }[tab] || t.placeholderAnime;
  const showResults = submitted && tab !== "season";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 animate-slide-up">
        <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {/* ── SEARCH BAR — the page's primary action, full width ── */}
      <div ref={boxRef} className="relative mb-4">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
        <input ref={inputRef} value={query}
          onChange={e => onQueryChange(e.target.value)}
          onFocus={() => { if(suggestions.length) setShowSuggestions(true); }}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-white/10 bg-white/6 py-3.5 pl-11 pr-10 text-[15px] text-slate-100 outline-none transition focus:border-violet-400/50 focus:bg-white/8" />
        {query && (
          <button onClick={clearSearch} className="absolute right-3.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-[11px] text-slate-400">✕</button>
        )}

        {suggestsAnime && showSuggestions && suggestions.length > 0 && (
          <div className={`absolute inset-x-0 top-full z-40 mt-2 max-h-96 overflow-y-auto p-1.5 ${GLASS}`} style={GLASS_STYLE}>
            {suggestions.map((row, i) => (
              <button key={row.mal_id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectSuggestion(row)}
                onMouseEnter={() => setActiveSuggestion(i)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${i===activeSuggestion ? "bg-white/10" : "hover:bg-white/5"}`}>
                <img src={row.image_url || row.large_image || FALLBACK} alt="" onError={e=>{e.target.src=FALLBACK;}} className="h-12 w-9 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-slate-100">{row.title_en || row.title}</div>
                  <div className="truncate text-[10px] text-slate-500">
                    {row.title_en && row.title_en !== row.title ? `${row.title} · ` : ""}{row.year || "?"}{row.type ? ` · ${row.type}` : ""}
                  </div>
                </div>
                {row.score && <span className="shrink-0 text-[11px] font-bold text-amber-400">★{row.score}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(tabItem => <Chip key={tabItem.id} label={tabItem.label} emoji={tabItem.emoji} selected={tab===tabItem.id} onClick={() => changeTab(tabItem.id)} />)}
      </div>

      {tab === "anime" && (
        <div className="mb-6">
          <ChipGroup items={TYPE_FILTERS} value={[typeFilter]} onToggle={changeTypeFilter} />
        </div>
      )}

      <div className="mt-2">
      {/* ── SEASON TAB ── */}
      {tab === "season" && (
        <>
          <div className="mb-4">
            <div className="text-[15px] font-black text-slate-100">{t.seasonTitle}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">{t.seasonSubtitle}</div>
          </div>
          <AiringCalendar onOpenDetail={onOpenDetail} me={me} t={t} />
        </>
      )}

      {/* ── ANIME TAB ── */}
      {tab === "anime" && !submitted && (
        <>
          <SectionLabel className="mb-3">{POPULAR_LABELS[typeFilter] || POPULAR_LABELS.all}</SectionLabel>
          {loadingPopular ? <Spinner label={t.loading} /> : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {popularAnime.map(a => (
                <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusDot(a.mal_id)} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── STUDIO TAB ── */}
      {tab === "studio" && !submitted && (
        <>
          <SectionLabel className="mb-3">{t.studiosPopular}</SectionLabel>
          {loadingStudios ? <Spinner label={t.loading} /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularStudios.map(s => (
                <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} t={t} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ARTIST TAB ── */}
      {tab === "artist" && !submitted && (
        <>
          <SectionLabel className="mb-3">{t.artistsPopular}</SectionLabel>
          {loadingArtists ? <Spinner label={t.loading} /> : artistsError ? (
            <div className="py-8 text-center">
              <div className="mb-3 text-xs text-red-400">{t.animeThemesDown}</div>
              <button onClick={loadPopularArtists}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10">
                {t.retry}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularArtists.map(a => <ArtistCard key={a.slug} artist={a} onClick={() => setArtistModal(a)} t={t} />)}
            </div>
          )}
        </>
      )}

      {/* ── MEMBERS TAB ── */}
      {tab === "members" && !submitted && (() => {
        // Filtered at render (not just at fetch time) so blocking someone who
        // follows you drops them from this list immediately, without waiting
        // on the once-per-session fetch above to re-run.
        const visibleMembers = defaultMembers.filter(u => !blockedUsers?.has(u.username));
        return (
        <div>
          {loadingMembers && <Spinner label={t.loading}/>}
          {!loadingMembers && visibleMembers.length === 0 && (
            <EmptyState emoji="👥" title={t.noMembersTitle} subtitle={t.noMembersSubtitle} />
          )}
          {!loadingMembers && visibleMembers.length > 0 && (
            <>
              <SectionLabel className="mb-3">{t.membersYourConnections}</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleMembers.map(u => (
                  <MemberCard key={u.username} u={u} onOpenUser={onOpenUser} t={t}/>
                ))}
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* ── SEARCH RESULTS (any tab but Saison) ── */}
      {showResults && (
        <>
          <div className="mb-3 text-[11px] font-semibold text-slate-500">{loading ? t.searching : t.resultCount(results.length)}</div>
          {loading && <Spinner label={t.searchingInProgress} />}
          {error && <div className="py-8 text-center text-xs text-red-400">{t.errorPrefix(error)}</div>}
          {!loading && !error && results.length === 0 && <EmptyState emoji="🔍" title={t.noResultsTitle} subtitle={t.noResultsSubtitle} />}

          {!loading && tab === "anime" && results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {results.map(a => (
                <AnimeCard key={a.mal_id} anime={a} onClick={onOpenDetail} statusDot={statusDot(a.mal_id)} moodPts={ptsStore[a.mal_id]} quickAction="watchlist" />
              ))}
            </div>
          )}

          {!loading && tab === "studio" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(s => <StudioCard key={s.mal_id} studio={s} onClick={() => setStudioModal({ id:s.mal_id, name:s.name })} t={t} />)}
            </div>
          )}

          {!loading && tab === "artist" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(a => <ArtistCard key={a.slug} artist={a} onClick={() => setArtistModal(a)} t={t} />)}
            </div>
          )}

          {!loading && tab === "members" && results.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(u => <MemberCard key={u.username} u={u} onOpenUser={onOpenUser} t={t}/>)}
            </div>
          )}
        </>
      )}
      </div>

      {studioModal && <StudioModal studioId={studioModal.id} studioName={studioModal.name} onClose={() => setStudioModal(null)} onOpenDetail={a => { setStudioModal(null); onOpenDetail(a); }} />}
      {artistModal && <ArtistModal artist={artistModal} onClose={() => setArtistModal(null)} onOpenDetail={a => { setArtistModal(null); onOpenDetail(a); }} />}
    </div>
  );
}
