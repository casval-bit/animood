import { useState, useEffect, useRef } from "react";
import { sb } from "../api/supabase.js";
import { uploadToCloudinary } from "../api/cloudinary.js";
import { Modal } from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";
import { Avatar } from "./Avatar.jsx";
import { getForumTag, getForumTags, MAX_THREAD_TAGS } from "../constants/forumTags.js";
import { MentionText, useMentionAutocomplete, MentionSuggestions } from "./Mentions.jsx";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { GRADIENT_TEXT } from "../constants/theme.js";
import { FORUM_THREAD_I18N } from "../constants/forumThreadI18n.js";

export function timeAgo(iso, lang = "fr") {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if(lang === "en") {
    if(s < 60) return "just now";
    if(s < 3600) return `${Math.floor(s / 60)} min ago`;
    if(s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }
  if(s < 60) return "à l'instant";
  if(s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if(s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

const INPUT = "w-full rounded-xl border border-white/12 bg-white/7 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400/50";
const SUBMIT_BTN = "rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40";

// ─── Small colored pill for a thread tag — shared between list rows and detail ─
export function TagPill({ id }) {
  const { lang } = useLang();
  const tag = getForumTag(id, lang);
  if(!tag) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold"
      style={{ background: `${tag.color}20`, color: tag.color }}
    >
      {tag.emoji} {tag.label}
    </span>
  );
}

// ─── Create a new discussion — title + body + optional tags ───────────────────
export function NewThreadModal({ username, onClose, onCreated }) {
  const { lang } = useLang();
  const t = FORUM_THREAD_I18N[lang] || FORUM_THREAD_I18N.fr;
  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [tags, setTags]       = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [poll, setPoll] = useState(null); // null or {options:["",""], multi:false}
  const imageInputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState(null);
  const mention = useMentionAutocomplete(body, username);

  const toggleTag = id => {
    setTags(t => t.includes(id) ? t.filter(x => x !== id) : t.length < MAX_THREAD_TAGS ? [...t, id] : t);
  };

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

  const submit = async () => {
    const ttl = title.trim(), b = body.trim();
    if(!ttl || !b) { setError(t.errRequired); return; }
    setSubmitting(true); setError(null);
    try {
      const rows = await sb.createThread(username, ttl, b, tags, imageUrl);
      if(!rows?.[0]) throw new Error("empty response");
      const thread = rows[0];
      // Create poll if set
      if(poll) {
        const validOptions = poll.options.filter(o=>o.trim());
        if(validOptions.length >= 2) {
          await sb.query("polls", {
            method: "POST",
            headers: { ...sb.headers, "Prefer": "return=minimal" },
            body: JSON.stringify({
              thread_id: thread.id,
              options: validOptions.map((text,i)=>({id:String(i+1),text,votes:[]})),
              multi: poll.multi,
            }),
          }).catch(()=>{});
          thread.has_poll = true;
        }
      }
      onCreated(thread);
    } catch {
      setError(t.errCreate);
    } finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5">
        <div className="mb-4 text-sm font-extrabold text-slate-100">{t.newThreadHeader}</div>
        <input
          value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
          placeholder={t.titlePlaceholder} className={`mb-3 ${INPUT}`}
        />
        <div className="relative">
          <textarea
            value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={5}
            placeholder={t.bodyPlaceholder} className={`mb-3 resize-none ${INPUT}`}
          />
          <MentionSuggestions suggestions={mention.suggestions}
            onPick={u => setBody(mention.applyMention(body, u))}/>
        </div>

        {imageUrl && (
          <div className="relative mb-3 max-h-50 overflow-hidden rounded-xl">
            <img src={imageUrl} alt="" className="block max-h-50 w-full object-cover" />
            <button onClick={() => setImageUrl(null)}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white">✕</button>
          </div>
        )}
        {imageError && <div className="mb-3 text-xs text-red-400">{imageError}</div>}

        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        <div className="mb-3 flex gap-2 flex-wrap">
          <button onClick={() => imageInputRef.current?.click()} disabled={imageUploading} type="button"
            className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition"
            style={imageUrl
              ? { borderColor: "rgba(129,140,248,.3)", background: "rgba(129,140,248,.15)", color: "#818cf8" }
              : { borderColor: "rgba(var(--fg-rgb),.1)", background: "rgba(var(--fg-rgb),.05)", color: "var(--text-2)" }}>
            {imageUploading ? t.imageUploading : imageUrl ? t.imageChange : t.imageAdd}
          </button>
          <button onClick={()=>setPoll(p=>p?null:{options:["",""],multi:false})} type="button"
            className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition"
            style={poll
              ? { borderColor: "rgba(124,58,237,.3)", background: "rgba(124,58,237,.15)", color: "#c084fc" }
              : { borderColor: "rgba(var(--fg-rgb),.1)", background: "rgba(var(--fg-rgb),.05)", color: "var(--text-2)" }}>
            📊 {poll ? "Retirer sondage" : "Ajouter un sondage"}
          </button>
        </div>

        {/* Poll builder */}
        {poll && (
          <div className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-violet-400">📊 Sondage</span>
              <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                <input type="checkbox" checked={poll.multi} onChange={e=>setPoll(p=>({...p,multi:e.target.checked}))}/>
                Choix multiple
              </label>
            </div>
            {poll.options.map((opt,i)=>(
              <div key={i} className="mb-2 flex items-center gap-2">
                <input value={opt} onChange={e=>{
                  const opts=[...poll.options]; opts[i]=e.target.value;
                  setPoll(p=>({...p,options:opts}));
                }}
                  placeholder={`Option ${i+1}`} maxLength={80}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-violet-400/40"/>
                {poll.options.length > 2 && (
                  <button onClick={()=>setPoll(p=>({...p,options:p.options.filter((_,j)=>j!==i)}))}
                    className="text-slate-500 hover:text-slate-300 text-xs" type="button">✕</button>
                )}
              </div>
            ))}
            {poll.options.length < 6 && (
              <button onClick={()=>setPoll(p=>({...p,options:[...p.options,""]}))} type="button"
                className="text-[11px] font-bold text-violet-400 hover:text-violet-300">
                + Ajouter une option
              </button>
            )}
          </div>
        )}

        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {t.tagsLabel} <span className="normal-case text-slate-600">{t.tagsHint(MAX_THREAD_TAGS)}</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {getForumTags(lang).map(tag => {
            const active = tags.includes(tag.id);
            return (
              <button
                key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                disabled={!active && tags.length >= MAX_THREAD_TAGS}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-30"
                style={active
                  ? { background: `${tag.color}30`, color: tag.color, boxShadow: `inset 0 0 0 1px ${tag.color}80` }
                  : { background: "rgba(var(--fg-rgb),.06)", color: "var(--text-2)" }}
              >
                {tag.emoji} {tag.label}
              </button>
            );
          })}
        </div>
        {error && <div className="mb-3 text-xs text-red-400">{error}</div>}
        <button onClick={submit} disabled={submitting || imageUploading || !title.trim() || !body.trim()} className={`w-full ${SUBMIT_BTN}`}>
          {submitting ? t.publishing : t.publish}
        </button>
      </div>
    </Modal>
  );
}

// ─── Poll display for forum threads ──────────────────────────────────────────
function ForumPollDisplay({ threadId, username }) {
  const [poll, setPoll] = useState(null);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    sb.query(`polls?thread_id=eq.${threadId}&limit=1`)
      .then(rows => {
        if(rows?.[0]) {
          setPoll(rows[0]);
          setVoted(rows[0].options.some(o=>(o.votes||[]).includes(username)));
        }
      }).catch(()=>{});
  }, [threadId, username]);

  const vote = async (optId) => {
    if(!poll || (voted && !poll.multi)) return;
    const already = poll.options.find(o=>o.id===optId)?.votes?.includes(username);
    const newOptions = poll.options.map(o => {
      if(poll.multi) {
        return o.id===optId
          ? {...o, votes: already ? (o.votes||[]).filter(u=>u!==username) : [...(o.votes||[]), username]}
          : o;
      }
      return o.id===optId ? {...o, votes:[...(o.votes||[]), username]} : o;
    });
    const updated = {...poll, options: newOptions};
    setPoll(updated);
    setVoted(newOptions.some(o=>(o.votes||[]).includes(username)));
    await sb.query(`polls?id=eq.${poll.id}`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=minimal"},
      body:JSON.stringify({options:newOptions}),
    }).catch(()=>{});
  };

  if(!poll) return null;
  const total = poll.options.reduce((s,o)=>s+(o.votes||[]).length, 0);

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/4">
      {poll.multi && !voted && (
        <div className="border-b border-violet-500/10 px-3 py-1.5 text-[10px] text-violet-400">
          📊 Choix multiple
        </div>
      )}
      {poll.options.map(opt => {
        const count = (opt.votes||[]).length;
        const pct = total > 0 ? Math.round(count/total*100) : 0;
        const myVote = (opt.votes||[]).includes(username);
        return (
          <div key={opt.id}
            onClick={()=>!voted || poll.multi ? vote(opt.id) : null}
            className="relative overflow-hidden border-b border-white/4 px-3 py-2.5 last:border-0"
            style={{cursor: voted&&!poll.multi ? "default":"pointer",
              background: myVote ? "rgba(124,58,237,0.12)" : "transparent"}}>
            {voted && (
              <div className="absolute inset-0 bg-violet-500/10 transition-all duration-500"
                style={{width:`${pct}%`}}/>
            )}
            <div className="relative flex items-center justify-between">
              <span className="text-sm" style={{color:myVote?"#c084fc":"var(--text-1)",fontWeight:myVote?700:400}}>
                {myVote && "✓ "}{opt.text}
              </span>
              {voted && <span className="text-[11px] font-bold text-violet-400">{pct}%</span>}
            </div>
          </div>
        );
      })}
      <div className="px-3 py-1.5 text-right text-[10px] text-slate-500">
        {total} vote{total!==1?"s":""}
      </div>
    </div>
  );
}

// ─── Thread detail — body + replies + reply box, no reactions/pagination ──────
export function ThreadModal({ thread, username, onClose, onOpenUser }) {
  const { blockedUsers } = useApp();
  const { lang } = useLang();
  const t = FORUM_THREAD_I18N[lang] || FORUM_THREAD_I18N.fr;
  const [replies, setReplies]   = useState([]);
  const [profileCache, setProfileCache] = useState({});
  const [loading, setLoading]   = useState(true);
  const [reply, setReply]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);
  const mention = useMentionAutocomplete(reply, username);

  useEffect(() => {
    let cancelled = false;
    sb.getThreadReplies(thread.id).then(rows => { if(!cancelled) setReplies(rows); }).finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [thread.id]);

  useEffect(() => {
    let cancelled = false;
    const usernames = [...new Set([thread.username, ...replies.map(r => r.username)])];
    const missing = usernames.filter(u => !profileCache[u]);
    if(!missing.length) return;
    sb.query(`profiles?username=in.(${missing.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`)
      .then(profs => {
        if(cancelled || !profs?.length) return;
        setProfileCache(p => { const c = {...p}; profs.forEach(pr => { c[pr.username] = pr; }); return c; });
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [thread.username, replies]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitReply = async () => {
    const b = reply.trim();
    if(!b) return;
    setSubmitting(true); setError(null);
    try {
      const rows = await sb.createReply(thread.id, username, b);
      if(rows?.[0]) setReplies(r => [...r, rows[0]]);
      setReply("");
    } catch {
      setError(t.errReply);
    } finally { setSubmitting(false); }
  };

  const visibleReplies = blockedUsers?.size ? replies.filter(r => !blockedUsers.has(r.username)) : replies;

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="max-h-[80vh] overflow-y-auto p-5">
        <div className="mb-1.5 flex items-center gap-2">
          <Avatar profile={profileCache[thread.username]} size={22} fallback={thread.username.slice(0,2).toUpperCase()} className="text-[9px]"/>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <span className={GRADIENT_TEXT}>{profileCache[thread.username]?.name || thread.username}</span> · @{thread.username} · {timeAgo(thread.created_at, lang)}
          </div>
        </div>
        <div className="mb-1.5 text-lg font-black text-slate-100">{thread.title}</div>
        {thread.tags?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {thread.tags.map(id => <TagPill key={id} id={id} />)}
          </div>
        )}
        <div className="mb-3 whitespace-pre-wrap text-sm text-slate-300"><MentionText text={thread.body} onOpenUser={onOpenUser}/></div>
        {thread.image_url && (
          <img src={thread.image_url} alt="" className="mb-5 max-h-100 w-full rounded-xl object-cover" />
        )}
        <ForumPollDisplay threadId={thread.id} username={username}/>

        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {t.replyCount(visibleReplies.length)}
        </div>
        {loading ? <Spinner small /> : (
          <div className="mb-5 flex flex-col gap-3">
            {visibleReplies.map(r => (
              <div key={r.id} className="rounded-xl border border-white/7 bg-white/4 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <Avatar profile={profileCache[r.username]} size={18} fallback={r.username.slice(0,2).toUpperCase()} className="text-[8px]"/>
                  <div className="text-[10px] font-bold text-slate-500"><span className={GRADIENT_TEXT}>{profileCache[r.username]?.name || r.username}</span> · @{r.username} · {timeAgo(r.created_at, lang)}</div>
                </div>
                <div className="whitespace-pre-wrap text-[13px] text-slate-200"><MentionText text={r.body} onOpenUser={onOpenUser}/></div>
              </div>
            ))}
            {!visibleReplies.length && <div className="text-xs text-slate-600">{t.noReplies}</div>}
          </div>
        )}

        <div className="relative">
          <textarea
            value={reply} onChange={e => setReply(e.target.value)} maxLength={2000} rows={3}
            placeholder={t.replyPlaceholder} className={`mb-2 resize-none ${INPUT}`}
          />
          <MentionSuggestions suggestions={mention.suggestions}
            onPick={u => setReply(mention.applyMention(reply, u))}/>
        </div>
        {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
        <button onClick={submitReply} disabled={submitting || !reply.trim()} className={SUBMIT_BTN}>
          {submitting ? t.sending : t.reply}
        </button>
      </div>
    </Modal>
  );
}
