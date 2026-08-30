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
      if(rows?.[0]) onCreated(rows[0]);
      else throw new Error("empty response");
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
        <button onClick={() => imageInputRef.current?.click()} disabled={imageUploading} type="button"
          className="mb-3 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition"
          style={imageUrl
            ? { borderColor: "rgba(129,140,248,.3)", background: "rgba(129,140,248,.15)", color: "#818cf8" }
            : { borderColor: "rgba(var(--fg-rgb),.1)", background: "rgba(var(--fg-rgb),.05)", color: "var(--text-2)" }}>
          {imageUploading ? t.imageUploading : imageUrl ? t.imageChange : t.imageAdd}
        </button>

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
