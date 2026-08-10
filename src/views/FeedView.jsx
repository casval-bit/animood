import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { sb, posts as postsApi, comments as commentsApi, follows } from "../api/supabase.js";
import { uploadToCloudinary } from "../api/cloudinary.js";
import { jikan } from "../api/jikan.js";
import { MentionText, useMentionAutocomplete, MentionSuggestions } from "../components/Mentions.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if(diff < 60) return "à l'instant";
  if(diff < 3600) return `${Math.floor(diff/60)}min`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  if(diff < 604800) return `${Math.floor(diff/86400)}j`;
  return new Date(ts).toLocaleDateString("fr-FR", {day:"numeric",month:"short"});
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

const RECENT_SEASONS = getLast3Seasons(); // e.g. ["Été 2026","Printemps 2026","Hiver 2026"]
function AnimeSearchPicker({ onSelect, onClose }) {
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
        placeholder="Rechercher un animé…"
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
        border:"none",color:"var(--text-3)",fontSize:11,cursor:"pointer"}}>Annuler</button>
    </div>
  );
}

// ─── PostComposer ─────────────────────────────────────────────────────────────
function PostComposer({ onPost }) {
  const { me, myUsername } = useApp();
  const [content, setContent] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [linkedAnime, setLinkedAnime] = useState(null);
  const [showAnimePicker, setShowAnimePicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const imageInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImageError(null);
    setImageUploading(true);
    try {
      const url = await uploadToCloudinary(file, "post");
      setImageUrl(url);
    } catch(err) {
      setImageError(err.message);
    }
    setImageUploading(false);
    e.target.value = "";
  };

  const profile = { avatar: me.avatar, avatar_base64: me.avatar_base64 };
  const remaining = 280 - content.length;
  const canPost = content.trim().length > 0 && !posting && !imageUploading;
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
        likes: [],
        created_at: new Date().toISOString(),
      };
      const result = await postsApi.create(post);
      setContent(""); setSpoiler(false); setLinkedAnime(null); setImageUrl(null);
      onPost?.(result?.[0] || post);
    } catch(e) { console.error(e); }
    setPosting(false);
  };

  return (
    <div style={{background:"rgba(var(--fg-rgb),0.03)",borderRadius:16,border:"1px solid rgba(var(--fg-rgb),0.07)",padding:14,marginBottom:16}}>
      <div style={{display:"flex",gap:10}}>
        <Avatar profile={profile} size={38}/>
        <div style={{flex:1,position:"relative"}}>
          <textarea value={content} onChange={e=>setContent(e.target.value.slice(0,280))}
            placeholder="Partage ta réaction, ton avis, une recommandation… (@ pour mentionner)"
            style={{width:"100%",boxSizing:"border-box",background:"none",border:"none",
              color:"var(--text-1)",fontSize:14,resize:"none",outline:"none",minHeight:70,
              fontFamily:"inherit",lineHeight:1.5}}/>
          <MentionSuggestions suggestions={mention.suggestions}
            onPick={username => setContent(mention.applyMention(content, username))}/>

          {/* Image preview */}
          {imageUrl && (
            <div style={{position:"relative",marginBottom:8,borderRadius:10,overflow:"hidden",maxHeight:200}}>
              <img src={imageUrl} alt="" style={{width:"100%",objectFit:"cover",maxHeight:200,display:"block"}}/>
              <button onClick={()=>setImageUrl(null)}
                style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.7)",border:"none",
                  color:"#fff",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:12,fontWeight:900}}>✕</button>
            </div>
          )}
          {imageError && <p style={{fontSize:10,color:"#ef4444",marginBottom:6}}>{imageError}</p>}

          {/* Linked anime */}
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

          {/* Actions */}
          <div style={{display:"flex",alignItems:"center",gap:8,borderTop:"1px solid rgba(var(--fg-rgb),0.06)",paddingTop:10}}>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
            <button onClick={()=>imageInputRef.current?.click()} disabled={imageUploading}
              style={{padding:"5px 10px",borderRadius:8,background:imageUrl?"rgba(129,140,248,0.15)":"rgba(var(--fg-rgb),0.05)",
                border:"1px solid rgba(var(--fg-rgb),0.1)",color:imageUrl?"#818cf8":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {imageUploading ? "⏳" : "🖼"} {imageUploading ? "Upload…" : imageUrl ? "Changer" : "Image"}
            </button>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowAnimePicker(p=>!p)}
                style={{padding:"5px 10px",borderRadius:8,background:linkedAnime?"rgba(129,140,248,0.15)":"rgba(var(--fg-rgb),0.05)",
                  border:"1px solid rgba(var(--fg-rgb),0.1)",color:linkedAnime?"#818cf8":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📺 {linkedAnime ? "Changer" : "Lier un animé"}
              </button>
              {showAnimePicker && <AnimeSearchPicker onSelect={a=>{setLinkedAnime(a);setShowAnimePicker(false);}} onClose={()=>setShowAnimePicker(false)}/>}
            </div>
            <button onClick={()=>setSpoiler(p=>!p)}
              style={{padding:"5px 10px",borderRadius:8,
                background:spoiler?"rgba(239,68,68,0.15)":"rgba(var(--fg-rgb),0.05)",
                border:`1px solid ${spoiler?"rgba(239,68,68,0.3)":"rgba(var(--fg-rgb),0.1)"}`,
                color:spoiler?"#ef4444":"var(--text-2)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              ⚠️ Spoiler
            </button>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,color:remaining<20?"#ef4444":"var(--text-3)",fontWeight:600}}>{remaining}</span>
              <button onClick={handlePost} disabled={!canPost}
                style={{padding:"7px 16px",borderRadius:10,border:"none",
                  background:canPost?"linear-gradient(135deg,#7c3aed,#4f46e5)":"rgba(var(--fg-rgb),0.05)",
                  color:canPost?"#fff":"var(--text-4)",fontWeight:800,fontSize:13,cursor:canPost?"pointer":"not-allowed"}}>
                {posting ? "…" : "Poster"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CommentSection ───────────────────────────────────────────────────────────
function CommentSection({ postId, myUsername, profileCache, onOpenUser }) {
  const [commentList, setCommentList] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const mention = useMentionAutocomplete(newComment, myUsername);

  useEffect(() => {
    commentsApi.getForPost(postId).then(setCommentList).catch(()=>setCommentList([]));
  }, [postId]);

  const handleComment = async () => {
    if(!newComment.trim() || posting) return;
    setPosting(true);
    try {
      const c = { post_id: postId, username: myUsername, content: newComment.trim(), likes:[], created_at: new Date().toISOString() };
      const res = await commentsApi.create(c);
      setCommentList(p => [...(p||[]), res?.[0]||c]);
      setNewComment("");
    } catch {}
    setPosting(false);
  };

  const toggleLike = async (id) => {
    await commentsApi.toggleLike(id, myUsername);
    setCommentList(p => p.map(c => {
      if(c.id !== id) return c;
      const likes = c.likes||[];
      return {...c, likes: likes.includes(myUsername) ? likes.filter(u=>u!==myUsername) : [...likes, myUsername]};
    }));
  };

  if(!commentList) return <div style={{fontSize:11,color:"var(--text-4)",padding:"8px 0"}}>Chargement…</div>;

  return (
    <div style={{borderTop:"1px solid rgba(var(--fg-rgb),0.05)",paddingTop:12,marginTop:8}}>
      {commentList.map(c => (
        <div key={c.id||c.created_at} style={{display:"flex",gap:8,marginBottom:10}}>
          <Avatar profile={profileCache[c.username]||{avatar:"👤"}} size={26}/>
          <div style={{flex:1}}>
            <div style={{background:"rgba(var(--fg-rgb),0.04)",borderRadius:"0 10px 10px 10px",padding:"7px 10px"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:3}}>
                <span style={{fontSize:11,fontWeight:800,color:"#c084fc"}}>@{c.username}</span>
                <span style={{fontSize:9,color:"var(--text-4)"}}>{timeAgo(c.created_at)}</span>
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
                  style={{background:"none",border:"none",cursor:"pointer",fontSize:10,color:"var(--text-4)"}}>Supprimer</button>
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
            placeholder="Répondre… (@ pour mentionner)"
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

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, myUsername, profileCache, onDelete, onOpenUser }) {
  const [liked, setLiked] = useState((post.likes||[]).includes(myUsername));
  const [likeCount, setLikeCount] = useState((post.likes||[]).length);
  const [showComments, setShowComments] = useState(false);
  const [revealed, setRevealed] = useState(!post.spoiler);

  const toggleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked); setLikeCount(c => c + (newLiked?1:-1));
    await postsApi.toggleLike(post.id, myUsername);
  };

  const profile = profileCache[post.username] || { avatar:"👤" };

  return (
    <div style={{background:"rgba(var(--fg-rgb),0.03)",borderRadius:16,border:"1px solid rgba(var(--fg-rgb),0.06)",
      padding:14,marginBottom:10,animation:"fadeIn 0.2s ease"}}>

      {/* Header */}
      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <Avatar profile={profile} size={36}/>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:800,color:"#c084fc"}}>@{post.username}</span>
            <span style={{fontSize:10,color:"var(--text-4)"}}>{timeAgo(post.created_at)}</span>
            {post.spoiler && <span style={{fontSize:9,fontWeight:700,color:"#ef4444",background:"rgba(239,68,68,0.1)",borderRadius:4,padding:"1px 5px"}}>SPOILER</span>}
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
          ⚠️ Contenu spoiler — cliquer pour révéler
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
        </>
      )}

      {/* Genre tags from anime */}
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
          style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-3)",fontSize:12,fontWeight:700}}>
          💬 Commenter
        </button>
      </div>

      {showComments && <CommentSection postId={post.id} myUsername={myUsername} profileCache={profileCache} onOpenUser={onOpenUser}/>}
    </div>
  );
}

// ─── FEED VIEW ────────────────────────────────────────────────────────────────
export function FeedView({ onOpenDetail, onOpenUser }) {
  const { me, myUsername } = useApp();
  const [feed, setFeed]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [channel, setChannel]     = useState("general"); // general | recent | following
  const [profileCache, setProfileCache] = useState({});
  const [offset, setOffset]       = useState(0);
  const [hasMore, setHasMore]     = useState(true);
  const LIMIT = 20;

  const loadProfiles = async (usernames) => {
    const missing = usernames.filter(u => !profileCache[u]);
    if(!missing.length) return;
    try {
      const rows = await sb.query(`profiles?username=in.(${missing.map(u=>encodeURIComponent(u)).join(",")})&select=username,avatar,avatar_base64`);
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
        // Filter posts linked to anime from the last 3 seasons
        const seasonFilter = RECENT_SEASONS.map(s=>`anime_season_label.eq.${encodeURIComponent(s)}`).join(",");
        url = `posts?select=*&or=(${seasonFilter})&order=created_at.desc&limit=${LIMIT}&offset=${currentOffset}`;
      }

      const rows = await sb.query(url);
      const newPosts = rows || [];

      if(reset) { setFeed(newPosts); setOffset(LIMIT); }
      else { setFeed(p => [...p, ...newPosts]); setOffset(currentOffset + LIMIT); }
      setHasMore(newPosts.length === LIMIT);
      await loadProfiles(newPosts.map(p => p.username));
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadFeed(true); }, [channel]);

  const handlePost = (newPost) => { setFeed(p => [newPost, ...p]); };
  const handleDelete = async (id) => {
    await postsApi.delete(id);
    setFeed(p => p.filter(post => post.id !== id));
  };

  const CHANNELS = [
    { id:"general",   label:"Général",      emoji:"🌐" },
    { id:"recent",    label:"Récents",       emoji:"✨", desc: RECENT_SEASONS.join(" · ") },
    { id:"following", label:"Abonnements",  emoji:"👥" },
  ];

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 16px 80px"}}>
      {/* Composer */}
      <PostComposer onPost={handlePost}/>

      {/* Channels */}
      <div style={{display:"flex",gap:6,marginBottom:16,borderBottom:"1px solid rgba(var(--fg-rgb),0.06)",paddingBottom:12}}>
        {CHANNELS.map(c => (
          <button key={c.id} onClick={()=>setChannel(c.id)}
            style={{padding:"7px 14px",borderRadius:20,
              border:`1px solid ${channel===c.id?"#7c3aed":"rgba(var(--fg-rgb),0.08)"}`,
              background:channel===c.id?"rgba(124,58,237,0.15)":"rgba(var(--fg-rgb),0.03)",
              color:channel===c.id?"#c084fc":"var(--text-3)",fontSize:12,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",gap:5}}>
            <span>{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Channel description for recent */}
      {channel==="recent" && (
        <div style={{fontSize:10,color:"var(--text-4)",marginBottom:12,textAlign:"center"}}>
          Posts liés aux animés des saisons : {RECENT_SEASONS.join(", ")}
        </div>
      )}

      {/* Posts */}
      {loading && feed.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-4)"}}>
          <div style={{fontSize:32,marginBottom:8}}>🌀</div>
          <p style={{fontSize:12}}>Chargement…</p>
        </div>
      )}
      {!loading && feed.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-4)"}}>
          <div style={{fontSize:40,marginBottom:12}}>📭</div>
          <p style={{fontWeight:700,color:"var(--text-3)"}}>Aucun post</p>
          <p style={{fontSize:12,marginTop:4}}>Sois le premier à poster quelque chose !</p>
        </div>
      )}

      {feed.map(post => (
        <PostCard key={post.id||post.created_at} post={post} myUsername={myUsername}
          profileCache={profileCache} onDelete={handleDelete} onOpenUser={onOpenUser}/>
      ))}

      {hasMore && feed.length>0 && (
        <button onClick={()=>loadFeed(false)} disabled={loading}
          style={{width:"100%",padding:"12px",borderRadius:12,border:"1px solid rgba(var(--fg-rgb),0.08)",
            background:"rgba(var(--fg-rgb),0.03)",color:"var(--text-3)",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:8}}>
          {loading?"Chargement…":"Voir plus"}
        </button>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
