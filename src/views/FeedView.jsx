import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { sb, posts as postsApi, comments as commentsApi, follows } from "../api/supabase.js";
import { dispatchPostEvent, addPostEventListener } from "../utils/postEvents.js";
import { uploadToCloudinary } from "../api/cloudinary.js";
import { jikan } from "../api/jikan.js";
import { MentionText, useMentionAutocomplete, MentionSuggestions } from "../components/Mentions.jsx";
import { useLang } from "../context/useLang.js";
import { FEED_I18N } from "../constants/feedI18n.js";
// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts, lang) {
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const diff = (Date.now() - new Date(ts)) / 1000;
  if(diff < 60) return t.timeJustNow;
  if(diff < 3600) return `${Math.floor(diff/60)}min`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  if(diff < 604800) return `${Math.floor(diff/86400)}${t.timeDayUnit}`;
  return new Date(ts).toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", {day:"numeric",month:"short"});
}
function Avatar({ profile, size=32 }) {
  const src = profile?.avatar_base64 || (profile?.avatar?.startsWith?.("http") ? profile.avatar : null);
  return (
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,overflow:"hidden",
      background:"linear-gradient(135deg,#7c3aed,#4f46e5)",display:"flex",alignItems:"center",
      justifyContent:"center",fontSize:size*0.45}}>
      {src ? <img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : (profile?.avatar||"👤")}
    </div>
  );
}
// ─── Season helpers ───────────────────────────────────────────────────────────
function getAnimeSeason(year, month) {
  if(!year) return null;
  const m = parseInt(month) || 1;
  let season;
  if(m <= 3)       season = "Hiver";
  else if(m <= 6)  season = "Printemps";
  else if(m <= 9)  season = "Été";
  else             season = "Automne";
  return `${season} ${year}`;
}
function getLast3Seasons() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const seasons = ["Hiver","Printemps","Été","Automne"];
  const idx = month <= 3 ? 0 : month <= 6 ? 1 : month <= 9 ? 2 : 3;
  const result = [];
  let y = year, i = idx;
  for(let s = 0; s < 3; s++) {
    result.push(`${seasons[i]} ${y}`);
    i--;
    if(i < 0) { i = 3; y--; }
  }
  return result;
}
const RECENT_SEASONS = getLast3Seasons();
function AnimeSearchPicker({ onSelect, onClose }) {
  const { lang } = useLang();
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const timer = useRef(null);
  const search = (val) => {
    setQ(val);
    clearTimeout(timer.current);
    if(!val.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const { sb: sbClient } = await import("../api/supabase.js");
        const rows = await sbClient.query(`anime_cache?title=ilike.*${encodeURIComponent(val)}*&order=score.desc.nullslast&limit=8&select=mal_id,title,image_url,year,genres,aired_from`);
        setResults((rows||[]).map(r => ({...r, aired_month: r.aired_from ? new Date(r.aired_from).getMonth()+1 : null})));
      } catch {}
    }, 350);
  };
  return (
    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,marginTop:4,
      background:"var(--surface-1-strong)",border:"1px solid rgba(var(--fg-rgb),0.1)",borderRadius:12,padding:8,boxShadow:"var(--shadow-modal)"}}>
      <input autoFocus value={q} onChange={e=>search(e.target.value)}
        placeholder={t.animeSearchPlaceholder}
        style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",borderRadius:8,
          background:"rgba(var(--fg-rgb),0.06)",border:"1px solid rgba(var(--fg-rgb),0.1)",
          color:"var(--text-1)",fontSize:13,outline:"none",marginBottom:results.length?8:0}}/>
      {results.map(a => (
        <button key={a.mal_id} onClick={()=>onSelect(a)}
          style={{display:"flex",gap:8,alignItems:"center",width:"100%",padding:"6px 8px",
            background:"none",border:"none",borderRadius:8,cursor:"pointer",textAlign:"left"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(var(--fg-rgb),0.06)"}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          <img src={a.image_url} alt="" style={{width:28,height:40,objectFit:"cover",borderRadius:4,flexShrink:0}}
            onError={e=>{e.target.style.display="none";}}/>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text-1)"}}>{a.title}</div>
            <div style={{fontSize:10,color:"var(--text-3)"}}>{a.year}</div>
          </div>
        </button>
      ))}
      <button onClick={onClose} style={{width:"100%",marginTop:4,padding:"6px",background:"none",
        border:"none",color:"var(--text-3)",fontSize:11,cursor:"pointer"}}>{t.cancel}</button>
    </div>
  );
}
// ─── PostComposer ─────────────────────────────────────────────────────────────
function PostComposer({ onPost }) {
  const { me, myUsername } = useApp();
  const { lang } = useLang();
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const [content, setContent] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [linkedAnime, setLinkedAnime] = useState(null);
  const [showAnimePicker, setShowAnimePicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [poll, setPoll] = useState(null); // null or {options:["",""], multi:false}
  const imageInputRef = useRef(null);
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImageError(null);
    setImageUploading(true);
    try {
      const url = await uploadToCloudinary(file, "post", lang);
      setImageUrl(url);
    } catch(err) {
      setImageError(err.message);
    }
    setImageUploading(false);
    e.target.value = "";
  };
  const profile = { avatar: me.avatar, avatar_base64: me.avatar_base64 };
  const remaining = 280 - content.length;
  const canPost = (content.trim().length > 0 || poll) && !posting && !imageUploading;
  const mention = useMentionAutocomplete(content, myUsername);
  const handlePost = async () => {
    if(!canPost) return;
    setPosting(true);
    try {
      const post = {
        username: myUsername,
        content: content.trim(),
        spoiler,
        anime_id: linkedAnime?.mal_id || null,
        anime_title: linkedAnime?.title || null,
        anime_image: linkedAnime?.image_url || null,
        anime_season: linkedAnime?.year ? `${linkedAnime.year}` : null,
        anime_season_label: linkedAnime?.year ? getAnimeSeason(linkedAnime.year, linkedAnime.aired_month||1) : null,
        anime_genres: linkedAnime?.genres || [],
        image_url: imageUrl || null,
        comment_count: 0,
        likes: [],
        created_at: new Date().toISOString(),
      };
      const result = await postsApi.create(post);
      const createdPost = result?.[0] || post;
      // Create poll if set
      if(poll && createdPost.id) {
        const validOptions = poll.options.filter(o=>o.trim());
        if(validOptions.length >= 2) {
          await sb.query("polls", {
            method: "POST",
            headers: { ...sb.headers, "Prefer": "return=minimal" },
            body: JSON.stringify({
              post_id: createdPost.id,
              options: validOptions.map((text,i)=>({id:String(i+1),text,votes:[]})),
              multi: poll.multi,
            }),
          }).catch(()=>{});
          createdPost.has_poll = true;
        }
      }
      setContent(""); setSpoiler(false); setLinkedAnime(null); setImageUrl(null); setPoll(null);
      onPost?.(createdPost);
    } catch(e) { console.error(e); }
    setPosting(false);
  };
  return (
    <div style={{background:"rgba(var(--fg-rgb),0.03)",borderRadius:16,border:"1px solid rgba(var(--fg-rgb),0.07)",padding:14,marginBottom:16}}>
      <div style={{display:"flex",gap:10}}>
        <Avatar profile={profile} size={38}/>
        <div style={{flex:1,position:"relative"}}>
          <textarea value={content} onChange={e=>setContent(e.target.value.slice(0,280))}
            placeholder={t.composerPlaceholder}
            style={{width:"100%",boxSizing:"border-box",background:"none",border:"none",
              color:"var(--text-1)",fontSize:14,resize:"none",outline:"none",minHeight:70,
              fontFamily:"inherit",lineHeight:1.5}}/>
          <MentionSuggestions suggestions={mention.suggestions}
            onPick={username => setContent(mention.applyMention(content, username))}/>
          {imageUrl && (
            <div style={{position:"relative",marginBottom:8,borderRadius:10,overflow:"hidden",maxHeight:200}}>
              <img src={imageUrl} alt="" style={{width:"100%",objectFit:"cover",maxHeight:200,display:"block"}}/>
              <button onClick={()=>setImageUrl(null)}
                style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.7)",border:"none",
                  color:"#fff",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:12,fontWeight:900}}>✕</button>
            </div>
          )}
          {imageError && <p style={{fontSize:10,color:"#ef4444",marginBottom:6}}>{imageError}</p>}
          {linkedAnime && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",
              background:"rgba(129,140,248,0.1)",borderRadius:8,border:"1px solid rgba(129,140,248,0.2)",marginBottom:8}}>
              <img src={linkedAnime.image_url} alt="" style={{width:24,height:34,objectFit:"cover",borderRadius:3}}
                onError={e=>{e.target.style.display="none";}}/>
              <span style={{fontSize:12,color:"#818cf8",fontWeight:700,flex:1}}>{linkedAnime.title}</span>
              <button onClick={()=>setLinkedAnime(null)}
                style={{background:"none",border:"none",color:"var(--text-3)",cursor:"pointer",fontSize:14}}>✕</button>
            </div>
          )}
          {/* Poll builder */}
          {poll && (
            <div style={{marginBottom:10,padding:"10px 12px",borderRadius:10,
              background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:800,color:"#c084fc"}}>📊 Sondage</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"var(--text-3)",cursor:"pointer"}}>
                    <input type="checkbox" checked={poll.multi} onChange={e=>setPoll(p=>({...p,multi:e.target.checked}))}/>
                    Choix multiple
                  </label>
                  <button onClick={()=>setPoll(null)}
                    style={{background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:13}}>✕</button>
                </div>
              </div>
              {poll.options.map((opt,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <input value={opt} onChange={e=>{
                    const opts = [...poll.options];
                    opts[i] = e.target.value;
                    setPoll(p=>({...p,options:opts}));
                  }}
                    placeholder={`Option ${i+1}`}
                    maxLength={80}
                    style={{flex:1,padding:"6px 10px",borderRadius:8,
                      background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
                      color:"var(--text-1)",fontSize:12,outline:"none"}}/>
                  {poll.options.length > 2 && (
                    <button onClick={()=>setPoll(p=>({...p,options:p.options.filter((_,j)=>j!==i)}))}
                      style={{background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:12}}>✕</button>
                  )}
                </div>
              ))}
              {poll.options.length < 6 && (
                <button onClick={()=>setPoll(p=>({...p,options:[...p.options,""]}))}
                  style={{fontSize:11,color:"#c084fc",background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontWeight:700}}>
                  + Ajouter une option
                </button>
              )}
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:8,borderTop:"1px solid rgba(var(--fg-rgb),0.06)",paddingTop:10}}>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
            <button onClick={()=>imageInputRef.current?.click()} disabled={imageUploading}
              style={{padding:"5px 10px",borderRadius:8,background:imageUrl?"rgba(129,140,248,0.15)":"rgba(var(--fg-rgb),0.05)",
                border:"1px solid rgba(var(--fg-rgb),0.1)",color:imageUrl?"#818cf8":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {imageUploading ? "⏳" : "🖼"} {imageUploading ? t.imageUploading : imageUrl ? t.imageChange : t.imageAdd}
            </button>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowAnimePicker(p=>!p)}
                style={{padding:"5px 10px",borderRadius:8,background:linkedAnime?"rgba(129,140,248,0.15)":"rgba(var(--fg-rgb),0.05)",
                  border:"1px solid rgba(var(--fg-rgb),0.1)",color:linkedAnime?"#818cf8":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📺 {linkedAnime ? t.animeChange : t.animeLink}
              </button>
              {showAnimePicker && <AnimeSearchPicker onSelect={a=>{setLinkedAnime(a);setShowAnimePicker(false);}} onClose={()=>setShowAnimePicker(false)}/>}
            </div>
            <button onClick={()=>setSpoiler(p=>!p)}
              style={{padding:"5px 10px",borderRadius:8,
                background:spoiler?"rgba(239,68,68,0.15)":"rgba(var(--fg-rgb),0.05)",
                border:`1px solid ${spoiler?"rgba(239,68,68,0.3)":"rgba(var(--fg-rgb),0.1)"}`,
                color:spoiler?"#ef4444":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              ⚠️ {t.spoilerToggle}
            </button>
            <button onClick={()=>!poll && setPoll({options:["",""],multi:false})}
              style={{padding:"5px 10px",borderRadius:8,
                background:poll?"rgba(124,58,237,0.15)":"rgba(var(--fg-rgb),0.05)",
                border:`1px solid ${poll?"rgba(124,58,237,0.3)":"rgba(var(--fg-rgb),0.1)"}`,
                color:poll?"#c084fc":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              📊 Sondage
            </button>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,color:remaining<20?"#ef4444":"var(--text-3)",fontWeight:600}}>{remaining}</span>
              <button onClick={handlePost} disabled={!canPost}
                style={{padding:"7px 16px",borderRadius:10,border:"none",
                  background:canPost?"linear-gradient(135deg,#7c3aed,#4f46e5)":"rgba(var(--fg-rgb),0.05)",
                  color:canPost?"#fff":"var(--text-4)",fontWeight:800,fontSize:13,cursor:canPost?"pointer":"not-allowed"}}>
                {posting ? t.posting : t.post}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── CommentSection ───────────────────────────────────────────────────────────
function CommentSection({ postId, myUsername, profileCache, onOpenUser, onCommentAdded, onLoadProfiles }) {
  const { blockedUsers } = useApp();
  const { lang } = useLang();
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const [commentList, setCommentList] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const mention = useMentionAutocomplete(newComment, myUsername);
  useEffect(() => {
    commentsApi.getForPost(postId).then(rows => {
      setCommentList(rows);
      onLoadProfiles?.((rows||[]).map(c=>c.username));
    }).catch(()=>setCommentList([]));
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync comment likes with other views (e.g. liked from "Mes Posts" in Profile)
  useEffect(() => {
    return addPostEventListener(({ type, id, likes }) => {
      if(type === "commentLike") setCommentList(p => p ? p.map(c => c.id===id ? {...c, likes} : c) : p);
    });
  }, []);

  const visibleComments = blockedUsers?.size ? (commentList||[]).filter(c => !blockedUsers.has(c.username)) : commentList;
  const handleComment = async () => {
    if(!newComment.trim() || posting) return;
    setPosting(true);
    try {
      const c = { post_id: postId, username: myUsername, content: newComment.trim(), likes:[], created_at: new Date().toISOString() };
      const res = await commentsApi.create(c);
      setCommentList(p => [...(p||[]), res?.[0]||c]);
      setNewComment("");
      onCommentAdded?.();
    } catch {}
    setPosting(false);
  };
  const toggleLike = async (id) => {
    const target = commentList.find(c => c.id === id);
    const likes = target?.likes || [];
    const newLikes = likes.includes(myUsername) ? likes.filter(u=>u!==myUsername) : [...likes, myUsername];
    setCommentList(p => p.map(c => c.id===id ? {...c, likes:newLikes} : c));
    await commentsApi.toggleLike(id, myUsername).catch(()=>{});
    dispatchPostEvent("commentLike", { id, likes: newLikes });
  };
  if(!commentList) return <div style={{fontSize:11,color:"var(--text-4)",padding:"8px 0"}}>{t.loading}</div>;
  return (
    <div style={{borderTop:"1px solid rgba(var(--fg-rgb),0.05)",paddingTop:12,marginTop:8}}>
      {visibleComments.map(c => (
        <div key={c.id||c.created_at} style={{display:"flex",gap:8,marginBottom:10}}>
          <Avatar profile={profileCache[c.username]||{avatar:"👤"}} size={26}/>
          <div style={{flex:1}}>
            <div style={{background:"rgba(var(--fg-rgb),0.04)",borderRadius:"0 10px 10px 10px",padding:"7px 10px"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:5,marginBottom:3,flexWrap:"wrap"}}>
                <span onClick={()=>onOpenUser?.(c.username)}
                  style={{fontSize:11,fontWeight:800,cursor:onOpenUser?"pointer":"default",
                    background:"linear-gradient(90deg,#8B5CF6,#EC4899)",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>{profileCache[c.username]?.name||c.username}</span>
                <span onClick={()=>onOpenUser?.(c.username)}
                  style={{fontSize:10,color:"#c084fc",fontWeight:700,cursor:onOpenUser?"pointer":"default"}}>@{c.username}</span>
                <span style={{fontSize:9,color:"var(--text-4)"}}>{timeAgo(c.created_at, lang)}</span>
              </div>
              <p style={{fontSize:12,color:"var(--text-1)",margin:0,lineHeight:1.5}}><MentionText text={c.content} onOpenUser={onOpenUser}/></p>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4,paddingLeft:4}}>
              <button onClick={()=>toggleLike(c.id)}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:(c.likes||[]).includes(myUsername)?"#ef4444":"var(--text-3)",fontWeight:700}}>
                {(c.likes||[]).includes(myUsername) ? "❤️" : "🤍"} {(c.likes||[]).length||""}
              </button>
              {c.username === myUsername && (
                <button onClick={async()=>{await commentsApi.delete(c.id);setCommentList(p=>p.filter(x=>x.id!==c.id));}}
                  style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"var(--text-4)"}}>{t.delete}</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <Avatar profile={profileCache[myUsername]||{avatar:"👤"}} size={26}/>
        <div style={{flex:1,display:"flex",gap:6,position:"relative"}}>
          <input value={newComment} onChange={e=>setNewComment(e.target.value.slice(0,280))}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleComment()}
            placeholder={t.commentPlaceholder}
            style={{flex:1,padding:"7px 12px",borderRadius:20,background:"rgba(var(--fg-rgb),0.05)",
              border:"1px solid rgba(var(--fg-rgb),0.08)",color:"var(--text-1)",fontSize:12,outline:"none"}}/>
          <MentionSuggestions suggestions={mention.suggestions}
            onPick={username => setNewComment(mention.applyMention(newComment, username))}/>
          <button onClick={handleComment} disabled={!newComment.trim()||posting}
            style={{padding:"7px 12px",borderRadius:20,border:"none",
              background:newComment.trim()?"rgba(124,58,237,0.8)":"rgba(var(--fg-rgb),0.05)",
              color:newComment.trim()?"#fff":"var(--text-4)",fontSize:12,fontWeight:700,cursor:newComment.trim()?"pointer":"not-allowed"}}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── PollDisplay ──────────────────────────────────────────────────────────────
function PollDisplay({ postId, myUsername }) {
  const [poll, setPoll] = useState(null);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.query(`polls?post_id=eq.${postId}&limit=1`)
      .then(rows => {
        if(rows?.[0]) {
          setPoll(rows[0]);
          // Check if already voted
          const alreadyVoted = rows[0].options.some(o=>(o.votes||[]).includes(myUsername));
          setVoted(alreadyVoted);
        }
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [postId, myUsername]);

  const vote = async (optionId) => {
    if(!poll || voted) return;
    if(!poll.multi) {
      // Single vote — add username to chosen option
      const newOptions = poll.options.map(o=>
        o.id === optionId ? {...o, votes:[...(o.votes||[]), myUsername]} : o
      );
      const updated = {...poll, options: newOptions};
      setPoll(updated);
      setVoted(true);
      await sb.query(`polls?id=eq.${poll.id}`, {
        method: "PATCH",
        headers: { ...sb.headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ options: newOptions }),
      }).catch(()=>{});
    } else {
      // Multi vote — toggle
      const alreadyVotedThis = poll.options.find(o=>o.id===optionId)?.votes?.includes(myUsername);
      const newOptions = poll.options.map(o=>
        o.id === optionId
          ? {...o, votes: alreadyVotedThis ? (o.votes||[]).filter(u=>u!==myUsername) : [...(o.votes||[]), myUsername]}
          : o
      );
      const updated = {...poll, options: newOptions};
      setPoll(updated);
      // For multi, voted = at least one selected
      const hasVoted = newOptions.some(o=>(o.votes||[]).includes(myUsername));
      setVoted(hasVoted);
      await sb.query(`polls?id=eq.${poll.id}`, {
        method: "PATCH",
        headers: { ...sb.headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ options: newOptions }),
      }).catch(()=>{});
    }
  };

  if(loading || !poll) return null;

  const totalVotes = poll.options.reduce((sum,o)=>sum+(o.votes||[]).length, 0);

  return (
    <div style={{marginBottom:10,borderRadius:10,overflow:"hidden",
      border:"1px solid rgba(124,58,237,0.2)",background:"rgba(124,58,237,0.04)"}}>
      {poll.multi && !voted && (
        <div style={{padding:"6px 12px",fontSize:10,color:"#c084fc",borderBottom:"1px solid rgba(124,58,237,0.1)"}}>
          📊 Choix multiple — vote pour plusieurs options
        </div>
      )}
      {poll.options.map(opt=>{
        const count = (opt.votes||[]).length;
        const pct = totalVotes > 0 ? Math.round(count/totalVotes*100) : 0;
        const myVote = (opt.votes||[]).includes(myUsername);
        return (
          <div key={opt.id} style={{padding:"8px 12px",
            borderBottom:"1px solid rgba(255,255,255,0.04)",position:"relative",overflow:"hidden",
            cursor:voted?"default":"pointer",
            background:myVote?"rgba(124,58,237,0.1)":"transparent"}}
            onClick={()=>!voted && vote(opt.id)}>
            {/* Progress bar — only shown after vote */}
            {voted && (
              <div style={{position:"absolute",inset:0,background:"rgba(124,58,237,0.12)",
                width:`${pct}%`,transition:"width 0.5s ease",pointerEvents:"none"}}/>
            )}
            <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:myVote?"#c084fc":"var(--text-1)",fontWeight:myVote?700:400}}>
                {myVote && "✓ "}{opt.text}
              </span>
              {voted && (
                <span style={{fontSize:11,fontWeight:800,color:"#c084fc"}}>{pct}%</span>
              )}
            </div>
          </div>
        );
      })}
      <div style={{padding:"5px 12px",fontSize:10,color:"var(--text-4)",textAlign:"right"}}>
        {totalVotes} vote{totalVotes!==1?"s":""}
      </div>
    </div>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, myUsername, profileCache, onDelete, onOpenUser, onLoadProfiles }) {
  const { lang } = useLang();
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const [liked, setLiked] = useState((post.likes||[]).includes(myUsername));
  const [likeCount, setLikeCount] = useState((post.likes||[]).length);
  const [showComments, setShowComments] = useState(false);
  const [revealed, setRevealed] = useState(!post.spoiler);
  const [commentCount, setCommentCount] = useState(post.comment_count||0);

  // Re-sync when likes change from elsewhere (e.g. liked from "Mes Posts" in Profile)
  useEffect(() => {
    setLiked((post.likes||[]).includes(myUsername));
    setLikeCount((post.likes||[]).length);
  }, [post.likes, myUsername]);

  const toggleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked); setLikeCount(c => c + (newLiked?1:-1));
    const result = await postsApi.toggleLike(post.id, myUsername);
    const newLikes = result?.[0]?.likes || (newLiked ? [...(post.likes||[]),myUsername] : (post.likes||[]).filter(u=>u!==myUsername));
    dispatchPostEvent("like", { id: post.id, likes: newLikes });
  };

  const handleCommentAdded = () => {
    setCommentCount(c => c + 1);
    // Also persist to DB
    postsApi.patch?.(post.id, { comment_count: commentCount + 1 });
  };

  const profile = profileCache[post.username] || { avatar:"👤" };
  const hasComments = commentCount > 0;

  return (
    <div style={{background:"rgba(var(--fg-rgb),0.03)",borderRadius:16,
      border:`1px solid ${hasComments?"rgba(129,140,248,0.15)":"rgba(var(--fg-rgb),0.06)"}`,
      padding:14,marginBottom:10,animation:"fadeIn 0.2s ease"}}>
      {/* Header */}
      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <div onClick={()=>onOpenUser?.(post.username)} style={{cursor:onOpenUser?"pointer":"default"}}>
          <Avatar profile={profile} size={36}/>
        </div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
            <span onClick={()=>onOpenUser?.(post.username)}
              style={{fontSize:13,fontWeight:800,cursor:onOpenUser?"pointer":"default",
                background:"linear-gradient(90deg,#8B5CF6,#EC4899)",WebkitBackgroundClip:"text",backgroundClip:"text",
                WebkitTextFillColor:"transparent",color:"#EC4899"}}
              onMouseEnter={e=>{if(onOpenUser)e.currentTarget.style.textDecoration="underline";}}
              onMouseLeave={e=>{e.currentTarget.style.textDecoration="none";}}>{profile.name||post.username}</span>
            <span onClick={()=>onOpenUser?.(post.username)}
              style={{fontSize:11,color:"#c084fc",fontWeight:700,cursor:onOpenUser?"pointer":"default"}}>@{post.username}</span>
            <span style={{fontSize:10,color:"var(--text-4)"}}>{timeAgo(post.created_at, lang)}</span>
            {post.spoiler && <span style={{fontSize:9,fontWeight:700,color:"#ef4444",background:"rgba(239,68,68,0.1)",borderRadius:4,padding:"1px 5px"}}>{t.spoilerTag}</span>}
          </div>
          {post.anime_title && (
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
              {post.anime_image && <img src={post.anime_image} alt="" style={{width:16,height:22,objectFit:"cover",borderRadius:2}} onError={e=>{e.target.style.display="none";}}/>}
              <span style={{fontSize:10,color:"#818cf8",fontWeight:600}}>{post.anime_title}</span>
              {(post.anime_season_label||post.anime_season) && <span style={{fontSize:9,color:"var(--text-4)"}}>· {post.anime_season_label||post.anime_season}</span>}
            </div>
          )}
        </div>
        {post.username === myUsername && (
          <button onClick={()=>onDelete(post.id)}
            style={{background:"none",border:"none",color:"var(--text-4)",cursor:"pointer",fontSize:14,alignSelf:"flex-start"}}
            onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
            onMouseLeave={e=>e.currentTarget.style.color="var(--text-4)"}>✕</button>
        )}
      </div>
      {/* Content */}
      {!revealed ? (
        <button onClick={()=>setRevealed(true)}
          style={{width:"100%",padding:"12px",borderRadius:10,background:"rgba(239,68,68,0.08)",
            border:"1px dashed rgba(239,68,68,0.3)",color:"#ef4444",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:10}}>
          {t.spoilerReveal}
        </button>
      ) : (
        <>
          <p style={{fontSize:14,color:"var(--text-1)",lineHeight:1.6,margin:"0 0 10px",whiteSpace:"pre-wrap"}}><MentionText text={post.content} onOpenUser={onOpenUser}/></p>
          {post.image_url && (
            <div style={{borderRadius:10,overflow:"hidden",marginBottom:10,maxHeight:400}}>
              <img src={post.image_url} alt="" style={{width:"100%",objectFit:"cover",maxHeight:400,display:"block",cursor:"pointer"}}
                onClick={()=>window.open(post.image_url,"_blank")}/>
            </div>
          )}
          <PollDisplay postId={post.id} myUsername={myUsername}/>
        </>
      )}
      {/* Genre tags */}
      {post.anime_genres?.length > 0 && (
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          {(post.anime_genres||[]).slice(0,3).map(g=>(
            <span key={g.name||g} style={{fontSize:9,background:"rgba(129,140,248,0.1)",color:"#818cf8",borderRadius:4,padding:"1px 6px",fontWeight:600}}>
              {g.name||g}
            </span>
          ))}
        </div>
      )}
      {/* Actions */}
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <button onClick={toggleLike}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,
            color:liked?"#ef4444":"var(--text-3)",fontSize:12,fontWeight:700,transition:"color 0.15s"}}>
          {liked?"❤️":"🤍"} {likeCount||""}
        </button>
        <button onClick={()=>setShowComments(p=>!p)}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,
            color:showComments?"#818cf8":"var(--text-3)",fontSize:12,fontWeight:700}}>
          <span>💬</span>
          <span>{t.comments}{commentCount > 0 ? ` (${commentCount})` : ""}</span>
          <span style={{fontSize:10}}>{showComments?"▲":"▼"}</span>
        </button>
      </div>
      {showComments && <CommentSection postId={post.id} myUsername={myUsername}
        profileCache={profileCache} onOpenUser={onOpenUser} onCommentAdded={handleCommentAdded} onLoadProfiles={onLoadProfiles}/>}
    </div>
  );
}
// ─── FEED VIEW ────────────────────────────────────────────────────────────────
export function FeedView({ onOpenDetail, onOpenUser }) {
  const { me, myUsername, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = FEED_I18N[lang] || FEED_I18N.fr;
  const [feed, setFeed]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [channel, setChannel]     = useState("general");
  const [profileCache, setProfileCache] = useState({});
  const [offset, setOffset]       = useState(0);
  const [hasMore, setHasMore]     = useState(true);
  const LIMIT = 20;

  // Sync with ProfileView Mes Posts
  useEffect(() => {
    return addPostEventListener(({ type, id, likes }) => {
      if(type === "like") setFeed(f => f.map(p => p.id===id ? {...p, likes} : p));
      if(type === "delete") setFeed(f => f.filter(p => p.id!==id));
    });
  }, []);
  const loadProfiles = async (usernames) => {
    const missing = usernames.filter(u => !profileCache[u]);
    if(!missing.length) return;
    try {
      const rows = await sb.query(`profiles?username=in.(${missing.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`);
      if(rows?.length) {
        const newCache = {};
        rows.forEach(r => { newCache[r.username] = r; });
        setProfileCache(p => ({...p, ...newCache}));
      }
    } catch {}
  };
  const loadFeed = async (reset=false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      let url = `posts?select=*&order=created_at.desc&limit=${LIMIT}&offset=${currentOffset}`;
      if(channel === "following") {
        const followingList = await follows.getFollowing(myUsername).catch(()=>[]);
        followingList.push(myUsername);
        if(followingList.length > 1) {
          url = `posts?select=*&username=in.(${followingList.map(u=>encodeURIComponent(u)).join(",")})&order=created_at.desc&limit=${LIMIT}&offset=${currentOffset}`;
        }
      } else if(channel === "recent") {
        const seasonFilter = RECENT_SEASONS.map(s=>`anime_season_label.eq.${encodeURIComponent(s)}`).join(",");
        url = `posts?select=*&or=(${seasonFilter})&order=created_at.desc&limit=${LIMIT}&offset=${currentOffset}`;
      }
      if(blockedUsers?.size) url += `&username=not.in.(${[...blockedUsers].map(u=>encodeURIComponent(u)).join(",")})`;
      const rows = await sb.query(url);
      const newPosts = rows || [];
      if(reset) { setFeed(newPosts); setOffset(LIMIT); }
      else { setFeed(p => [...p, ...newPosts]); setOffset(currentOffset + LIMIT); }
      setHasMore(newPosts.length === LIMIT);
      await loadProfiles(newPosts.map(p => p.username));
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadFeed(true); }, [channel, blockedUsers]); // eslint-disable-line react-hooks/exhaustive-deps
  const handlePost = (newPost) => { setFeed(p => [newPost, ...p]); };
  const handleDelete = async (id) => {
    await postsApi.delete(id);
    setFeed(f => f.filter(p => p.id !== id));
    dispatchPostEvent("delete", { id });
  };
  const CHANNELS = [
    { id:"general",   label:t.channelGeneral,   emoji:"🌐" },
    { id:"recent",    label:t.channelRecent,    emoji:"✨" },
    { id:"following", label:t.channelFollowing, emoji:"👥" },
  ];
  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 16px 80px"}}>
      <PostComposer onPost={handlePost}/>
      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:"1px solid rgba(var(--fg-rgb),0.06)",paddingBottom:12}}>
        {CHANNELS.map(c => (
          <button key={c.id} onClick={()=>setChannel(c.id)}
            style={{padding:"7px 14px",borderRadius:20,
              border:`1px solid ${channel===c.id?"#7c3aed":"rgba(var(--fg-rgb),0.08)"}`,
              background:channel===c.id?"rgba(124,58,237,0.15)":"rgba(var(--fg-rgb),0.03)",
              color:channel===c.id?"#c084fc":"var(--text-3)",fontSize:12,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",gap:5}}>
            <span>{c.emoji}</span><span>{c.label}</span>
          </button>
        ))}
      </div>
      {channel==="recent" && (
        <div style={{fontSize:10,color:"var(--text-4)",marginBottom:12,textAlign:"center"}}>
          {t.recentSeasonsNote(RECENT_SEASONS.join(", "))}
        </div>
      )}
      {loading && feed.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-4)"}}>
          <div style={{fontSize:32,marginBottom:8}}>🌀</div>
          <p style={{fontSize:12}}>{t.loading}</p>
        </div>
      )}
      {!loading && feed.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-4)"}}>
          <div style={{fontSize:40,marginBottom:12}}>📭</div>
          <p style={{fontWeight:700,color:"var(--text-3)"}}>{t.emptyTitle}</p>
          <p style={{fontSize:12,marginTop:4}}>{t.emptyDesc}</p>
        </div>
      )}
      {feed.map(post => (
        <PostCard key={post.id||post.created_at} post={post} myUsername={myUsername}
          profileCache={profileCache} onDelete={handleDelete} onOpenUser={onOpenUser} onLoadProfiles={loadProfiles}/>
      ))}
      {hasMore && feed.length>0 && (
        <button onClick={()=>loadFeed(false)} disabled={loading}
          style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid rgba(var(--fg-rgb),0.08)",
            background:"rgba(var(--fg-rgb),0.03)",color:"var(--text-3)",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:8}}>
          {loading?t.loading:t.loadMore}
        </button>
      )}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
