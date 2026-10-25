// ─── Onglet « Où regarder » de la fiche animé (site web) ─────────────────────────────────────────────────
// Même données que la barre « Regarder sur » de l'appli de bureau (liens directs Jikan, disponibilité par pays JustWatch/TMDB,
// astuce VPN), présentées en tuiles : un clic ouvre la plateforme officielle dans un nouvel onglet.
// Les plateformes perso (« Ma plateforme ») restent propres à l'appli de bureau : elles demandent son résolveur de liens.
import { useEffect, useState } from "react";
import { STREAMING_SERVICES, DEFAULT_SHOW_SERVICES, openStreamingLink, getConfirmedServices, normaliseServiceName } from "../utils/streamingLinks.js";
import { getRegionAvailability, getUserRegion, setUserRegion, REGIONS, REGION_EVENT } from "../utils/streamingRegions.js";
import { StreamingLogo, logoColor } from "./StreamingLogos.jsx";
import { VPNS, openExternalUrl } from "../utils/vpnList.js";

const NONE = { known: false, ids: new Set(), names: [], elsewhere: {} };

export function StreamingPanelWeb({ anime, streamingNames = [], lang = "fr" }) {
  const en = lang === "en";
  const [region, setRegion] = useState(getUserRegion);
  const [res, setRes] = useState({ key: "", avail: NONE });
  const [menu, setMenu] = useState(false);
  const [vpnSel, setVpnSel] = useState(null); // « clé:service » — se périme tout seul quand on change d'animé ou de pays
  const key = `${anime?.mal_id}|${region}`;
  const avail = res.key === key ? res.avail : NONE;
  const vpnFor = vpnSel && vpnSel.startsWith(key + ":") ? vpnSel.slice(key.length + 1) : null;
  useEffect(() => { const h = () => setRegion(getUserRegion()); window.addEventListener(REGION_EVENT, h); return () => window.removeEventListener(REGION_EVENT, h); }, []);
  useEffect(() => {
    let off = false;
    getRegionAvailability(anime?.mal_id, region).then((a) => { if (!off) setRes({ key: `${anime?.mal_id}|${region}`, avail: a }); });
    return () => { off = true; };
  }, [anime?.mal_id, region]);
  if (!anime) return null;

  // Pays vérifié → on ne confirme QUE ce qui y est disponible ; sinon on retombe sur la liste MAL (non régionale)
  let confirmed = getConfirmedServices(anime, {});
  for (const n of streamingNames) { const id = normaliseServiceName(n); if (id) confirmed.add(id); }
  if (avail.known) confirmed = new Set([...avail.ids]);
  const reg = REGIONS.find((r) => r.code === region) || REGIONS[0];
  const regLabel = (c) => { const r = REGIONS.find((x) => x.code === c); return r ? `${r.flag} ${en ? r.en : r.fr}` : c; };
  const elsewhere = (id) => avail.elsewhere?.[id] || [];
  const extra = [...confirmed].filter((id) => !DEFAULT_SHOW_SERVICES.includes(id));
  const all = [...DEFAULT_SHOW_SERVICES, ...extra].filter((id) => STREAMING_SERVICES[id]);
  const name = anime.title_english || anime.title;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-black text-slate-100">{en ? "Where to watch" : "Où regarder"}</div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
            {avail.known
              ? (en ? <>Availability in <b className="text-slate-300">{reg.flag} {reg.en}</b> (JustWatch). Green = available there.</>
                    : <>Disponibilité en <b className="text-slate-300">{reg.flag} {reg.fr}</b> (JustWatch). Vert = disponible dans ce pays.</>)
              : (en ? <>Not checked yet for {reg.flag} {reg.en}: each button opens a search for this anime on the platform.</>
                    : <>Pas encore vérifié pour {reg.flag} {reg.fr} : chaque bouton ouvre une recherche de cet animé sur la plateforme.</>)}
          </p>
        </div>
        <div className="relative shrink-0">
          <button onClick={() => setMenu((v) => !v)} aria-expanded={menu}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-[12px] font-bold text-slate-300 transition hover:border-white/25">
            <span className="text-[15px] leading-none">{reg.flag}</span>{en ? reg.en : reg.fr}
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: avail.known ? "#22c55e" : "#64748b" }} />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-30 w-48 rounded-xl border border-white/10 p-1.5 shadow-xl" style={{ background: "rgba(14,15,30,.98)" }}>
              {REGIONS.map((r) => (
                <button key={r.code} onClick={() => { setUserRegion(r.code); setMenu(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold hover:bg-white/8"
                  style={{ color: r.code === region ? "#c4b5fd" : "rgb(203,213,225)" }}><span>{r.flag}</span>{en ? r.en : r.fr}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2">
        {all.map((id) => {
          const svc = STREAMING_SERVICES[id], ok = confirmed.has(id), c = logoColor(id), other = elsewhere(id);
          return (
            <div key={id} className="rounded-2xl border p-3" style={{ borderColor: ok ? `${c}55` : "rgba(255,255,255,.08)", background: ok ? `linear-gradient(135deg, ${c}1c, ${c}08)` : "rgba(255,255,255,.03)" }}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-xl bg-black/25" style={{ filter: ok ? "none" : "grayscale(1) opacity(.5)" }}>
                  <StreamingLogo id={id} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-black text-slate-100">{svc.label}</div>
                  <div className="text-[11px]" style={{ color: ok ? "#4ade80" : "rgb(148,163,184)" }}>
                    {ok ? (en ? "✓ Available" : "✓ Disponible") : avail.known ? (en ? "Not found here" : "Introuvable ici") : (en ? "Search" : "Rechercher")}
                    {!ok && other.length > 0 && <span className="text-violet-300"> · {en ? "elsewhere:" : "ailleurs :"} {other.map((cc) => REGIONS.find((r) => r.code === cc)?.flag || cc).join(" ")}</span>}
                  </div>
                </div>
                <button onClick={() => openStreamingLink(id, anime, {})} title={en ? `Open ${svc.label}` : `Ouvrir ${svc.label}`}
                  className="h-8 shrink-0 rounded-lg px-3 text-[12px] font-bold transition hover:brightness-110"
                  style={ok ? { background: c, color: "#fff" } : { border: "1px solid rgba(255,255,255,.14)", color: "rgb(203,213,225)" }}>
                  {ok ? (en ? "Watch" : "Regarder") : (en ? "Search" : "Chercher")}
                </button>
              </div>
              {!ok && other.length > 0 && (
                <button onClick={() => setVpnSel(vpnFor === id ? null : `${key}:${id}`)} className="mt-2 text-[11px] font-semibold text-violet-300 hover:text-violet-200">
                  {en ? "Available in other countries — how to watch it?" : "Disponible dans d'autres pays — comment le regarder ?"}
                </button>
              )}
              {vpnFor === id && other.length > 0 && (
                <div className="mt-2 rounded-xl border p-3" style={{ borderColor: "rgba(167,139,250,.35)", background: "rgba(124,58,237,.08)" }}>
                  <p className="text-[11.5px] leading-relaxed text-slate-300">
                    {en ? <>Not offered on <b>{svc.label}</b> in {reg.en}, but available in <b>{other.map(regLabel).join(", ")}</b>. A VPN with a server in one of these countries lets you open it from there.</>
                        : <>Pas proposé sur <b>{svc.label}</b> en {reg.fr}, mais disponible en <b>{other.map(regLabel).join(", ")}</b>. Un VPN avec un serveur dans l'un de ces pays permet de le lancer depuis là-bas.</>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {VPNS.map((v) => (
                      <button key={v.name} onClick={() => openExternalUrl(v.url)} title={en ? v.note.en : v.note.fr}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200 transition hover:bg-white/8" style={{ borderLeft: `3px solid ${v.color}` }}>{v.name} ↗</button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-snug text-slate-600">{en ? "Links go to the official VPN sites, with no partnership. Check the platform's terms of use first." : "Liens vers les sites officiels des VPN, sans partenariat. Vérifie d'abord les conditions d'utilisation de la plateforme."}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10.5px] leading-snug text-slate-600">
        {en ? `Links open the official platforms (no partnership). Search target: "${name}". Availability data: JustWatch via TMDB.`
            : `Les liens ouvrent les plateformes officielles (sans partenariat). Recherche : « ${name} ». Données de disponibilité : JustWatch via TMDB.`}
      </p>
    </div>
  );
}
