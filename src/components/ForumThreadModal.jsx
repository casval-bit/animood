import { useState, useEffect } from "react";
import { sb } from "../api/supabase.js";
import { Modal } from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";
import { FORUM_TAGS, getForumTag, MAX_THREAD_TAGS } from "../constants/forumTags.js";

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if(s < 60) return "à l'instant";
  if(s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if(s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

const INPUT = "w-full rounded-xl border border-white/12 bg-white/7 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400/50";
const SUBMIT_BTN = "rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40";

// ─── Small colored pill for a thread tag — shared between list rows and detail ─
export function TagPill({ id }) {
  const tag = getForumTag(id);
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
  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [tags, setTags]       = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState(null);

  const toggleTag = id => {
    setTags(t => t.includes(id) ? t.filter(x => x !== id) : t.length < MAX_THREAD_TAGS ? [...t, id] : t);
  };

  const submit = async () => {
    const t = title.trim(), b = body.trim();
    if(!t || !b) { setError("Titre et message obligatoires."); return; }
    setSubmitting(true); setError(null);
    try {
      const rows = await sb.createThread(username, t, b, tags);
      if(rows?.[0]) onCreated(rows[0]);
      else throw new Error("empty response");
    } catch {
      setError("Impossible de publier — le forum n'est peut-être pas encore configuré côté base de données (voir supabase/forum_schema.sql).");
    } finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5">
        <div className="mb-4 text-sm font-extrabold text-slate-100">➕ Nouveau sujet</div>
        <input
          value={title} onChange={e => setTitle(e.target.value)} maxLength={120}
          placeholder="Titre du sujet…" className={`mb-3 ${INPUT}`}
        />
        <textarea
          value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={5}
          placeholder="De quoi veux-tu parler ?" className={`mb-3 resize-none ${INPUT}`}
        />
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Tags <span className="normal-case text-slate-600">(optionnel, {MAX_THREAD_TAGS} max)</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FORUM_TAGS.map(tag => {
            const active = tags.includes(tag.id);
            return (
              <button
                key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                disabled={!active && tags.length >= MAX_THREAD_TAGS}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-30"
                style={active
                  ? { background: `${tag.color}30`, color: tag.color, boxShadow: `inset 0 0 0 1px ${tag.color}80` }
                  : { background: "rgba(255,255,255,.06)", color: "#94a3b8" }}
              >
                {tag.emoji} {tag.label}
              </button>
            );
          })}
        </div>
        {error && <div className="mb-3 text-xs text-red-400">{error}</div>}
        <button onClick={submit} disabled={submitting || !title.trim() || !body.trim()} className={`w-full ${SUBMIT_BTN}`}>
          {submitting ? "Publication…" : "Publier"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Thread detail — body + replies + reply box, no reactions/pagination ──────
export function ThreadModal({ thread, username, onClose }) {
  const [replies, setReplies]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [reply, setReply]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    sb.getThreadReplies(thread.id).then(rows => { if(!cancelled) setReplies(rows); }).finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [thread.id]);

  const submitReply = async () => {
    const b = reply.trim();
    if(!b) return;
    setSubmitting(true); setError(null);
    try {
      const rows = await sb.createReply(thread.id, username, b);
      if(rows?.[0]) setReplies(r => [...r, rows[0]]);
      setReply("");
    } catch {
      setError("Impossible d'envoyer la réponse — le forum n'est peut-être pas encore configuré côté base de données.");
    } finally { setSubmitting(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="max-h-[80vh] overflow-y-auto p-5">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">@{thread.username} · {timeAgo(thread.created_at)}</div>
        <div className="mb-1.5 text-lg font-black text-slate-100">{thread.title}</div>
        {thread.tags?.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {thread.tags.map(id => <TagPill key={id} id={id} />)}
          </div>
        )}
        <div className="mb-5 whitespace-pre-wrap text-sm text-slate-300">{thread.body}</div>

        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {replies.length} réponse{replies.length !== 1 ? "s" : ""}
        </div>
        {loading ? <Spinner small /> : (
          <div className="mb-5 flex flex-col gap-3">
            {replies.map(r => (
              <div key={r.id} className="rounded-xl border border-white/7 bg-white/4 p-3">
                <div className="mb-1 text-[10px] font-bold text-slate-500">@{r.username} · {timeAgo(r.created_at)}</div>
                <div className="whitespace-pre-wrap text-[13px] text-slate-200">{r.body}</div>
              </div>
            ))}
            {!replies.length && <div className="text-xs text-slate-600">Aucune réponse pour l'instant — sois le premier·e.</div>}
          </div>
        )}

        <textarea
          value={reply} onChange={e => setReply(e.target.value)} maxLength={2000} rows={3}
          placeholder="Écrire une réponse…" className={`mb-2 resize-none ${INPUT}`}
        />
        {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
        <button onClick={submitReply} disabled={submitting || !reply.trim()} className={SUBMIT_BTN}>
          {submitting ? "Envoi…" : "Répondre"}
        </button>
      </div>
    </Modal>
  );
}
