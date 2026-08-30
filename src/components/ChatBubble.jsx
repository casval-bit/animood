import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { dm, sb } from "../api/supabase.js";
import { Avatar } from "./Avatar.jsx";
import { timeAgo } from "./ForumThreadModal.jsx";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { CHAT_BUBBLE_I18N } from "../constants/chatBubbleI18n.js";

const INPUT = "flex-1 rounded-full border border-white/12 bg-white/7 px-3.5 py-2 text-[13px] text-slate-100 outline-none focus:border-violet-400/50";

function BubbleIcon({ open }) {
  if(open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// ─── Inline thread — same 1:1 chat as ChatModal, restyled for the compact panel ─
function ThreadPane({ username, peer, onBack }) {
  const { blockedUsers } = useApp();
  const { lang } = useLang();
  const t = CHAT_BUBBLE_I18N[lang] || CHAT_BUBBLE_I18N.fr;
  const isBlocked = blockedUsers?.has(peer);
  const [messages, setMessages] = useState([]);
  const [peerProfile, setPeerProfile] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState("");
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    dm.getThread(username, peer).then(rows => { if(!cancelled) setMessages(rows); }).finally(() => { if(!cancelled) setLoading(false); });
    const interval = setInterval(() => {
      dm.getThread(username, peer).then(rows => { if(!cancelled) setMessages(rows); });
    }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [username, peer]);

  useEffect(() => {
    let cancelled = false;
    sb.query(`profiles?username=eq.${encodeURIComponent(peer)}&select=username,name,avatar,avatar_base64&limit=1`)
      .then(rows => { if(!cancelled && rows?.[0]) setPeerProfile(rows[0]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [peer]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

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
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ background: GRADIENT_PRIMARY }}>
        <button onClick={onBack} className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <Avatar profile={peerProfile} size={26} fallback={peer.slice(0,2).toUpperCase()} className="text-[10px] bg-white/15 text-white"/>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-white">{peerProfile?.name || peer}</div>
          <div className="truncate text-[9.5px] text-white/70">@{peer}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {loading ? (
          <div className="m-auto text-xs text-slate-600">{t.loading}</div>
        ) : messages.length === 0 ? (
          <div className="m-auto text-center text-xs text-slate-600">{t.noMessagesYet}</div>
        ) : messages.map(m => {
          const mine = m.sender === username;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] rounded-2xl px-3 py-1.5 text-[12.5px]"
                style={mine
                  ? { background: GRADIENT_PRIMARY, color: "#fff", borderBottomRightRadius: 4 }
                  : { background: "rgba(var(--fg-rgb),.07)", color: "var(--text-1)", borderBottomLeftRadius: 4 }}
              >
                <div className="whitespace-pre-wrap">{m.body}</div>
                <div className={`mt-0.5 text-[9px] ${mine ? "text-white/60" : "text-slate-500"}`}>{timeAgo(m.created_at, lang)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isBlocked ? (
        <div className="shrink-0 border-t border-white/6 p-3 text-center text-[11px] text-slate-500">
          {t.blockedMessage(peer)}
        </div>
      ) : (
        <div className="flex shrink-0 gap-2 border-t border-white/6 p-2.5">
          <input
            value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000}
            onKeyDown={e => { if(e.key === "Enter" && !sending) send(); }}
            placeholder={t.messagePlaceholder} className={INPUT} autoFocus
          />
          <button
            onClick={send} disabled={sending || !draft.trim()}
            className="shrink-0 rounded-full px-3.5 text-[13px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: GRADIENT_PRIMARY }}
          >
            ↑
          </button>
        </div>
      )}
    </>
  );
}

// ─── Conversation list — compact rows, same data as MessagesView ──────────────
function ConversationList({ conversations, profileCache, loading, myUsername, onOpen }) {
  const { lang } = useLang();
  const t = CHAT_BUBBLE_I18N[lang] || CHAT_BUBBLE_I18N.fr;
  if(loading) return <div className="m-auto text-xs text-slate-600">{t.loading}</div>;
  if(conversations.length === 0) {
    return (
      <div className="m-auto max-w-50 text-center text-[11px] leading-relaxed text-slate-600">
        {t.noConversationsYet}
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map(c => {
        const profile = profileCache[c.peer];
        return (
          <button
            key={c.peer} onClick={() => onOpen(c.peer)}
            className="flex w-full items-center gap-2.5 border-b border-white/6 px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-white/5"
          >
            <Avatar profile={profile} size={36} fallback={c.peer.slice(0,2).toUpperCase()} className="text-[11px]"/>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[12.5px] font-bold ${GRADIENT_TEXT}`}>{profile?.name || c.peer}</div>
              <div className="truncate text-[10px] text-slate-500">@{c.peer}</div>
              <div className="truncate text-[10.5px] text-slate-500">
                {c.lastMessage.sender === myUsername ? t.youPrefix : ""}{c.lastMessage.body}
              </div>
            </div>
            <div className="shrink-0 text-[9.5px] text-slate-600">{timeAgo(c.lastMessage.created_at, lang)}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── New message — search a username and start a fresh thread ─────────────────
function NewMessageSearch({ myUsername, onBack, onSelect }) {
  const { blockedUsers } = useApp();
  const { lang } = useLang();
  const t = CHAT_BUBBLE_I18N[lang] || CHAT_BUBBLE_I18N.fr;
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if(!query) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const enc = encodeURIComponent(query);
    const t = setTimeout(() => {
      sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,avatar_base64&limit=8`)
        .then(rows => setResults((rows||[]).filter(r => r.username !== myUsername && !blockedUsers?.has(r.username))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, myUsername, blockedUsers]);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 py-3" style={{ background: GRADIENT_PRIMARY }}>
        <button onClick={onBack} className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="text-[13px] font-black text-white">{t.newMessageTitle}</div>
      </div>
      <div className="shrink-0 p-3">
        <input
          value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder={t.searchPlaceholder}
          className="w-full rounded-full border border-white/12 bg-white/7 px-3.5 py-2 text-[13px] text-slate-100 outline-none focus:border-violet-400/50"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {searching ? (
          <div className="mt-4 text-center text-xs text-slate-600">{t.searching}</div>
        ) : q.trim() && results.length === 0 ? (
          <div className="mt-4 text-center text-xs text-slate-600">{t.noMemberFound}</div>
        ) : (
          results.map(r => (
            <button
              key={r.username} onClick={() => onSelect(r.username)}
              className="flex w-full items-center gap-2.5 border-b border-white/6 px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-white/5"
            >
              <Avatar profile={r} size={36} fallback={r.username.slice(0,2).toUpperCase()} className="text-[11px]"/>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[12.5px] font-bold ${GRADIENT_TEXT}`}>{r.name || r.username}</div>
                <div className="truncate text-[10.5px] text-slate-500">@{r.username}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

// ─── Floating chat bubble — quick access to DMs from anywhere but Messages ─────
export function ChatBubble({ hidden }) {
  const { myUsername, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = CHAT_BUBBLE_I18N[lang] || CHAT_BUBBLE_I18N.fr;
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [profileCache, setProfileCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [peer, setPeer] = useState(null);
  const [newChat, setNewChat] = useState(false);

  useEffect(() => {
    if(!open) return;
    let cancelled = false;
    setLoading(true);
    dm.listConversations(myUsername).then(async rows => {
      if(cancelled) return;
      const filtered = blockedUsers?.size ? rows.filter(c => !blockedUsers.has(c.peer)) : rows;
      setConversations(filtered);
      const peers = filtered.map(c => c.peer);
      if(peers.length) {
        try {
          const profs = await sb.query(`profiles?username=in.(${peers.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`);
          if(!cancelled && profs?.length) {
            const cache = {};
            profs.forEach(p => { cache[p.username] = p; });
            setProfileCache(cache);
          }
        } catch {}
      }
    }).finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, myUsername, blockedUsers]);

  const startChat = (username) => { setNewChat(false); setPeer(username); };

  if(hidden) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          className="flex h-[26rem] w-80 flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl animate-slide-up"
          style={{ background: "var(--surface-1-strong)", backdropFilter: "blur(20px)" }}
        >
          {peer ? (
            <ThreadPane username={myUsername} peer={peer} onBack={() => setPeer(null)} />
          ) : newChat ? (
            <NewMessageSearch myUsername={myUsername} onBack={() => setNewChat(false)} onSelect={startChat} />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ background: GRADIENT_PRIMARY }}>
                <div className="text-[13px] font-black text-white">{t.messagesTitle}</div>
                <button onClick={() => setNewChat(true)} title={t.newMessageTooltip}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              <ConversationList conversations={conversations} profileCache={profileCache} loading={loading} myUsername={myUsername} onOpen={setPeer} />
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        title={t.messagesTooltip}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition hover:scale-105"
        style={{ background: GRADIENT_PRIMARY, boxShadow: "0 10px 30px rgba(109,91,255,.5)" }}
      >
        <BubbleIcon open={open} />
      </button>
    </div>
  );
}
