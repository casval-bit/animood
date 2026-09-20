import { useState, useEffect, useRef } from "react";
import { dm, sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { Modal } from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";
import { Avatar } from "./Avatar.jsx";
import { timeAgo } from "./ForumThreadModal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";
import { CHAT_MODAL_I18N } from "../constants/chatModalI18n.js";

const INPUT = "flex-1 rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400/50";

// ─── 1:1 chat with a friend — message bubbles + send box, polls while open ────
export function ChatModal({ username, peer, onClose }) {
  const { markRead, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = CHAT_MODAL_I18N[lang] || CHAT_MODAL_I18N.fr;
  const isBlocked = blockedUsers?.has(peer);
  const [messages, setMessages]     = useState([]);
  const [peerProfile, setPeerProfile] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [draft, setDraft]           = useState("");
  const [sending, setSending]       = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    sb.query(`profiles?username=eq.${encodeURIComponent(peer)}&select=username,name,avatar,avatar_base64&limit=1`)
      .then(rows => { if(!cancelled && rows?.[0]) setPeerProfile(rows[0]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [peer]);

  useEffect(() => {
    let cancelled = false;
    const fetchThread = () => dm.getThread(username, peer).then(rows => {
      if(cancelled) return;
      setMessages(rows);
      markRead(peer);
    });
    fetchThread().finally(() => { if(!cancelled) setLoading(false); });
    const interval = setInterval(fetchThread, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [username, peer, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const b = draft.trim();
    if(!b) return;
    setSending(true);
    try {
      const rows = await dm.sendMessage(username, peer, b);
      if(rows?.[0]) setMessages(m => [...m, rows[0]]);
      setDraft("");
    } finally { setSending(false); }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" bodyClassName="flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-3" style={{ background: GRADIENT_PRIMARY }}>
        <Avatar profile={peerProfile} size={32} fallback={peer.slice(0,2).toUpperCase()} className="text-xs bg-white/15 text-white"/>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-white">{peerProfile?.name || peer}</div>
          <div className="truncate text-[10.5px] text-white/70">@{peer}</div>
        </div>
      </div>

      <div className="flex max-h-[55vh] min-h-[40vh] flex-col gap-2 overflow-y-auto p-4">
        {loading ? <Spinner small label={t.loading} /> : messages.length === 0 ? (
          <div className="m-auto text-center text-xs text-slate-600">{t.noMessagesYet}</div>
        ) : messages.map(m => {
          const mine = m.sender === username;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[75%] rounded-2xl px-3.5 py-2 text-[13px]"
                style={mine
                  ? { background: GRADIENT_PRIMARY, color: "#fff", borderBottomRightRadius: 4 }
                  : { background: "rgba(var(--fg-rgb),.07)", color: "var(--text-1)", borderBottomLeftRadius: 4 }}
              >
                <div className="whitespace-pre-wrap">{m.body}</div>
                <div className={`mt-1 text-[9.5px] ${mine ? "text-white/60" : "text-slate-500"}`}>{timeAgo(m.created_at, lang)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isBlocked ? (
        <div className="border-t border-white/6 p-4 text-center text-xs text-slate-500">
          {t.blockedMessage(peer)}
        </div>
      ) : (
        <div className="flex gap-2 border-t border-white/6 p-3">
          <input
            value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000}
            onKeyDown={e => { if(e.key === "Enter" && !sending) send(); }}
            placeholder={t.messagePlaceholder} className={INPUT}
          />
          <button
            onClick={send} disabled={sending || !draft.trim()}
            className="shrink-0 rounded-full px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: GRADIENT_PRIMARY }}
          >
            {sending ? t.sending : t.sendBtn}
          </button>
        </div>
      )}
    </Modal>
  );
}
