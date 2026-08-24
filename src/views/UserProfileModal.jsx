import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { STATUS_COLORS, STATUS_PRIORITY } from "../constants/statuses.js";
import { MOOD_KEYS } from "../constants/moods.js";
import { sb, follows, loadProfile } from "../api/supabase.js";
import { jikan } from "../api/jikan.js";
import { FRAMES } from "../frames/frames.js";
import { FrameSVG } from "../frames/FrameSVG.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { AnimePoster } from "../components/AnimeCard.jsx";
import { MoodOctagon } from "../components/MoodOctagon.jsx";
import { ScoreChart } from "../components/ScoreChart.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Modal } from "../components/Modal.jsx";
import { ChatModal } from "../components/ChatModal.jsx";
import { TabBar } from "../components/ui.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const TABS = [
  {id:"profile", label:"Profil"},
  {id:"journal", label:"Journal"},
  {id:"lists",   label:"Listes"},
];

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if(diff < 60) return "à l'instant";
  if(diff < 3600) return `${Math.floor(diff/60)}min`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  if(diff < 604800) return `${Math.floor(diff/86400)}j`;
  return new Date(ts).toLocaleDateString("fr-FR", {day:"numeric",month:"short"});
}

export function UserProfileModal({ username, onClose, onOpenDetail }) {
  const { myUsername } = useApp();
  const isOwnProfile = myUsername === username.toLowerCase();

  const [profile, setProfile]         = useState(null);
  const [tab, setTab]                 = useState("profile");
  const [loading, setLoading]         = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [animeCache, setAnimeCache]   = useState({});
  const [showChat, setShowChat]       = useState(false);
  const [moodAvg, setMoodAvg]         = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let prof = await loadProfile(username);
        if(!prof) {
          const rows = await sb.query(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
          if(rows?.[0]) prof = {
            ...rows[0],
            hiddenCompleted: rows[0].hidden_completed||[],
            highlights: rows[0].highlights||[],
            customLists: rows[0].custom_lists||[],
            pinnedList: rows[0].pinned_list||null,
          };
        }
        const [isF, followers, following] = await Promise.all([
          isOwnProfile ? Promise.resolve(false) : follows.isFollowing(myUsername, username),
          follows.getFollowers(username),
          follows.getFollowing(username),
        ]);
        if(cancelled) return;
        setProfile(prof);
        setIsFollowing(isF);
        setFollowerCount(followers.length);
        setFollowingCount(following.length);

        // Compute mood radar
        const watchedIds = prof?.watched||[];
        if(watchedIds.length > 0) {
          const totals = {}; MOOD_KEYS.forEach(k=>{totals[k]=0;});
          let cnt = 0;
          const chunks = [];
          for(let i=0;i<watchedIds.length;i+=100) chunks.push(watchedIds.slice(i,i+100));
          for(const chunk of chunks) {
            try {
              const rows = await sb.query(`mood_pts_v4?mal_id=in.(${chunk.join(",")})&select=${MOOD_KEYS.join(",")}&limit=${chunk.length}`);
              (rows||[]).forEach(row => {
                const hasData = MOOD_KEYS.some(k=>(row[k]||0)>0);
                if(hasData) { MOOD_KEYS.forEach(k=>{totals[k]+=(row[k]||0);}); cnt++; }
              });
            } catch {}
          }
          if(cnt>0) {
            const avg={}; MOOD_KEYS.forEach(k=>{avg[k]=Math.round(totals[k]/cnt);});
            if(!cancelled) setMoodAvg(avg);
          }
        }
      } catch(e) { console.error(e); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefetch anime when profile loads
  useEffect(() => {
    if(!profile) return;
    const favIds = (profile.favorites||[]).filter(Boolean);
    const highlightIds = (profile.highlights||[]).slice(0,5);
    const journalIds = [...(profile.watched||[])].slice(-20).reverse();
    const pinnedListId = profile.pinnedList||profile.pinned_list||null;
    const pinnedList = (profile.customLists||profile.custom_lists||[]).find(l=>l.id===pinnedListId);
    const pinnedIds = pinnedList ? pinnedList.animeIds.slice(0,5) : [];
    const ids = [...new Set([...favIds, ...highlightIds, ...pinnedIds, ...journalIds])];
    ids.forEach(async id => {
      if(animeCache[id]) return;
      try { const r = await jikan.getAnime(id); setAnimeCache(p=>({...p,[id]:r.data})); } catch {}
    });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      if(isFollowing) { await follows.unfollow(myUsername, username); setIsFollowing(false); setFollowerCount(c=>c-1); }
      else { await follows.follow(myUsername, username); setIsFollowing(true); setFollowerCount(c=>c+1); }
    } catch(e) { console.error(e); }
    finally { setFollowLoading(false); }
  };

  const getAnime = id => animeCache[id] || { mal_id:id, title:`#${id}`, images:{jpg:{}} };
  const rated = Object.keys(profile?.ratings||{}).map(Number);

  const journalIds = profile
    ? [...(profile.watched||[])].sort((a,b) =>
        (STATUS_PRIORITY[(profile.statuses||{})[a]||"completed"]??5) -
        (STATUS_PRIORITY[(profile.statuses||{})[b]||"completed"]??5)
      ).slice(0,100)
    : [];

  const pinnedListId = profile?.pinnedList || profile?.pinned_list || null;
  const customLists  = profile?.customLists || profile?.custom_lists || [];
  const pinnedList   = customLists.find(l=>l.id===pinnedListId) || null;
  const highlights   = profile?.highlights || [];

  return (
    <>
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      {loading ? <div className="p-8 flex justify-center"><Spinner label="Chargement…"/></div> : !profile ? (
        <EmptyState emoji="😶" title="Profil introuvable" />
      ) : (
        <div className="p-6">
          {/* Header */}
          <div className="mb-5 flex items-start gap-4">
            <FrameSVG frame={profile.activeFrame ? FRAMES[profile.activeFrame] : null} size={72}>
              <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-full text-3xl"
                style={{background:GRADIENT_PRIMARY, width:72, height:72}}>
                {profile.avatar?.startsWith?.("http")
                  ? <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover"/>
                  : (profile.avatar||"👤")}
              </div>
            </FrameSVG>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-black text-slate-100">{profile.name||username}</div>
              <div className="text-xs text-slate-500 mb-1">@{username}</div>
              {profile.bio && <div className="text-xs italic text-slate-400 mb-2">{profile.bio}</div>}
              <div className="flex items-center gap-4 text-[11px]">
                <span><span className="font-black text-slate-100">{followerCount}</span> <span className="text-slate-500">abonnés</span></span>
                <span><span className="font-black text-slate-100">{followingCount}</span> <span className="text-slate-500">abonnements</span></span>
              </div>
            </div>
            {!isOwnProfile && (
              <div className="flex shrink-0 flex-col gap-2">
                <button onClick={handleFollow} disabled={followLoading}
                  className="rounded-full px-4 py-2 text-[13px] font-bold transition"
                  style={{border:isFollowing?"1px solid rgba(var(--fg-rgb),0.15)":"none",
                    background:isFollowing?"transparent":GRADIENT_PRIMARY,
                    color:isFollowing?"var(--text-2)":"#fff",
                    boxShadow:isFollowing?"none":"0 8px 24px rgba(109,91,255,.35)"}}>
                  {followLoading?"…":isFollowing?"Suivi ✓":"Suivre"}
                </button>
                <button onClick={()=>setShowChat(true)}
                  className="rounded-full border border-white/15 px-4 py-2 text-[13px] font-bold text-slate-300 transition hover:bg-white/5">
                  💬 Message
                </button>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            {[
              {l:"Vus",        v:(profile.watched||[]).length},
              {l:"Notés",      v:rated.length},
              {l:"Moy.",       v:rated.length?(rated.reduce((a,id)=>a+(profile.ratings?.[id]?.score||0),0)/rated.length).toFixed(1):"—"},
              {l:"Abonnés",    v:followerCount},
            ].map(s=>(
              <div key={s.l} className="rounded-xl border border-white/6 bg-white/3 py-2 text-center">
                <div className="text-sm font-black text-purple-300">{s.v}</div>
                <div className="mt-0.5 text-[9px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>

          <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-5"/>

          {/* ── PROFIL TAB ── */}
          {tab === "profile" && (
            <div className="flex flex-col gap-6">
              {/* Favoris */}
              {(profile.favorites||[]).some(Boolean) && (
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">❤️ Favoris</div>
                  <div className="grid grid-cols-5 gap-2">
                    {(profile.favorites||[null,null,null,null,null]).slice(0,5).map((favId,i)=>(
                      <AnimePoster key={i} anime={favId?getAnime(favId):null} empty={!favId} loading={!!favId} onClick={onOpenDetail}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Highlights */}
              {highlights.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">⭐ Highlights</div>
                  <div className="grid grid-cols-5 gap-2">
                    {highlights.slice(0,5).map(id=>(
                      <AnimePoster key={id} anime={getAnime(id)} loading onClick={onOpenDetail}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Liste épinglée */}
              {pinnedList && (
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">📌 {pinnedList.name}</div>
                  <div className="grid grid-cols-5 gap-2">
                    {pinnedList.animeIds.slice(0,5).map(id=>(
                      <AnimePoster key={id} anime={getAnime(id)} loading onClick={onOpenDetail}/>
                    ))}
                    {pinnedList.animeIds.length===0 && (
                      <div className="col-span-5 text-center text-[11px] text-slate-600 py-4">Liste vide</div>
                    )}
                  </div>
                </div>
              )}

              {/* Mood radar */}
              {moodAvg && (
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">🎭 Profil émotionnel</div>
                  <MoodOctagon pts={moodAvg}/>
                </div>
              )}

              {/* Score distribution */}
              {rated.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">📊 Distribution des notes</div>
                  <div className="rounded-2xl border border-white/6 bg-white/3 p-4">
                    <ScoreChart ratings={profile.ratings||{}}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── JOURNAL TAB ── */}
          {tab === "journal" && (
            journalIds.length===0 ? <EmptyState emoji="📖" title="Aucun animé dans le journal"/> : (
              <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                {journalIds.map(id=>{
                  const status=(profile.statuses||{})[id]||"completed";
                  const sc=STATUS_COLORS[status]||STATUS_COLORS.completed;
                  const a=getAnime(id); const r=profile.ratings?.[id];
                  const img=a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                  return (
                    <button key={id} onClick={()=>onOpenDetail(a)}
                      className="flex gap-3 overflow-hidden rounded-xl text-left"
                      style={{border:`1px solid ${sc.border}`,background:sc.bg}}>
                      <div className="relative h-16 w-11 shrink-0 bg-black/20">
                        {img&&<img src={img} alt={a.title} className="h-full w-full object-cover" onError={e=>{e.target.style.display="none";}}/>}
                        <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{background:sc.dot}}/>
                      </div>
                      <div className="flex flex-1 flex-col justify-between py-2 pr-3">
                        <div className="text-xs font-extrabold leading-tight text-slate-100">{a.title}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold" style={{color:sc.dot}}>{sc.label}</span>
                          {r&&<span className="text-[11px] font-extrabold text-amber-400">★{r.score}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* ── LISTES TAB ── */}
          {tab === "lists" && (
            customLists.length===0 ? <EmptyState emoji="📋" title="Aucune liste"/> : (
              <div className="flex flex-col gap-4">
                {customLists.map(list=>(
                  <div key={list.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="text-[11px] font-bold text-slate-300">{list.name}</div>
                      {list.id===pinnedListId&&<span className="text-[9px] text-slate-500">📌</span>}
                      <span className="text-[9px] text-slate-600">{list.animeIds.length} animés</span>
                    </div>
                    {list.animeIds.length>0 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {list.animeIds.slice(0,5).map(id=>(
                          <AnimePoster key={id} anime={getAnime(id)} loading onClick={onOpenDetail}/>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-600 py-2">Liste vide</div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </Modal>
    {showChat && <ChatModal username={myUsername} peer={username} onClose={()=>setShowChat(false)}/>}
    </>
  );
}
