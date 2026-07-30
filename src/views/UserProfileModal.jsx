import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { STATUS_COLORS, STATUS_PRIORITY } from "../constants/statuses.js";
import { sb, follows, loadProfile } from "../api/supabase.js";
import { jikan } from "../api/jikan.js";
import { FRAMES } from "../frames/frames.js";
import { FrameSVG } from "../frames/FrameSVG.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { AnimePoster } from "../components/AnimeCard.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Modal } from "../components/Modal.jsx";
import { ChatModal } from "../components/ChatModal.jsx";
import { TabBar } from "../components/ui.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const TABS = [{id:"profile",label:"Profil"},{id:"journal",label:"Journal"}];

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let prof = await loadProfile(username);
        if(!prof) {
          const rows = await sb.query(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
          if(rows?.[0]) prof = { ...rows[0], hiddenCompleted: rows[0].hidden_completed||[] };
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
      } catch(e) { console.error(e); }
      finally { if(!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  const journalIds = profile
    ? [...(profile.watched||[])].sort((a,b) => (STATUS_PRIORITY[(profile.statuses||{})[a]||"completed"]??5) - (STATUS_PRIORITY[(profile.statuses||{})[b]||"completed"]??5)).slice(0,50)
    : [];

  // Prefetch favorites + journal anime as soon as the profile loads, regardless of
  // active tab — otherwise the Profil tab's favorites row spins forever.
  useEffect(() => {
    if(!profile) return;
    const favIds = (profile.favorites||[]).filter(Boolean);
    const ids = [...new Set([...favIds, ...journalIds])];
    ids.forEach(async id => {
      if(animeCache[id]) return;
      try { const r = await jikan.getAnime(id); setAnimeCache(p => ({...p,[id]:r.data})); } catch {}
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

  return (
    <>
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {loading ? <Spinner label="Chargement…" /> : !profile ? (
        <EmptyState emoji="😶" title="Profil introuvable" />
      ) : (
        <div className="p-6">
          <div className="mb-4 flex items-center gap-3.5">
            <FrameSVG frame={profile.activeFrame ? FRAMES[profile.activeFrame] : null} size={64}>
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-2xl" style={{ background: GRADIENT_PRIMARY }}>
                {profile.avatar && profile.avatar.startsWith("http") ? <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" /> : (profile.avatar||"👤")}
              </div>
            </FrameSVG>
            <div className="flex-1">
              <div className="text-lg font-black text-slate-100">{profile.name||username}</div>
              <div className="text-xs text-slate-500">@{username}</div>
              {profile.bio && <div className="mt-0.5 text-xs italic text-slate-400">{profile.bio}</div>}
            </div>
            {!isOwnProfile && (
              <div className="flex shrink-0 flex-col gap-1.5">
                <button onClick={handleFollow} disabled={followLoading}
                  className="rounded-full px-4 py-2 text-[13px] font-bold transition hover:-translate-y-0.5"
                  style={{ border: isFollowing?"1px solid rgba(255,255,255,0.15)":"none", background: isFollowing?"transparent":GRADIENT_PRIMARY, color: isFollowing?"#9ca3af":"#fff", boxShadow: isFollowing?"none":"0 8px 24px rgba(109,91,255,.35)" }}>
                  {followLoading ? "…" : isFollowing ? "Suivi ✓" : "Suivre"}
                </button>
                <button onClick={() => setShowChat(true)}
                  className="rounded-full border border-white/15 px-4 py-2 text-[13px] font-bold text-slate-300 transition hover:-translate-y-0.5 hover:bg-white/5">
                  💬 Message
                </button>
              </div>
            )}
          </div>

          <div className="mb-5 grid grid-cols-4 gap-2">
            {[{l:"Vus",v:(profile.watched||[]).length},{l:"Notés",v:rated.length},{l:"Abonnés",v:followerCount},{l:"Abonnements",v:followingCount}].map(s => (
              <div key={s.l} className="rounded-xl border border-white/6 bg-white/3 py-2 text-center">
                <div className="text-sm font-black text-purple-300">{s.v}</div>
                <div className="mt-0.5 text-[9px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>

          <TabBar tabs={TABS} active={tab} onChange={setTab} className="mb-5" />

          {tab === "profile" && (
            <>
              {(profile.favorites||[]).some(Boolean) && (
                <div>
                  <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">❤️ Favoris</div>
                  <div className="grid grid-cols-5 gap-2">
                    {(profile.favorites||[null,null,null,null,null]).slice(0,5).map((favId,i) => (
                      <AnimePoster key={i} anime={favId?getAnime(favId):null} empty={!favId} loading={!!favId} onClick={onOpenDetail} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "journal" && (
            journalIds.length === 0 ? <EmptyState emoji="📖" title="Aucun animé dans le journal" /> : (
              <div className="flex flex-col gap-2">
                {journalIds.map(id => {
                  const status = (profile.statuses||{})[id]||"completed";
                  const sc = STATUS_COLORS[status]||STATUS_COLORS.completed;
                  const a = getAnime(id); const r = profile.ratings?.[id];
                  const img = a?.images?.jpg?.image_url||a?.images?.jpg?.large_image_url;
                  return (
                    <button key={id} onClick={() => onOpenDetail(a)} className="flex gap-3 overflow-hidden rounded-xl text-left" style={{ border:`1px solid ${sc.border}`, background:sc.bg }}>
                      <div className="relative h-17.5 w-12 shrink-0 bg-black/20">
                        {img && <img src={img} alt={a.title} className="h-full w-full object-cover" onError={e=>{e.target.style.display="none";}} />}
                        <div className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background:sc.dot }} />
                      </div>
                      <div className="flex flex-1 flex-col justify-between py-2 pr-3">
                        <div className="text-xs font-extrabold leading-tight text-slate-100">{a.title}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold" style={{ color:sc.dot }}>{sc.label}</span>
                          {r && <span className="text-[11px] font-extrabold text-amber-400">★{r.score}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </Modal>
    {showChat && <ChatModal username={myUsername} peer={username} onClose={() => setShowChat(false)} />}
    </>
  );
}
