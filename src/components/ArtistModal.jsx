import { useState } from "react";
import { useLang } from "../context/useLang.js";
import { ARTIST_MODAL_I18N } from "../constants/artistModalI18n.js";
import { jikan } from "../api/jikan.js";
import { resolveMalId } from "../api/animethemes.js";
import { Modal } from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";

export function ArtistModal({ artist, onClose, onOpenDetail }) {
  const { lang } = useLang();
  const t = ARTIST_MODAL_I18N[lang] || ARTIST_MODAL_I18N.fr;
  const [loadingId, setLoadingId] = useState(null);

  const openAnime = async (theme) => {
    if(loadingId) return;
    setLoadingId(theme.animeId);
    try {
      const malId = await resolveMalId(theme.animeSlug);
      if(!malId) return;
      const r = await jikan.getAnime(malId);
      if(r?.data) onOpenDetail(r.data);
    } catch { /* keep modal open on failure */ }
    setLoadingId(null);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6">
        <div className="mb-5 flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl">🎤</div>
          <div>
            <div className="text-lg font-black text-slate-100">{artist.name}</div>
            <div className="text-xs text-slate-500">{t.themeCount(artist.themes.length)}</div>
          </div>
        </div>

        {artist.themes.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-500">{t.noThemes}</div>
        )}

        <div className="flex flex-col gap-2">
          {artist.themes.map(theme => (
            <button key={`${theme.animeId}-${theme.slug}`}
              disabled={loadingId === theme.animeId}
              onClick={() => openAnime(theme)}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-left transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-slate-100">{theme.animeTitle}</div>
                <div className="truncate text-[11px] text-slate-500">
                  {theme.type === "ED" ? "🔚" : "🎵"} {theme.songTitle}{theme.year ? ` · ${theme.year}` : ""}
                </div>
              </div>
              {loadingId === theme.animeId
                ? <Spinner small />
                : <span className="shrink-0 rounded-full bg-white/6 px-2 py-0.5 text-[9px] font-bold text-slate-400">{theme.slug}</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
