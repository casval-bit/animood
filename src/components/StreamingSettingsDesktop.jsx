// ─── DESKTOP ONLY — Paramètres → Streaming : pays, plateformes perso, VPN ────
import { useEffect, useState } from "react";
import { REGIONS, getUserRegion, setUserRegion, REGION_EVENT } from "../utils/streamingRegions.js";
import { isStoreApp } from "../utils/streamingLinks.js";
import { getCustomPlatforms, deleteCustomPlatform, addPlatformFromInput, CUSTOM_PLATFORMS_EVENT } from "../utils/customPlatforms.js";
import { VPNS, openExternalUrl } from "../utils/vpnList.js";
import { CustomPlatformsModal, PlatformIcon } from "./CustomPlatformsModal.jsx";
import { GRADIENT_PRIMARY } from "../constants/theme.js";

const openExt = openExternalUrl;

export function StreamingSettingsDesktop({ lang = "fr", Section, playSound = () => {} }) {
  const en = lang === "en";
  const [region, setRegion] = useState(getUserRegion);
  const [list, setList] = useState(getCustomPlatforms);
  const [modal, setModal] = useState(false);
  const [quick, setQuick] = useState(""), [quickMsg, setQuickMsg] = useState(null);
  const quickAdd = () => {
    if (!quick.trim()) return;
    const r = addPlatformFromInput(quick);
    if (r.ok) { setQuick(""); setQuickMsg({ ok: true, t: en ? `${r.name} added — its button now appears on every anime.` : `${r.name} ajouté — son bouton apparaît maintenant sur tous les animés.` }); }
    else setQuickMsg({ ok: false, t: { invalid: en ? "Invalid address (e.g. mysite.com)." : "Adresse invalide (ex. monsite.com).", exists: en ? "This site is already in your list." : "Ce site est déjà dans ta liste.", max: en ? "12 platforms maximum." : "12 plateformes maximum." }[r.error] });
  };
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

      {!isStoreApp() && <Section title={en ? "My streaming platforms" : "Mes plateformes perso"}>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">{en ? "Type the site address once (e.g. mysite.com): its button then appears on every anime and finds the right page by itself, from the anime name. Nothing to re-enter. If a site can't be read automatically: open ONE anime there, right-click its button on the anime page and paste the address — the app then learns the site's pattern for all the others." : "Tape l'adresse du site une seule fois (ex. monsite.com) : son bouton apparaît ensuite sur tous les animés et retrouve la bonne page tout seul, d'après le nom de l'animé. Rien à ressaisir. Si un site ne se laisse pas lire automatiquement : ouvre UN animé dessus, fais clic droit sur son bouton dans la fiche de l'animé et colle l'adresse — l'appli apprend alors le modèle du site pour tous les autres."}</p>
        <p className="mb-3 text-[10.5px] leading-relaxed text-slate-600">{en ? "AniMood provides no site list and hosts nothing: it only opens the address you typed, so you are responsible for the sites you add and for respecting their terms and your local law." : "AniMood ne fournit aucune liste de sites et n'héberge rien : l'appli ouvre seulement l'adresse que tu as saisie. Tu es responsable des sites que tu ajoutes (respect de leurs conditions et de la loi de ton pays)."}</p>
        <div className="mb-3 flex gap-2">
          <input value={quick} onChange={(e) => { setQuick(e.target.value); setQuickMsg(null); }} onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder={en ? "mysite.com" : "monsite.com"} spellCheck={false} autoCapitalize="off"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/60" />
          <button onClick={() => { playSound("click"); quickAdd(); }} className="rounded-xl px-4 py-2 text-[12px] font-extrabold text-white" style={{ background: GRADIENT_PRIMARY }}>{en ? "Add" : "Ajouter"}</button>
        </div>
        {quickMsg && <div className="mb-3 text-[11px] font-bold" style={{ color: quickMsg.ok ? "#4ade80" : "#f87171" }}>{quickMsg.t}</div>}
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
        <button onClick={() => setModal(true)} className="rounded-xl px-4 py-2.5 text-[12px] font-extrabold text-white" style={{ background: GRADIENT_PRIMARY }}>＋ {en ? "Advanced options / manage" : "Options avancées / gérer"}</button>
        {modal && <CustomPlatformsModal lang={lang} onClose={() => setModal(false)} />}
      </Section>}

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
