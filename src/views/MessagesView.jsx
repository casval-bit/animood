import { useState, useEffect } from "react";
import { useApp } from "../context/useApp.js";
import { dm, sb } from "../api/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Avatar } from "../components/Avatar.jsx";
import { ChatModal } from "../components/ChatModal.jsx";
import { NewMessageModal } from "../components/NewMessageModal.jsx";
import { timeAgo } from "../components/ForumThreadModal.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_PRIMARY } from "../constants/theme.js";

export function MessagesView() {
  const { myUsername, unreadPeers, markRead, blockedUsers } = useApp();
  const [conversations, setConversations] = useState([]);
  const [profileCache, setProfileCache]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [openPeer, setOpenPeer] = useState(null);
  const [newChat, setNewChat]   = useState(false);

  useEffect(() => {
    let cancelled = false;
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
  }, [myUsername, blockedUsers]);

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
              const profile = profileCache[c.peer];
              return (
                <button
                  key={c.peer} onClick={() => { setOpenPeer(c.peer); markRead(c.peer); }}
                  className="flex w-full items-center gap-3 border-b border-white/6 px-5 py-3.5 text-left transition last:border-b-0 hover:bg-white/5"
                >
                  <Avatar profile={profile} size={40} fallback={c.peer.slice(0,2).toUpperCase()} className="text-sm"/>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-slate-100">{profile?.name || c.peer}</div>
                    <div className="truncate text-[10.5px] text-slate-500">@{c.peer}</div>
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
