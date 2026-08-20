import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { dm } from "../api/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { ChatModal } from "../components/ChatModal.jsx";
import { NewMessageModal } from "../components/NewMessageModal.jsx";
import { timeAgo } from "../components/ForumThreadModal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY } from "../constants/theme.js";

export function MessagesView() {
  const { myUsername, unreadPeers, markRead } = useApp();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [openPeer, setOpenPeer] = useState(null);
  const [newChat, setNewChat]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    dm.listConversations(myUsername).then(rows => { if(!cancelled) setConversations(rows); }).finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [myUsername]);

  const startChat = (username) => { setNewChat(false); setOpenPeer(username); };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8 flex animate-slide-up items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[28px] font-bold tracking-tight text-slate-50 md:text-[32px]">✉️ Messages</h1>
          <p className="text-sm text-slate-500">Tes conversations privées avec les autres membres.</p>
        </div>
        <button
          onClick={() => setNewChat(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-bold text-white transition hover:-translate-y-0.5"
          style={{ background: GRADIENT_PRIMARY, boxShadow: "0 8px 24px rgba(109,91,255,.35)" }}
        >
          ✏️ Nouveau
        </button>
      </div>

      {loading ? <Spinner label="Chargement…" /> : conversations.length === 0 ? (
        <EmptyState
          emoji="✉️" title="Aucune conversation pour l'instant"
          subtitle="Clique sur « Nouveau » ci-dessus, ou va sur le profil d'un membre (via Search) et clique sur « Message »."
        />
      ) : (
        <div className={`overflow-hidden ${GLASS}`} style={GLASS_STYLE}>
          <div className="px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
            <div className="text-[13px] font-black uppercase tracking-wide text-white">💬 Conversations</div>
          </div>
          <div>
            {conversations.map(c => {
              const unread = unreadPeers?.has(c.peer);
              return (
                <button
                  key={c.peer} onClick={() => { setOpenPeer(c.peer); markRead(c.peer); }}
                  className="flex w-full items-center gap-3 border-b border-white/6 px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-sm font-black text-slate-300">
                    {c.peer.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-slate-100">@{c.peer}</div>
                    <div className={`truncate text-[11px] ${unread ? "font-semibold text-slate-200" : "text-slate-500"}`}>
                      {c.lastMessage.sender === myUsername ? "Toi: " : ""}{c.lastMessage.body}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="text-[10px] text-slate-600">{timeAgo(c.lastMessage.created_at)}</div>
                    {unread && <span className="h-2 w-2 rounded-full" style={{ background: "#f43f5e" }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {openPeer && <ChatModal username={myUsername} peer={openPeer} onClose={() => setOpenPeer(null)} />}
      {newChat && <NewMessageModal myUsername={myUsername} onClose={() => setNewChat(false)} onSelect={startChat} />}
    </div>
  );
}
