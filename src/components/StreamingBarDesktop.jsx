// ─── DESKTOP ONLY — barre « Regarder sur » avec les vrais logos des plateformes ──
// Même logique que l’ancien StreamingButtons (liens directs Jikan, sinon recherche sur la plateforme),
// présentée en pastilles compactes avec le logo de chaque service.
import { useEffect, useState } from "react";
import { STREAMING_SERVICES, DEFAULT_SHOW_SERVICES, openStreamingLink, getConfirmedServices, normaliseServiceName } from "../utils/streamingLinks.js";
import { useSound } from "../context/SoundContext.jsx";
import { StreamingLogo, logoColor } from "./StreamingLogos.jsx";
import { getCustomPlatforms, openCustomPlatform, getExactLink, platformColor, CUSTOM_PLATFORMS_EVENT } from "../utils/customPlatforms.js";
import { getRegionAvailability, getUserRegion, setUserRegion, REGIONS, REGION_EVENT } from "../utils/streamingRegions.js";
import { CustomPlatformsModal, ExactLinkModal, PlatformIcon } from "./CustomPlatformsModal.jsx";

export function StreamingBarDesktop({ anime, streamingNames, lang = "fr" }) {
  const { playSound } = useSound();
  const [loading, setLoading] = useState(null);
  const [custom, setCustom] = useState(getCustomPlatforms);
  const [manage, setManage] = useState(false);
  const [exact, setExact] = useState(null);
  const [region, setRegion] = useState(getUserRegion);
  const [avail, setAvail] = useState({ known: false, ids: new Set(), names: [] });
  const [regionMenu, setRegionMenu] = useState(false);
  useEffect(() => { const h = () => setRegion(getUserRegion()); window.addEventListener(REGION_EVENT, h); return () => window.removeEventListener(REGION_EVENT, h); }, []);
  useEffect(() => { let off = false; setAvail({ known: false, ids: new Set(), names: [] }); getRegionAvailability(anime?.mal_id, region).then((a) => { if (!off) setAvail(a); }); return () => { off = true; }; }, [anime?.mal_id, region]);
  useEffect(() => { const h = () => setCustom(getCustomPlatforms()); window.addEventListener(CUSTOM_PLATFORMS_EVENT, h); return () => window.removeEventListener(CUSTOM_PLATFORMS_EVENT, h); }, []);
  if (!anime) return null;
  // Pays vérifié (données JustWatch) → on ne confirme QUE ce qui est dispo dans ce pays. Sinon ancien comportement (liste MAL, non régionale).
  let confirmed = getConfirmedServices(anime, {});
  if (Array.isArray(streamingNames)) for (const n of streamingNames) { const id = normaliseServiceName(n); if (id) confirmed.add(id); }
  if (avail.known) confirmed = new Set([...avail.ids]);
  const reg = REGIONS.find((r) => r.code === region) || REGIONS[0];
  const extra = [...confirmed].filter((id) => !DEFAULT_SHOW_SERVICES.includes(id));
  const all = [...DEFAULT_SHOW_SERVICES, ...extra].filter((id) => STREAMING_SERVICES[id]);
  const en = lang === "en";

  const open = async (id) => {
    playSound("click");
    setLoading(id);
    try { await openStreamingLink(id, anime, {}); } finally { setTimeout(() => setLoading(null), 800); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{en ? "Watch on" : "Regarder sur"}</span>
      {all.map((id) => {
        const svc = STREAMING_SERVICES[id];
        const ok = confirmed.has(id);
        const c = logoColor(id);
        return (
          <button key={id} onClick={() => open(id)} disabled={loading === id}
            title={ok ? (en ? `Watch on ${svc.label}` : `Regarder sur ${svc.label}`) + (avail.known ? ` (${reg.flag} ${reg.code})` : "") : (avail.known ? (en ? `Not found in ${reg.en} — ` : `Introuvable en ${reg.fr} — `) : "") + (en ? `Search "${anime.title_english || anime.title}" on ${svc.label}` : `Rechercher « ${anime.title_english || anime.title} » sur ${svc.label}`)}
            className="group relative flex h-9 items-center gap-2 rounded-xl px-3 transition-all duration-200 hover:-translate-y-0.5"
            style={{
              border: `1px solid ${ok ? c + "55" : "rgba(var(--fg-rgb),0.08)"}`,
              background: ok ? `linear-gradient(135deg, ${c}1f, ${c}0a)` : "rgba(var(--fg-rgb),0.03)",
              boxShadow: ok ? `0 4px 16px ${c}22` : "none",
              opacity: loading === id ? 0.55 : 1, cursor: loading === id ? "wait" : "pointer",
            }}>
            <span style={{ filter: ok ? "none" : "grayscale(1) opacity(.45)" }}><StreamingLogo id={id} size={18} /></span>
            {!["adn", "hidive", "disney"].includes(id) && (
              <span className="text-[11px] font-bold" style={{ color: ok ? "var(--text-1)" : "rgba(148,163,184,.6)" }}>{svc.label}</span>
            )}
            {ok ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0d0b18]" style={{ background: "#22c55e" }} /> : null}
          </button>
        );
      })}
      {custom.map((p) => {
        const c = platformColor(p.name), has = !!getExactLink(p.id, anime);
        return (
          <button key={p.id} onClick={async () => { playSound("click"); setLoading(p.id); try { await openCustomPlatform(p, anime); } finally { setTimeout(() => setLoading(null), 800); } }}
            onContextMenu={(e) => { e.preventDefault(); setExact(p); }}
            title={(en ? `Open on ${p.name}` : `Ouvrir sur ${p.name}`) + (has ? (en ? " (exact link saved)" : " (lien exact enregistré)") : "") + (en ? " — right-click: set exact link" : " — clic droit : lien exact")}
            className="group relative flex h-9 items-center gap-2 rounded-xl px-3 transition-all duration-200 hover:-translate-y-0.5"
            style={{ border: `1px solid ${c}44`, background: `linear-gradient(135deg, ${c}18, ${c}08)`, opacity: loading === p.id ? 0.55 : 1 }}>
            <PlatformIcon platform={p} size={16} />
            <span className="max-w-24 truncate text-[11px] font-bold" style={{ color: "var(--text-1)" }}>{p.name}</span>
            <span onClick={(e) => { e.stopPropagation(); setExact(p); }} title={en ? "Exact link for this anime" : "Lien exact pour cet animé"}
              className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded text-[10px] text-slate-400 hover:bg-white/15 hover:text-white group-hover:flex">✎</span>
            {has ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0d0b18]" style={{ background: c }} /> : null}
          </button>
        );
      })}
      <button onClick={() => { playSound("click"); setManage(true); }}
        title={en ? "Add your own streaming platform" : "Ajouter ta propre plateforme de streaming"}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 text-[11px] font-bold text-slate-400 transition hover:border-violet-400/60 hover:text-violet-300">
        <span className="text-[14px] leading-none">+</span>{custom.length === 0 ? (en ? "My platform" : "Ma plateforme") : null}
      </button>
      <div className="relative ml-auto">
        <button onClick={() => setRegionMenu((v) => !v)} title={avail.known ? (en ? `Availability in ${reg.en} (JustWatch)` : `Disponibilité en ${reg.fr} (JustWatch)`) : (en ? `Region: ${reg.en} — not checked yet for this anime` : `Pays : ${reg.fr} — pas encore vérifié pour cet animé`)}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-2.5 text-[11px] font-bold text-slate-300 transition hover:border-white/25">
          <span className="text-[14px] leading-none">{reg.flag}</span>{reg.code}
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: avail.known ? "#22c55e" : "#64748b" }} />
        </button>
        {regionMenu && (
          <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-white/10 p-1.5 shadow-xl" style={{ background: "rgba(14,15,30,.98)" }}>
            {REGIONS.map((r) => (
              <button key={r.code} onClick={() => { setUserRegion(r.code); setRegionMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold hover:bg-white/8"
                style={{ color: r.code === region ? "#c4b5fd" : "rgb(203,213,225)" }}><span>{r.flag}</span>{en ? r.en : r.fr}</button>
            ))}
          </div>
        )}
      </div>
      {manage && <CustomPlatformsModal lang={lang} onClose={() => setManage(false)} />}
      {exact && <ExactLinkModal platform={exact} anime={anime} lang={lang} onClose={() => setExact(null)} />}
    </div>
  );
}
