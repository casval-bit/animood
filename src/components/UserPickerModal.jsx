import { useState, useEffect } from "react";
import { sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { Modal } from "./Modal.jsx";
import { Avatar } from "./Avatar.jsx";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { USER_PICKER_MODAL_I18N } from "../constants/userPickerModalI18n.js";

// ─── Search-as-you-type username picker — stays open across multiple picks ────
// (unlike NewMessageModal, which closes after one selection to open a chat).
export function UserPickerModal({ myUsername, excludeUsernames = [], onSelect, onClose }) {
  const { blockedUsers } = useApp();
  const { lang } = useLang();
  const t = USER_PICKER_MODAL_I18N[lang] || USER_PICKER_MODAL_I18N.fr;
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const excluded = new Set(excludeUsernames);

  useEffect(() => {
    const query = q.trim();
    if(!query) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const enc = encodeURIComponent(query);
    const timer = setTimeout(() => {
      sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.*${enc}*)&select=username,name,avatar,avatar_base64&limit=8`)
        .then(rows => setResults((rows||[]).filter(r => r.username !== myUsername && !blockedUsers?.has(r.username))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, myUsername, blockedUsers]);

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" bodyClassName="flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black text-white">{t.title}</div>
        <button onClick={onClose} className="rounded-full px-3 py-1 text-[11px] font-bold text-white/80 transition hover:bg-white/15">{t.doneBtn}</button>
      </div>
      <div className="p-4">
        <input
          value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder={t.searchPlaceholder}
          className="w-full rounded-full border border-white/12 bg-white/7 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-violet-400/50"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {searching ? (
          <div className="py-6 text-center text-xs text-slate-600">{t.searching}</div>
        ) : q.trim() && results.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-600">{t.noMemberFound}</div>
        ) : (
          results.map(r => {
            const already = excluded.has(r.username);
            return (
              <button
                key={r.username} onClick={() => !already && onSelect(r.username)} disabled={already}
                className={`flex w-full items-center gap-3 border-b border-white/6 px-5 py-3 text-left transition last:border-b-0 ${already ? "opacity-40" : "hover:bg-white/5"}`}
              >
                <Avatar profile={r} size={40} fallback={r.username.slice(0,2).toUpperCase()} className="text-sm"/>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13.5px] font-bold ${GRADIENT_TEXT}`}>{r.name || r.username}</div>
                  <div className="truncate text-[11px] text-slate-500">@{r.username}</div>
                </div>
                {already && <span className="shrink-0 text-[10px] text-slate-500">{t.alreadyAdded}</span>}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
