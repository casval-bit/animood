import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { parseMALXml } from "../constants/mal-import.js";
import { importAniListUser } from "../api/anilist.js";
import { GradientButton } from "../components/ui.jsx";
import { sb, follows } from "../api/supabase.js";
import { uploadToCloudinary } from "../api/cloudinary.js";

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="rounded-2xl border border-white/6 bg-white/3 p-4">{children}</div>
    </div>
  );
}

export function SettingsView({ onClose }) {
  const { me, saveMe, logout, myUsername } = useApp();
  const fileRef   = useRef(null);
  const avatarRef = useRef(null);

  const [importStatus, setImportStatus] = useState(null);
  const [importStats,  setImportStats]  = useState(null);
  const [importError,  setImportError]  = useState(null);

  const [alUsername, setAlUsername] = useState("");
  const [alStatus,   setAlStatus]   = useState(null);
  const [alStats,    setAlStats]    = useState(null);
  const [alError,    setAlError]    = useState(null);

  const [avatarError,     setAvatarError]     = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [unlockedFrames, setUnlockedFrames] = useState([]);
  const [activeFrame,    setActiveFrame]    = useState(null);
  const [framesLoading,  setFramesLoading]  = useState(true);

  // Load frames on mount
  useEffect(() => {
    (async () => {
      try {
        const { FRAMES, getUnlockedFrames, getBestFrame } = await import("../frames/frames.js");
        const [followerRows, voteRows] = await Promise.all([
          follows.getFollowers(myUsername).catch(()=>[]),
          sb.query(`user_votes?username=eq.${encodeURIComponent(myUsername)}&select=pts_added&limit=1000`).catch(()=>[]),
        ]);
        const genreCounts = {};
        const chunks = [];
        for(let i=0;i<me.watched.length;i+=100) chunks.push(me.watched.slice(i,i+100));
        for(const chunk of chunks) {
          try {
            const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
            (rows||[]).forEach(r => { (r.genres||[]).forEach(g => { const n=g.name||g; genreCounts[n]=(genreCounts[n]||0)+1; }); });
          } catch {}
        }
        const unlocked = getUnlockedFrames({ watchedCount:me.watched.length, genreCounts, followerCount:(followerRows||[]).length, userVotes:voteRows||[] });
        setUnlockedFrames(unlocked);
        if(me.activeFrame) {
          const saved = FRAMES[me.activeFrame];
          if(saved && unlocked.find(f=>f.id===me.activeFrame)) setActiveFrame(saved);
        } else {
          const best = getBestFrame(unlocked);
          if(best) setActiveFrame(best);
        }
      } catch(e) { console.error("frames error", e); }
      setFramesLoading(false);
    })();
  }, []);

  const applyFrame = async (frame) => {
    setActiveFrame(frame);
    saveMe({ ...me, activeFrame: frame?.id || null });
  };

  // Avatar upload via Cloudinary
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const url = await uploadToCloudinary(file, "avatar");
      saveMe({ ...me, avatar: url, avatar_base64: null });
    } catch(err) {
      setAvatarError(err.message);
    }
    setAvatarUploading(false);
    e.target.value = ""; // reset input
  };

  const mergeImport = ({ watched, ratings, statuses }) => {
    saveMe({
      ...me,
      watched:  [...new Set([...me.watched, ...watched])],
      ratings:  { ...me.ratings,            ...ratings  },
      statuses: { ...(me.statuses||{}),     ...statuses },
    });
  };

  const handleXmlImport = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    setImportStatus("importing"); setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { parseMALXml: parse } = require("../constants/mal-import.js");
        const { watched, ratings, statuses } = parseMALXml(ev.target.result);
        mergeImport({ watched, ratings, statuses });
        setImportStats({ watched: watched.length, rated: Object.keys(ratings).length });
        setImportStatus("done");
      } catch(err) { setImportError(err.message); setImportStatus("error"); }
    };
    reader.readAsText(file);
  };

  const handleXmlImportFixed = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    setImportStatus("importing"); setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watched, ratings, statuses } = parseMALXml(ev.target.result);
        mergeImport({ watched, ratings, statuses });
        setImportStats({ watched: watched.length, rated: Object.keys(ratings).length });
        setImportStatus("done");
      } catch(err) { setImportError(err.message); setImportStatus("error"); }
    };
    reader.readAsText(file);
  };

  const handleAniListImport = async () => {
    setAlStatus("importing"); setAlError(null);
    try {
      const { watched, ratings, statuses, skipped } = await importAniListUser(alUsername);
      mergeImport({ watched, ratings, statuses });
      setAlStats({ watched: Object.keys(statuses).length, rated: Object.keys(ratings).length, skipped });
      setAlStatus("done");
    } catch(err) { setAlError(err.message); setAlStatus("error"); }
  };

  const currentAvatar = me.avatar?.startsWith?.("http") ? me.avatar : null;

  return (
    <div className="fixed inset-0 z-400 flex flex-col backdrop-blur-2xl" style={{ background:"rgba(7,11,23,.92)" }}>
      <div className="flex items-center gap-3 border-b border-white/6 px-6 py-4">
        <button onClick={onClose} className="text-xl text-slate-400">←</button>
        <span className="text-base font-black text-slate-100">Paramètres</span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6">

        {/* AVATAR */}
        <Section title="🖼 Avatar">
          <div className="flex items-center gap-5 mb-3">
            <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",flexShrink:0,
              background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>
              {currentAvatar
                ? <img src={currentAvatar} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : (me.avatar && !me.avatar.startsWith("http") ? me.avatar : "👤")}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden"/>
              <button onClick={()=>avatarRef.current?.click()} disabled={avatarUploading}
                className="w-full rounded-xl border-2 border-dashed border-violet-400/40 bg-violet-400/6 py-2.5 text-sm font-bold text-violet-300 disabled:opacity-50">
                {avatarUploading ? "Traitement…" : "📁 Uploader une image"}
              </button>
              <p className="text-[10px] text-slate-600 text-center">JPG, PNG ou WebP · max 2 Mo · redimensionné à 256px</p>
              {me.avatar?.startsWith?.("http") && !me.avatar?.includes?.("googleusercontent") && (
                <button onClick={()=>saveMe({...me, avatar: null})}
                  className="w-full rounded-xl border border-red-400/20 bg-red-400/6 py-2 text-xs font-bold text-red-400">
                  Supprimer l'avatar personnalisé
                </button>
              )}
              {me.avatar?.startsWith?.("http") && me.avatar?.includes?.("googleusercontent") && (
                <p className="text-[10px] text-slate-500 text-center">Avatar Google actif — uploade une image pour le remplacer</p>
              )}
            </div>
          </div>
          {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
        </Section>

        {/* CADRE */}
        <Section title="🎖 Cadre de profil">
          {framesLoading ? (
            <p className="text-xs text-slate-500 text-center py-2">Chargement des cadres…</p>
          ) : unlockedFrames.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3 leading-relaxed">
              Aucun cadre débloqué.<br/>
              Regarde des animés, vote sur les moods et gagne des abonnés !
            </p>
          ) : (
            <>
              {/* No frame option */}
              <button onClick={()=>applyFrame(null)}
                className="mb-3 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition"
                style={{border:!activeFrame?"2px solid #7c3aed":"2px solid transparent",background:!activeFrame?"rgba(124,58,237,0.1)":"transparent"}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.05)",
                  border:"2px dashed rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚫</div>
                <div>
                  <div className="text-xs font-bold text-slate-100">Aucun cadre</div>
                  <div className="text-[10px] text-slate-500">Avatar sans cadre</div>
                </div>
              </button>
              {["watched","contribution","followers","genre"].map(cat => {
                const catFrames = unlockedFrames.filter(f=>f.category===cat);
                if(!catFrames.length) return null;
                const catLabels = {watched:"📺 Animés vus",contribution:"🗳️ Contribution",followers:"👥 Followers",genre:"🎌 Genre"};
                return (
                  <div key={cat} className="mb-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">{catLabels[cat]}</div>
                    <div className="flex flex-wrap gap-2">
                      {catFrames.map(frame => {
                        const isActive = activeFrame?.id === frame.id;
                        const sz = 44;
                        return (
                          <button key={frame.id} onClick={()=>applyFrame(frame)}
                            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:8,borderRadius:12,cursor:"pointer",
                              border:isActive?"2px solid #7c3aed":"2px solid transparent",background:isActive?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.03)"}}>
                            <div style={{position:"relative",width:sz,height:sz}}>
                              <div style={{width:sz,height:sz,borderRadius:"50%",overflow:"hidden",
                                background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                                {currentAvatar
                                  ? <img src={currentAvatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                                  : "👤"}
                              </div>
                              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
                                viewBox={`0 0 ${sz} ${sz}`}
                                dangerouslySetInnerHTML={{__html:frame.svg(sz)}}/>
                            </div>
                            <span style={{fontSize:9,fontWeight:700,color:frame.color,textAlign:"center",maxWidth:56,lineHeight:1.2}}>{frame.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Section>

        {/* IMPORT ANILIST */}
        <Section title="📥 Importer depuis AniList">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Entre ton pseudo AniList — ta liste doit être publique. Les animés "Completed" seront ajoutés avec leurs notes.
          </p>
          <div className="flex gap-2">
            <input value={alUsername} onChange={e=>setAlUsername(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&alUsername.trim()&&handleAniListImport()}
              placeholder="Pseudo AniList…" disabled={alStatus==="importing"}
              className="flex-1 rounded-xl border border-white/10 bg-white/6 px-3.5 py-3 text-sm text-slate-100 outline-none disabled:opacity-50"/>
            <GradientButton onClick={handleAniListImport} disabled={alStatus==="importing"||!alUsername.trim()} className="shrink-0 px-4 py-3 text-[13px]">
              {alStatus==="importing" ? "…" : "Importer"}
            </GradientButton>
          </div>
          {alStatus==="done" && alStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              ✅ {alStats.watched} animés · {alStats.rated} notes{alStats.skipped>0?` · ${alStats.skipped} ignorés`:""}
            </div>
          )}
          {alStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {alError}</div>
          )}
        </Section>

        {/* IMPORT XML */}
        <Section title="📥 Importer un fichier XML (MyAnimeList)">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Exporte ta liste MAL au format XML depuis ton profil et importe-la ici.
          </p>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleXmlImportFixed} className="hidden"/>
          <button onClick={()=>fileRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-indigo-400/40 bg-indigo-400/6 py-3.5 text-sm font-bold text-indigo-300">
            {importStatus==="importing" ? "Import en cours…" : "📂 Choisir un fichier XML"}
          </button>
          {importStatus==="done" && importStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              ✅ {importStats.watched} animés · {importStats.rated} notes
            </div>
          )}
          {importStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {importError}</div>
          )}
        </Section>

        {/* STATS */}
        <Section title="📊 Mes statistiques">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {l:"Vus",    v:me.watched.length},
              {l:"Notés",  v:Object.keys(me.ratings).length},
              {l:"Moy.",   v:Object.keys(me.ratings).length
                ? (Object.values(me.ratings).reduce((a,r)=>a+r.score,0)/Object.keys(me.ratings).length).toFixed(1)
                : "—"},
            ].map(s=>(
              <div key={s.l} className="rounded-xl border border-white/7 bg-white/4 py-3 text-center">
                <div className="text-xl font-black text-purple-300">{s.v}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* DECONNEXION */}
        <Section title="🚪 Déconnexion">
          <button onClick={logout}
            className="w-full rounded-xl border border-red-400/30 bg-red-400/6 py-3.5 text-sm font-bold text-red-400">
            Se déconnecter
          </button>
        </Section>

      </div>
    </div>
  );
}
