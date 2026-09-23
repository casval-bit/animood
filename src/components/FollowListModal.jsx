import { useState, useEffect } from "react";
import { follows, sb } from "../api/supabase.js";
import { useApp } from "../context/useApp.js";
import { useLang } from "../context/useLang.js";
import { Modal } from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";
import { Avatar } from "./Avatar.jsx";
import { GRADIENT_PRIMARY, GRADIENT_TEXT } from "../constants/theme.js";
import { FOLLOW_LIST_MODAL_I18N } from "../constants/followListModalI18n.js";

// ─── Followers/following list for a profile — mode: "followers" | "following" ─
export function FollowListModal({ username, mode, onClose, onOpenUser }) {
  const { myUsername, blockedUsers } = useApp();
  const { lang } = useLang();
  const t = FOLLOW_LIST_MODAL_I18N[lang] || FOLLOW_LIST_MODAL_I18N.fr;
  const [usernames, setUsernames] = useState([]);
  const [profiles, setProfiles]   = useState({});
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchList = mode === "followers" ? follows.getFollowers(username) : follows.getFollowing(username);
    fetchList.then(async list => {
      if(cancelled) return;
      const visible = blockedUsers?.size ? list.filter(u => !blockedUsers.has(u)) : list;
      setUsernames(visible);
      if(visible.length) {
        try {
          const rows = await sb.query(`profiles?username=in.(${visible.map(u=>encodeURIComponent(u)).join(",")})&select=username,name,avatar,avatar_base64`);
          if(cancelled) return;
          const cache = {};
          (rows||[]).forEach(r => { cache[r.username] = r; });
          setProfiles(cache);
        } catch {}
      }
    }).finally(() => { if(!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username, mode, blockedUsers]);

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm" bodyClassName="flex flex-col">
      <div className="px-5 py-3.5" style={{ background: GRADIENT_PRIMARY }}>
        <div className="text-[13px] font-black uppercase tracking-wide text-white">
          {mode === "followers" ? t.followersTitle : t.followingTitle}
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner small label={t.loading} /></div>
        ) : usernames.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-600">{mode === "followers" ? t.noFollowers : t.noFollowing}</div>
        ) : usernames.map(u => {
          const p = profiles[u];
          return (
            <button
              key={u} onClick={() => { onOpenUser?.(u); onClose(); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
            >
              <Avatar profile={p} size={36} fallback={u.slice(0,2).toUpperCase()} className="text-[11px]"/>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[12.5px] font-bold ${GRADIENT_TEXT}`}>{p?.name || u}</div>
                <div className="truncate text-[10.5px] text-slate-500">@{u}</div>
              </div>
              {u === myUsername && <span className="shrink-0 text-[9px] text-slate-500">{t.youTag}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
