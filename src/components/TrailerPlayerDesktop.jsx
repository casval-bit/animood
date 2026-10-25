// ─── DESKTOP ONLY — lecteur de trailer intégré (YouTube) : plus de redirection vers le navigateur ────
import { Modal } from "./Modal.jsx";
import { openExternalUrl } from "../utils/vpnList.js";
import { youtubeIdOf } from "../utils/youtube.js";

export function TrailerPlayerDesktop({ trailer, title, lang = "fr", onClose }) {
  const id = youtubeIdOf(trailer);
  const en = lang === "en";
  const watchUrl = id ? `https://www.youtube.com/watch?v=${id}` : (trailer?.url || "");
  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" bodyClassName="p-0">
      {(close) => (
        <div>
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[8px] text-white">▶</span>
            <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-100">{title ? `${title} — Trailer` : "Trailer"}</div>
            {watchUrl && (
              <button type="button" onClick={() => openExternalUrl(watchUrl)} className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-400 transition hover:bg-white/8 hover:text-slate-200"
                title={en ? "Open on YouTube (browser)" : "Ouvrir sur YouTube (navigateur)"}>YouTube ↗</button>
            )}
            <button type="button" onClick={close} aria-label={en ? "Close" : "Fermer"} className="text-slate-400 transition hover:text-white">✕</button>
          </div>
          {id ? (
            <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe title="Trailer" className="absolute inset-0 h-full w-full" style={{ border: 0 }}
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          ) : (
            <div className="p-8 text-center text-[13px] text-slate-400">{en ? "No playable trailer for this anime." : "Pas de trailer lisible pour cet animé."}</div>
          )}
          <p className="px-4 py-2 text-[10px] text-slate-600">{en ? "If the video does not load (restricted by the owner), use “YouTube ↗”." : "Si la vidéo ne se charge pas (restriction du propriétaire), utilise « YouTube ↗ »."}</p>
        </div>
      )}
    </Modal>
  );
}
