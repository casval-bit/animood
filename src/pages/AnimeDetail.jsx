import { useState, useEffect, useRef } from "react";
import { useApp, MOODS, MOOD_KEYS, STATUS_COLORS, STREAMING_COLORS, getMoodObj } from "../constants.js";
import { jikan, apiCache } from "../api/jikan.js";
import { ptsStore, communityStore, getPtsForAnime, addUserVote, ptsToPct, getCombinedPts } from "../api/moods.js";
import { saveProfile } from "../api/supabase.js";
import { Spinner, StarRating, MoodOctagon } from "../components/ui.jsx";

// ─── PERSON SHEET ─────────────────────────────────────────────────────────────
function PersonSheet({personId,onClose,onOpenDetail}) {
  const [visible,setVisible]=useState(false);
  const [data,setData]=useState(null);
  const [animes,setAnimes]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!personId) return;
    (async()=>{
      try {
        const [person,voices,animeRoles]=await Promise.all([jikan.getPerson(personId),jikan.getPersonVoices(personId),jikan.getPersonAnime(personId)]);
        setData(person.data);
        const map={};
        ;(animeRoles.data||[]).forEach(a=>{const id=a.anime?.mal_id;if(id)map[id]={mal_id:id,title:a.anime?.title,img:a.anime?.images?.jpg?.image_url,role:a.position};});
        ;(voices.data||[]).forEach(v=>{const id=v.anime?.mal_id;if(id&&!map[id])map[id]={mal_id:id,title:v.anime?.title,img:v.anime?.images?.jpg?.image_url,role:`VA · ${v.character?.name}`};});
        setAnimes(Object.values(map).slice(0,24));
      } catch(e){console.error(e);}
      finally{setLoading(false);}
    })();
  },[personId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:400,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
        {loading&&<Spinner label="Chargement…"/>}
        {data&&(
          <div style={{padding:"16px"}}>
            <div style={{display:"flex",gap:"14px",alignItems:"center",marginBottom:"16px"}}>
              <img src={data.images?.jpg?.image_url} alt={data.name} style={{width:"64px",height:"64px",borderRadius:"50%",objectFit:"cover",border:"2px solid rgba(255,255,255,0.1)"}} onError={e=>{e.target.src="https://placehold.co/64x64/1a1a2e/818cf8?text=?";}}/>
              <div>
                <div style={{fontSize:"16px",fontWeight:900,color:"#f3f4f6"}}>{data.name}</div>
                {data.name_kanji&&<div style={{fontSize:"12px",color:"#6b7280"}}>{data.name_kanji}</div>}
                {data.favorites&&<div style={{fontSize:"11px",color:"#4b5563",marginTop:"2px"}}>❤️ {data.favorites.toLocaleString()} favoris</div>}
              </div>
            </div>
            {data.about&&<p style={{fontSize:"11px",color:"#6b7280",lineHeight:1.6,marginBottom:"16px"}}>{data.about.slice(0,300)}…</p>}
            <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"10px"}}>Animés ({animes.length})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px"}}>
              {animes.map(a=>(
                <div key={a.mal_id} onClick={()=>{close();setTimeout(()=>onOpenDetail(a),300);}} style={{cursor:"pointer"}}>
                  <div style={{aspectRatio:"2/3",borderRadius:"8px",overflow:"hidden",marginBottom:"4px"}}>
                    <img src={a.img||"https://placehold.co/80x120/1a1a2e/818cf8?text=?"} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/80x120/1a1a2e/818cf8?text=?";}}/>
                  </div>
                  <div style={{fontSize:"8px",color:"#9ca3af",lineHeight:1.2,textAlign:"center"}}>{a.title?.slice(0,20)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STUDIO SHEET ─────────────────────────────────────────────────────────────
function StudioSheet({studioId,studioName,onClose,onOpenDetail}) {
  const [visible,setVisible]=useState(false);
  const [animes,setAnimes]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!studioId) return;
    jikan.getProducerAnime(studioId).then(r=>setAnimes(r.data||[])).catch(console.error).finally(()=>setLoading(false));
  },[studioId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  return (
    <div onClick={close} style={{position:"absolute",inset:0,zIndex:400,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"88vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
        <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
        <div style={{padding:"16px"}}>
          <div style={{fontSize:"18px",fontWeight:900,color:"#f3f4f6",marginBottom:"4px"}}>🎬 {studioName}</div>
          <div style={{fontSize:"11px",color:"#6b7280",marginBottom:"16px"}}>Animés triés par score MAL</div>
          {loading&&<Spinner/>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"9px"}}>
            {animes.map(a=>(
              <div key={a.mal_id} onClick={()=>{close();setTimeout(()=>onOpenDetail(a),300);}} style={{cursor:"pointer"}}>
                <div style={{aspectRatio:"2/3",borderRadius:"10px",overflow:"hidden",marginBottom:"4px",position:"relative"}}>
                  <img src={a.images?.jpg?.large_image_url||a.images?.jpg?.image_url} alt={a.title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/100x150/1a1a2e/818cf8?text=?";}}/>
                  {a.score&&<div style={{position:"absolute",bottom:"4px",right:"4px",background:"rgba(0,0,0,0.8)",borderRadius:"4px",padding:"1px 4px",fontSize:"9px",fontWeight:800,color:"#fbbf24"}}>★{a.score}</div>}
                </div>
                <div style={{fontSize:"9px",color:"#9ca3af",lineHeight:1.3,textAlign:"center"}}>{a.title?.slice(0,24)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ANIME DETAIL ─────────────────────────────────────────────────────────────
function AnimeDetail({malId,seedData,onClose}) {
  const {me,setMe}=useApp();
  const [visible,setVisible]=useState(false);
  const [anime,setAnime]=useState(null);
  const [staff,setStaff]=useState([]);
  const [characters,setCharacters]=useState([]);
  const [animePts,setAnimePts]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [rating,setRating]=useState(me.ratings[malId]?.score??null);
  const [selMoods,setSelMoods]=useState(()=>{
    const prevVote = ptsStore[`${malId}_vote`];
    return prevVote?.moods || me.ratings[malId]?.moods || [];
  });
  const [personSheet,setPersonSheet]=useState(null);
  const [studioSheet,setStudioSheet]=useState(null);

  const isWatched=me.watched.includes(malId);
  const a=anime||seedData;

  useEffect(()=>{requestAnimationFrame(()=>setVisible(true));},[]);
  useEffect(()=>{
    if(!malId) return;
    (async()=>{
      try {
        const [ad, sd, cd] = await Promise.all([
          jikan.getAnime(malId),
          jikan.getStaff(malId),
          jikan.getCharacters(malId),
        ]);
        setAnime(ad.data);
        // If from Supabase cache, staff/chars already in ad.data
        const staffList = ad.data?._fromCache && ad.data.staff?.length
          ? ad.data.staff.map(s => ({ person: { mal_id:s.mal_id, name:s.name, images:{jpg:{image_url:s.image}} }, positions: s.positions }))
          : (sd.data || []);
        const charsList = ad.data?._fromCache && ad.data.characters?.length
          ? ad.data.characters.map(c => ({ character:{mal_id:c.mal_id,name:c.name,images:{jpg:{image_url:c.image}}}, role:c.role, voice_actors: c.va ? [{language:"Japanese",person:{mal_id:c.va.mal_id,name:c.va.name,images:{jpg:{image_url:c.va.image}}}}] : [] }))
          : (cd.data || []);
        setStaff(staffList.slice(0,10));
        setCharacters(charsList.slice(0,8));
        setLoading(false);

        // Show octagon immediately with cached or genre-based pts
        if(ptsStore[ad.data.mal_id]) {
          // Already cached — instant
          setAnimePts(ptsStore[ad.data.mal_id]);
        } else {
          // Show genre fallback immediately, then replace with Claude result
          const fallback = pctToPoints(genresToPct(ad.data.genres||[]));
          setAnimePts(fallback);
          // Claude tags in background — replaces fallback when done
          getPtsForAnime(ad.data).then(pts => setAnimePts(pts)).catch(()=>{});
        }
      } catch(e){ setError(e.message); setLoading(false); }
    })();
  },[malId]);

  const close=()=>{setVisible(false);setTimeout(onClose,280);};
  const save=async()=>{
    if(!rating) return;
    if(selMoods.length>0 && animePts) {
      const newPts = await addUserVote("brice", malId, selMoods);
      setAnimePts(newPts);
    }
    const updated={...me,watched:me.watched.includes(malId)?me.watched:[...me.watched,malId],ratings:{...me.ratings,[malId]:{score:rating,moods:selMoods}}};
    setMe(updated); saveProfile("brice",updated);
  };

  const img=a?.images?.jpg?.large_image_url||a?.img||"https://placehold.co/400x180/1a1a2e/818cf8?text=?";
  const title=a?.title||"—";
  const synopsis=a?.synopsis;
  const year=a?.year||a?.aired?.prop?.from?.year;
  const eps=a?.episodes; const type=a?.type; const score=a?.score;
  const genres=a?.genres?.map(g=>g.name||g)||[];
  const studios=a?.studios||[];
  const streaming=a?.streaming||seedData?.streaming||[];
  const trailer=a?.trailer?.url;

  return (
    <>
      <div onClick={close} style={{position:"absolute",inset:0,zIndex:300,background:visible?"rgba(0,0,0,0.85)":"rgba(0,0,0,0)",backdropFilter:visible?"blur(10px)":"none",transition:"all 0.28s",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#161226 0%,#0d0b18 100%)",borderRadius:"24px 24px 0 0",border:"1px solid rgba(255,255,255,0.09)",maxHeight:"92vh",overflowY:"auto",paddingBottom:"30px",transform:visible?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
          <div style={{width:"36px",height:"4px",borderRadius:"2px",background:"rgba(255,255,255,0.15)",margin:"12px auto 0"}}/>
          <div style={{position:"relative",height:"180px",margin:"14px 14px 0",borderRadius:"16px",overflow:"hidden"}}>
            <img src={img} alt={title} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/400x180/1a1a2e/818cf8?text=?";}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(0deg,rgba(13,11,24,0.96) 0%,rgba(0,0,0,0.1) 60%)"}}/>
            <div style={{position:"absolute",bottom:"12px",left:"12px",right:"50px"}}>
              <div style={{fontSize:"15px",fontWeight:900,color:"#fff",lineHeight:1.3,marginBottom:"5px"}}>{title}</div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
                {type&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{type}</span>}
                {eps&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{eps} eps</span>}
                {year&&<span style={{fontSize:"10px",background:"rgba(255,255,255,0.1)",color:"#9ca3af",borderRadius:"5px",padding:"2px 6px"}}>{year}</span>}
                {me.ratings[malId]&&<span style={{fontSize:"10px",background:"rgba(251,191,36,0.15)",color:"#fbbf24",borderRadius:"5px",padding:"2px 6px"}}>Ma note : {me.ratings[malId].score}/10</span>}
              </div>
            </div>
            {score&&<div style={{position:"absolute",top:"10px",right:"10px",background:"rgba(0,0,0,0.75)",borderRadius:"8px",padding:"4px 8px",fontSize:"13px",fontWeight:800,color:"#fbbf24"}}>★ {score}</div>}
          </div>

          <div style={{padding:"14px 14px 0"}}>
            {loading&&<Spinner small label="Chargement…"/>}
            {studios.length>0&&<div style={{marginBottom:"10px",display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {studios.map(s=><button key={s.mal_id} onClick={()=>setStudioSheet({id:s.mal_id,name:s.name})} style={{background:"rgba(129,140,248,0.1)",border:"1px solid rgba(129,140,248,0.25)",color:"#818cf8",borderRadius:"8px",padding:"4px 10px",fontSize:"11px",fontWeight:700,cursor:"pointer"}}>🎬 {s.name}</button>)}
            </div>}
            <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"12px"}}>
              {genres.map(g=><span key={g} style={{fontSize:"11px",background:"rgba(129,140,248,0.12)",color:"#818cf8",borderRadius:"6px",padding:"3px 8px",fontWeight:600}}>{g}</span>)}
            </div>

            {/* OCTAGON — only here, above synopsis */}
            {animePts && <MoodOctagon pts={animePts}/>}

            {synopsis&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"6px"}}>Synopsis</div><p style={{fontSize:"12px",color:"#9ca3af",lineHeight:1.6,margin:0}}>{synopsis.length>280?synopsis.slice(0,280)+"…":synopsis}</p></div>}
            {streaming.length>0&&<div style={{marginBottom:"12px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"7px"}}>Disponible sur</div><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{streaming.map(s=>{const name=s.name||s;return<span key={name} style={{fontSize:"11px",fontWeight:800,color:"#fff",background:STREAMING_COLORS[name]||"#444",borderRadius:"6px",padding:"4px 10px"}}>{name}</span>;})}</div></div>}
            {staff.length>0&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Staff</div><div style={{display:"flex",flexDirection:"column",gap:"6px"}}>{staff.slice(0,6).map((s,i)=><button key={i} onClick={()=>setPersonSheet(s.person?.mal_id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"8px",padding:"7px 10px",cursor:"pointer",width:"100%",textAlign:"left"}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><img src={s.person?.images?.jpg?.image_url} alt={s.person?.name} style={{width:"28px",height:"28px",borderRadius:"50%",objectFit:"cover"}} onError={e=>{e.target.src="https://placehold.co/28x28/1a1a2e/818cf8?text=?";}}/>  <span style={{fontSize:"12px",color:"#e5e7eb",fontWeight:600}}>{s.person?.name}</span></div><span style={{fontSize:"10px",color:"#6b7280"}}>{s.positions?.slice(0,1).join(", ")}</span></button>)}</div></div>}
            {characters.length>0&&<div style={{marginBottom:"14px"}}><div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Personnages & Seiyuu</div><div style={{display:"flex",gap:"10px",overflowX:"auto",paddingBottom:"4px"}}>{characters.slice(0,6).map((c,i)=>{const va=c.voice_actors?.find(v=>v.language==="Japanese");return(<div key={i} style={{flexShrink:0,width:"68px",textAlign:"center"}}><img src={c.character?.images?.jpg?.image_url} alt={c.character?.name} style={{width:"52px",height:"52px",borderRadius:"50%",objectFit:"cover",marginBottom:"3px",border:"2px solid rgba(255,255,255,0.1)"}} onError={e=>{e.target.src="https://placehold.co/52x52/1a1a2e/818cf8?text=?";}}/>  <div style={{fontSize:"8px",color:"#9ca3af",lineHeight:1.2,marginBottom:"3px"}}>{c.character?.name?.split(" ").slice(-1)[0]}</div>{va&&<button onClick={()=>setPersonSheet(va.person?.mal_id)} style={{background:"none",border:"none",cursor:"pointer",padding:0}}><img src={va.person?.images?.jpg?.image_url} alt={va.person?.name} style={{width:"36px",height:"36px",borderRadius:"50%",objectFit:"cover",border:"2px solid rgba(192,132,252,0.4)"}} onError={e=>{e.target.src="https://placehold.co/36x36/1a1a2e/c084fc?text=?";}}/>  <div style={{fontSize:"7px",color:"#c084fc",marginTop:"2px"}}>{va.person?.name?.split(",")[0]?.slice(0,12)}</div></button>}</div>);})}</div></div>}
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"14px",padding:"13px",marginBottom:"12px"}}>
              <div style={{fontSize:"10px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"9px"}}>Ma note</div>
              <StarRating value={rating} onChange={setRating}/>
              <div style={{fontSize:"10px",color:"#6b7280",margin:"8px 0 7px"}}>Ton ressenti (max 3 moods) :</div>
              <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"11px"}}>{MOODS.map(m=>{const sel=selMoods.includes(m.id);return<button key={m.id} onClick={()=>setSelMoods(p=>p.includes(m.id)?p.filter(x=>x!==m.id):p.length<3?[...p,m.id]:p)} style={{border:sel?`1px solid ${m.color}`:"1px solid rgba(255,255,255,0.1)",background:sel?`${m.color}18`:"transparent",color:sel?m.color:"#6b7280",borderRadius:"20px",padding:"3px 8px",fontSize:"10px",fontWeight:700,cursor:"pointer",transition:"all 0.15s"}}>{m.emoji} {m.label}</button>;})}</div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={save} disabled={!rating} style={{flex:1,padding:"10px",borderRadius:"10px",border:"none",background:rating?"linear-gradient(135deg,#7c3aed,#4f46e5)":"rgba(255,255,255,0.05)",color:rating?"#fff":"#374151",fontWeight:700,fontSize:"13px",cursor:rating?"pointer":"not-allowed"}}>Sauvegarder</button>
                <button onClick={()=>{const updated={...me,watched:isWatched?me.watched.filter(id=>id!==malId):[...me.watched,malId]};setMe(updated);saveProfile("brice",updated);}} style={{padding:"10px 12px",borderRadius:"10px",border:isWatched?"1px solid #34D399":"1px solid rgba(255,255,255,0.1)",background:isWatched?"rgba(52,211,153,0.1)":"transparent",color:isWatched?"#34D399":"#6b7280",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>{isWatched?"✓ Vu":"Marquer vu"}</button>
                {/* Watchlist button */}
                {(()=>{
                  const isOnWatchlist = (me.statuses||{})[malId] === "watchlist";
                  return (
                    <button onClick={()=>{
                      const newStatus = isOnWatchlist ? undefined : "watchlist";
                      const newStatuses = {...(me.statuses||{})};
                      if(newStatus) newStatuses[malId] = newStatus;
                      else delete newStatuses[malId];
                      const updated = {...me, statuses:newStatuses};
                      setMe(updated); saveProfile("brice",updated);
                    }} title={isOnWatchlist?"Retirer de la watchlist":"Ajouter à la watchlist"}
                      style={{padding:"10px 12px",borderRadius:"10px",
                        border:isOnWatchlist?"1px solid #9ca3af":"1px solid rgba(255,255,255,0.1)",
                        background:isOnWatchlist?"rgba(156,163,175,0.15)":"transparent",
                        color:isOnWatchlist?"#9ca3af":"#6b7280",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
                      🎯
                    </button>
                  );
                })()}
              </div>
            </div>
            {trailer&&<a href={trailer} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",color:"#9ca3af",textDecoration:"none",fontSize:"13px",fontWeight:700}}>▶ Voir le trailer</a>}
            {error&&<div style={{textAlign:"center",padding:"12px",color:"#ef4444",fontSize:"11px"}}>Erreur: {error}</div>}
          </div>
        </div>
      </div>
      {personSheet&&<PersonSheet personId={personSheet} onClose={()=>setPersonSheet(null)} onOpenDetail={a=>{setPersonSheet(null);}}/>}
      {studioSheet&&<StudioSheet studioId={studioSheet.id} studioName={studioSheet.name} onClose={()=>setStudioSheet(null)} onOpenDetail={a=>{setStudioSheet(null);}}/>}
    </>
  );
}

// ─── RESULTS OVERLAY ─────────────────────────────────────────────────────────

export { AnimeDetail, PersonSheet, StudioSheet };
