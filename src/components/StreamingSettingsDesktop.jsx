// ─── DESKTOP ONLY — Paramètres → Streaming : pays, plateformes perso, VPN ────
import { useEffect, useState } from "react";
import { REGIONS, getUserRegion, setUserRegion, REGION_EVENT } from "../utils/streamingRegions.js";
import { getCustomPlatforms, deleteCustomPlatform, CUSTOM_PLATFORMS_EVENT } from "../utils/customPlatforms.js";
import { CustomPlatformsModal, PlatformIcon } from "./CustomPlatformsModal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const VPNS = [
  { name: "ProtonVPN", url: "https://protonvpn.com", color: "#6d4aff", note: { fr: "Offre gratuite, sans limite de données", en: "Free plan, no data cap" } },
  { name: "NordVPN", url: "https://nordvpn.com", color: "#4687ff", note: { fr: "Très grand choix de pays", en: "Huge choice of countries" } },
  { name: "CyberGhost", url: "https://www.cyberghostvpn.com", color: "#ffcc00", note: { fr: "Serveurs dédiés au streaming", en: "Streaming-optimised servers" } },
  { name: "Urban VPN", url: "https://www.urban-vpn.com", color: "#22c55e", note: { fr: "Gratuit (extension / appli)", en: "Free (extension / app)" } },
];
const openExt = (url) => { try { window.animood.openExternal(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); } };

export function StreamingSettingsDesktop({ lang = "fr", Section, playSound = () => {} }) {
  const en = lang === "en";
  const [region, setRegion] = useState(getUserRegion);
  const [list, setList] = useState(getCustomPlatforms);
  const [modal, setModal] = useState(false);
  useEffect(() => {
    const a = () => setRegion(getUserRegion()), b = () => setList(getCustomPlatforms());
    window.addEventListener(REGION_EVENT, a); window.addEventListener(CUSTOM_PLATFORMS_EVENT, b);
    return () => { window.removeEventListener(REGION_EVENT, a); window.removeEventListener(CUSTOM_PLATFORMS_EVENT, b); };
  }, []);

  return (
    <>
      <Section title={en ? "Your country" : "Ton pays"}>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          {en ? "Catalogues differ from one country to another. Pick yours and AniMood only shows the platforms that really have the anime there. No location is requested: it is just your choice, stored on this computer (by default it follows your system language)."
              : "Les catalogues changent d'un pays à l'autre. Choisis le tien et AniMood n'affiche comme disponibles que les plateformes qui ont vraiment l'animé chez toi. Aucune position n'est demandée : c'est juste ton choix, stocké sur cet ordinateur (par défaut, il suit la langue de ton système)."}
        </p>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button key={r.code} onClick={() => { playSound("click"); setUserRegion(r.code); }}
              className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] font-bold transition"
              style={region === r.code ? { borderColor: "rgba(139,92,246,.7)", background: "rgba(124,58,237,.16)", color: "#e9e5ff" } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: "rgb(203,213,225)" }}>
              <span className="text-[17px] leading-none">{r.flag}</span>{en ? r.en : r.fr}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{en ? "More countries will be added over time. Availability data: JustWatch, via TMDB." : "D'autres pays seront ajoutés avec le temps. Données de disponibilité : JustWatch, via TMDB."}</p>
      </Section>

      <Section title={en ? "My streaming platforms" : "Mes plateformes perso"}>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">{en ? "Add any site once: its button then appears on every anime and finds the right page by itself." : "Ajoute un site une seule fois : son bouton apparaît ensuite sur tous les animés et retrouve la bonne page tout seul."}</p>
        {list.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                <PlatformIcon platform={p} size={20} />
                <div className="min-w-0 flex-1"><div className="text-[13px] font-bold text-slate-100">{p.name}</div><div className="truncate text-[10.5px] text-slate-500">{p.url}</div></div>
                <button onClick={() => deleteCustomPlatform(p.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-red-400/80 hover:bg-red-500/10">🗑</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setModal(true)} className="rounded-xl px-4 py-2.5 text-[12px] font-extrabold text-white" style={{ background: GRADIENT_PRIMARY }}>＋ {en ? "Add / manage platforms" : "Ajouter / gérer mes plateformes"}</button>
        {modal && <CustomPlatformsModal lang={lang} onClose={() => setModal(false)} />}
      </Section>

      <Section title="VPN">
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          {en ? "An anime is not offered in your country? A VPN lets you pick another one. Links go to the official sites, with no partnership. Check each platform's terms of use first."
              : "Un animé n'est pas proposé dans ton pays ? Un VPN permet d'en choisir un autre. Les liens mènent aux sites officiels, sans aucun partenariat. Vérifie d'abord les conditions d'utilisation de chaque plateforme."}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VPNS.map((v) => (
            <button key={v.name} onClick={() => { playSound("click"); openExt(v.url); }}
              className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/6" style={{ borderLeft: `3px solid ${v.color}` }}>
              <div className="min-w-0 flex-1"><div className="text-[13px] font-extrabold text-slate-100">{v.name}</div><div className="text-[10.5px] text-slate-500">{en ? v.note.en : v.note.fr}</div></div>
              <span className="text-slate-500 transition group-hover:text-slate-200">↗</span>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
