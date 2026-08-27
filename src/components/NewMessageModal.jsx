import { useState, useEffect } from "react";
import { sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { Modal } from "./Modal.jsx";
import { Avatar } from "./Avatar.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

// ─── Search a username and pick one to start a fresh 1:1 conversation ─────────
export function NewMessageModal({ myUsername, onClose, onSelect }) {
  const { blockedUsers } = useApp();
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
    <Modal onClose={onClose} maxWidth="max-w-md" bodyClassName="flex flex-col">
      <div className="px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black text-white">✏️ Nouveau message</div>
      </div>
      <div className="p-4">
        <input
          value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Chercher un pseudo…"
          className="w-full rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400/50"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {searching ? (
          <div className="py-6 text-center text-xs text-slate-600">Recherche…</div>
        ) : q.trim() && results.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-600">Aucun membre trouvé.</div>
        ) : (
          results.map(r => (
            <button
              key={r.username} onClick={() => onSelect(r.username)}
              className="flex w-full items-center gap-3 border-b border-white/6 px-5 py-3 text-left transition last:border-b-0 hover:bg-white/5"
            >
              <Avatar profile={r} size={40} fallback={r.username.slice(0,2).toUpperCase()} className="text-sm"/>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-slate-100">{r.name || r.username}</div>
                <div className="truncate text-[11px] text-slate-500">@{r.username}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
