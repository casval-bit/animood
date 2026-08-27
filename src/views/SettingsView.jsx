import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { useTheme } from "../context/useTheme.js";
import { useLang } from "../context/useLang.js";
import { parseMALXml } from "../constants/mal-import.js";
import { importAniListUser } from "../api/anilist.js";
import { GradientButton, TabBar } from "../components/ui.jsx";
import { sb, follows } from "../api/supabase.js";
import { uploadToCloudinary } from "../api/cloudinary.js";
import { GRADIENT_PRIMARY } from "../constants/theme.js";
import { SETTINGS_I18N } from "../constants/settingsI18n.js";

const LANG_OPTIONS = [
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "en", label: "English",  flag: "🇬🇧" },
];

function ThemePreview({ id }) {
  const dark = id === "dark";
  return (
    <div
      className="h-14 w-full overflow-hidden rounded-lg"
      style={{
        background: dark ? "#0f172a" : "#d3cce8",
        border: `1px solid ${dark ? "rgba(255,255,255,.1)" : "rgba(24,18,43,.14)"}`,
      }}
    >
      <div className="h-3 w-full" style={{ background: GRADIENT_PRIMARY }} />
      <div className="flex flex-col gap-1 p-1.5">
        <div className="h-1 w-3/4 rounded-full" style={{ background: dark ? "rgba(255,255,255,.25)" : "#120f24" }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: dark ? "rgba(255,255,255,.15)" : "#817a9b" }} />
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="rounded-2xl border border-white/6 bg-white/3 p-4">{children}</div>
    </div>
  );
}

export function SettingsView({ onClose }) {
  const { me, saveMe, logout, myUsername } = useApp();
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = SETTINGS_I18N[lang] || SETTINGS_I18N.fr;
  const fileRef   = useRef(null);
  const avatarRef = useRef(null);

  const [category, setCategory] = useState("preferences");
  const CATEGORY_TABS = [
    { id: "preferences", label: t.catPreferences },
    { id: "profile",     label: t.catProfile },
    { id: "data",        label: t.catData },
    { id: "account",     label: t.catAccount },
  ];

  const [usernameInput, setUsernameInput] = useState(me.name || "");
  const [usernameSaved, setUsernameSaved] = useState(false);

  const [deleteNotice, setDeleteNotice] = useState(false);

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
  const [allFrames, setAllFrames]           = useState([]);
  const [activeFrame,    setActiveFrame]    = useState(null);
  const [framesLoading,  setFramesLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { FRAMES, getUnlockedFrames, getBestFrame } = await import("../frames/frames.js");
        const [followerRows, voteRows, gameEloRows] = await Promise.all([
          follows.getFollowers(myUsername).catch(()=>[]),
          sb.query(`user_votes?username=eq.${encodeURIComponent(myUsername)}&select=pts_added&limit=1000`).catch(()=>[]),
          sb.query(`game_elo?username=eq.${encodeURIComponent(myUsername)}&select=points_total&limit=1`).catch(()=>[]),
        ]);
        const gamePoints = gameEloRows?.[0]?.points_total || 0;
        const genreCounts = {};
        const chunks = [];
        for(let i=0;i<me.watched.length;i+=100) chunks.push(me.watched.slice(i,i+100));
        for(const chunk of chunks) {
          try {
            const rows = await sb.query(`anime_cache?mal_id=in.(${chunk.join(",")})&select=genres`);
            (rows||[]).forEach(r => { (r.genres||[]).forEach(g => { const n=g.name||g; genreCounts[n]=(genreCounts[n]||0)+1; }); });
          } catch {}
        }
        const unlocked = getUnlockedFrames({ watchedCount:me.watched.length, genreCounts, followerCount:(followerRows||[]).length, userVotes:voteRows||[], gamePoints });
        setUnlockedFrames(unlocked);
        // Also store all frames for display
        setAllFrames(Object.values(FRAMES));
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

  const handleSaveUsername = () => {
    const name = usernameInput.trim();
    if(!name || name === me.name) return;
    saveMe({ ...me, name });
    setUsernameSaved(true);
    setTimeout(() => setUsernameSaved(false), 2000);
  };

  const handleDeleteAccount = () => {
    setDeleteNotice(true);
    setTimeout(() => setDeleteNotice(false), 3000);
  };

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
    e.target.value = "";
  };

  const mergeImport = ({ watched, ratings, statuses }) => {
    saveMe({
      ...me,
      watched:  [...new Set([...me.watched, ...watched])],
      ratings:  { ...me.ratings,            ...ratings  },
      statuses: { ...(me.statuses||{}),     ...statuses },
    });
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
      // ── Pass myUsername so imported ratings sync to user_votes ──
      const { watched, ratings, statuses, skipped } = await importAniListUser(alUsername, myUsername);
      mergeImport({ watched, ratings, statuses });
      setAlStats({ watched: Object.keys(statuses).length, rated: Object.keys(ratings).length, skipped });
      setAlStatus("done");
    } catch(err) { setAlError(err.message); setAlStatus("error"); }
  };

  const currentAvatar = me.avatar?.startsWith?.("http") ? me.avatar : null;

  return (
    <div className="fixed inset-0 z-400 flex flex-col backdrop-blur-2xl" style={{ background:"var(--overlay)" }}>
      <div className="flex items-center gap-3 border-b border-white/6 px-6 py-4">
        <button onClick={onClose} className="text-xl text-slate-400">←</button>
        <span className="text-base font-black text-slate-100">{t.title}</span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6">

        <TabBar tabs={CATEGORY_TABS} active={category} onChange={setCategory} className="mb-6" />

        {/* ─── PRÉFÉRENCES ─── */}
        {category === "preferences" && <>
        <Section title={t.appearance}>
          <div className="grid grid-cols-2 gap-3">
            {["dark","light"].map(id => {
              const active = theme === id;
              const label = id === "dark" ? t.themeDark : t.themeLight;
              const desc  = id === "dark" ? t.themeDarkDesc : t.themeLightDesc;
              return (
                <button key={id} onClick={() => setTheme(id)}
                  className="flex flex-col items-center gap-2 rounded-xl p-2.5 text-center transition"
                  style={{ border: active ? "2px solid #7c3aed" : "2px solid transparent", background: active ? "rgba(124,58,237,0.1)" : "rgba(var(--fg-rgb),0.03)" }}>
                  <ThemePreview id={id} />
                  <div>
                    <div className="text-xs font-bold text-slate-100">{label}</div>
                    <div className="text-[10px] text-slate-500">{desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title={t.language}>
          <div className="grid grid-cols-2 gap-3">
            {LANG_OPTIONS.map(opt => {
              const active = lang === opt.id;
              return (
                <button key={opt.id} onClick={() => setLang(opt.id)}
                  className="flex items-center justify-center gap-2 rounded-xl p-3 text-center transition"
                  style={{ border: active ? "2px solid #7c3aed" : "2px solid transparent", background: active ? "rgba(124,58,237,0.1)" : "rgba(var(--fg-rgb),0.03)" }}>
                  <span className="text-xl">{opt.flag}</span>
                  <span className="text-xs font-bold text-slate-100">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </Section>
        </>}

        {/* ─── PROFIL ─── */}
        {category === "profile" && <>
        <Section title={t.avatar}>
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
                {avatarUploading ? t.avatarUploading : t.avatarUpload}
              </button>
              <p className="text-[10px] text-slate-600 text-center">{t.avatarHint}</p>
              {me.avatar?.startsWith?.("http") && !me.avatar?.includes?.("googleusercontent") && (
                <button onClick={()=>saveMe({...me, avatar: null})}
                  className="w-full rounded-xl border border-red-400/20 bg-red-400/6 py-2 text-xs font-bold text-red-400">
                  {t.avatarRemove}
                </button>
              )}
              {me.avatar?.startsWith?.("http") && me.avatar?.includes?.("googleusercontent") && (
                <p className="text-[10px] text-slate-500 text-center">{t.avatarGoogle}</p>
              )}
            </div>
          </div>
          {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
        </Section>

        <Section title={t.username}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">{t.usernameDesc}</p>
          <div className="flex gap-2">
            <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSaveUsername()}
              placeholder={t.usernamePlaceholder} maxLength={30}
              className="flex-1 rounded-xl border border-white/10 bg-white/6 px-3.5 py-3 text-sm text-slate-100 outline-none"/>
            <GradientButton onClick={handleSaveUsername} disabled={!usernameInput.trim()||usernameInput.trim()===me.name} className="shrink-0 px-4 py-3 text-[13px]">
              {t.usernameSaveBtn}
            </GradientButton>
          </div>
          {usernameSaved && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              {t.usernameSaved}
            </div>
          )}
        </Section>

        <Section title={t.frame}>
          {framesLoading ? (
            <p className="text-xs text-slate-500 text-center py-2">{t.framesLoading}</p>
          ) : (
            <>
              <button onClick={()=>applyFrame(null)}
                className="mb-3 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition"
                style={{border:!activeFrame?"2px solid #7c3aed":"2px solid transparent",background:!activeFrame?"rgba(124,58,237,0.1)":"transparent"}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.05)",
                  border:"2px dashed rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🚫</div>
                <div>
                  <div className="text-xs font-bold text-slate-100">{t.frameNone}</div>
                  <div className="text-[10px] text-slate-500">{t.frameNoneDesc}</div>
                </div>
              </button>
              {["watched","contribution","followers","genre","games"].map(cat => {
                const catAllFrames = allFrames.filter(f=>f.category===cat);
                if(!catAllFrames.length) return null;
                const catLabels = {watched:t.frameCatWatched,contribution:t.frameCatContribution,followers:t.frameCatFollowers,genre:t.frameCatGenre,games:t.frameCatGames};
                return (
                  <div key={cat} className="mb-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">{catLabels[cat]}</div>
                    <div className="flex flex-wrap gap-2">
                      {catAllFrames.map(frame => {
                        const isUnlocked = unlockedFrames.some(f=>f.id===frame.id);
                        const isActive = activeFrame?.id === frame.id;
                        const sz = 44;
                        return (
                          <button key={frame.id}
                            onClick={()=>isUnlocked && applyFrame(frame)}
                            title={isUnlocked ? frame.label : t.frameLocked(frame.label)}
                            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:8,borderRadius:12,
                              cursor:isUnlocked?"pointer":"not-allowed",
                              border:isActive?"2px solid #7c3aed":"2px solid transparent",
                              background:isActive?"rgba(124,58,237,0.1)":"rgba(255,255,255,0.03)",
                              opacity:isUnlocked?1:0.4,
                              filter:isUnlocked?"none":"grayscale(1)"}}>
                            <div style={{position:"relative",width:sz,height:sz}}>
                              <div style={{width:sz,height:sz,borderRadius:"50%",overflow:"hidden",
                                background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                                {currentAvatar ? <img src={currentAvatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : "👤"}
                              </div>
                              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
                                viewBox={`0 0 ${sz} ${sz}`} dangerouslySetInnerHTML={{__html:frame.svg(sz)}}/>
                              {!isUnlocked && (
                                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:16,background:"rgba(0,0,0,0.3)",borderRadius:"50%"}}>🔒</div>
                              )}
                            </div>
                            <span style={{fontSize:9,fontWeight:700,color:isUnlocked?frame.color:"rgba(148,163,184,0.5)",textAlign:"center",maxWidth:56,lineHeight:1.2}}>
                              {frame.label}
                            </span>
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
        </>}

        {/* ─── DONNÉES ─── */}
        {category === "data" && <>
        <Section title={t.importAnilist}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            {t.importAnilistDesc}
          </p>
          <label htmlFor="anilist-username" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t.importAnilistLabel}
          </label>
          <div className="flex gap-2">
            <input id="anilist-username" value={alUsername} onChange={e=>setAlUsername(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&alUsername.trim()&&handleAniListImport()}
              placeholder={t.importAnilistPlaceholder} disabled={alStatus==="importing"}
              className="flex-1 rounded-xl border-2 border-violet-400/30 bg-white/6 px-3.5 py-3 text-sm text-slate-100 outline-none transition focus:border-violet-400/70 disabled:opacity-50"/>
            <GradientButton onClick={handleAniListImport} disabled={alStatus==="importing"||!alUsername.trim()} className="shrink-0 px-4 py-3 text-[13px]">
              {alStatus==="importing" ? "…" : (alStatus==="done" ? t.importBtnReimport : t.importBtn)}
            </GradientButton>
          </div>
          {alStatus==="done" && alStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              {t.importAnilistSuccess(alStats)}
            </div>
          )}
          {alStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {alError}</div>
          )}
        </Section>

        <Section title={t.importXml}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">{t.importXmlDesc}</p>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleXmlImportFixed} className="hidden"/>
          <button onClick={()=>fileRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-indigo-400/40 bg-indigo-400/6 py-3.5 text-sm font-bold text-indigo-300">
            {importStatus==="importing" ? t.importXmlBtnLoading : t.importXmlBtn}
          </button>
          {importStatus==="done" && importStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              {t.importXmlSuccess(importStats)}
            </div>
          )}
          {importStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {importError}</div>
          )}
        </Section>
        </>}

        {/* ─── COMPTE ─── */}
        {category === "account" && <>
        <Section title={t.logoutTitle}>
          <button onClick={logout} className="w-full rounded-xl border border-red-400/30 bg-red-400/6 py-3.5 text-sm font-bold text-red-400">
            {t.logoutBtn}
          </button>
        </Section>

        <Section title={t.deleteAccountTitle}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">{t.deleteAccountDesc}</p>
          <button onClick={handleDeleteAccount}
            className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3.5 text-sm font-bold text-red-400">
            {t.deleteAccountBtn}
          </button>
          {deleteNotice && (
            <div className="mt-2.5 rounded-lg border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-slate-400">
              {t.deleteAccountNotReady}
            </div>
          )}
        </Section>
        </>}

      </div>
    </div>
  );
}
