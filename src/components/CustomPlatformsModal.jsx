// ─── DESKTOP ONLY — gestion des plateformes de streaming personnalisées + lien exact par animé ──
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GLASS_STYLE, GRADIENT_PRIMARY } from "../constants/theme.js";
import {
  getCustomPlatforms, saveCustomPlatform, deleteCustomPlatform, normaliseUrl, buildCustomUrl,
  getExactLink, setExactLink, hostOf, platformColor, nameFromHost,
} from "../utils/customPlatforms.js";

const SAMPLE = { mal_id: 52701, title: "Sousou no Frieren", title_english: "Frieren: Beyond Journey's End" };

export function PlatformIcon({ platform, size = 18 }) {
  const [bad, setBad] = useState(false);
  const host = hostOf(platform.url), c = platformColor(platform.name);
  if (!bad && host) return <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} width={size} height={size} alt="" onError={() => setBad(true)} style={{ borderRadius: 4, display: "block", flexShrink: 0 }} />;
  return <span style={{ width: size, height: size, borderRadius: 5, background: c + "33", color: c, fontSize: size * 0.62, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(platform.name[0] || "?").toUpperCase()}</span>;
}

function Shell({ onClose, title, children, width = 460 }) {
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return createPortal(
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(3,4,12,.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...GLASS_STYLE, width, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", borderRadius: 18, padding: 22, border: "1px solid rgba(var(--fg-rgb),.1)", background: "rgba(14,15,30,.96)" }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[15px] font-extrabold text-slate-100">{title}</div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10">✕</button>
        </div>
        {children}
      </div>
    </div>, document.body);
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/60";

/** Ajouter / gérer ses plateformes. */
export function CustomPlatformsModal({ onClose, lang = "fr" }) {
  const en = lang === "en";
  const [list, setList] = useState(getCustomPlatforms());
  const [name, setName] = useState(""), [url, setUrl] = useState(""), [mode, setMode] = useState("auto"), [editId, setEditId] = useState(null), [err, setErr] = useState("");
  const hasVars = /\{[a-z_]+\}/i.test(url);
  const refresh = () => setList(getCustomPlatforms());
  const preview = normaliseUrl(url) ? buildCustomUrl({ id: "_preview", url: normaliseUrl(url), mode }, SAMPLE) : "";

  const submit = () => {
    if (!normaliseUrl(url)) return setErr(en ? "Invalid address (e.g. mysite.com)." : "Adresse invalide (ex. monsite.com).");
    saveCustomPlatform({ id: editId, name: name.trim() || nameFromHost(hostOf(normaliseUrl(url))), url, mode }); setName(""); setUrl(""); setMode("auto"); setEditId(null); setErr(""); refresh();
  };

  return (
    <Shell onClose={onClose} title={en ? "My streaming platforms" : "Mes plateformes de streaming"} width={500}>
      <p className="mb-4 text-[12px] leading-relaxed text-slate-400">
        {en ? "Add any site (even unofficial ones) once: a button appears on every anime and finds the right page by itself. Nothing to enter per anime."
            : "Ajoute n'importe quel site (même non officiel) une seule fois : un bouton apparaît sur chaque animé et retrouve la bonne page tout seul. Rien à saisir par animé."}
      </p>

      {list.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-2">
              <PlatformIcon platform={p} size={20} />
              <div className="min-w-0 flex-1"><div className="text-[13px] font-bold text-slate-100">{p.name}</div><div className="truncate text-[10.5px] text-slate-500">{p.url}</div></div>
              <button onClick={() => { setEditId(p.id); setName(p.name); setUrl(p.url); setMode(p.mode || "slug"); setErr(""); }} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/10">✎</button>
              <button onClick={() => { deleteCustomPlatform(p.id); refresh(); }} className="rounded-lg px-2 py-1 text-[11px] font-bold text-red-400/80 hover:bg-red-500/10">🗑</button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/8 bg-white/2 p-3.5">
        <div className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{editId ? (en ? "Edit" : "Modifier") : (en ? "New platform" : "Nouvelle plateforme")}</div>
        <label className="mb-1 block text-[11px] font-bold text-slate-400">{en ? "Name" : "Nom"}</label>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={en ? "Optional (taken from the address)" : "Facultatif (déduit de l'adresse)"} className={inputCls + " mb-2.5"} />
        <label className="mb-1 block text-[11px] font-bold text-slate-400">{en ? "Site address" : "Adresse du site"}</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="monsite.com" className={inputCls} spellCheck={false} />
        {!hasVars && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {[["auto", en ? "Automatic" : "Automatique", en ? "Finds each anime on the site by itself (recommended)" : "Trouve chaque animé sur le site tout seul (recommandé)"], ["slug", en ? "Add the name" : "Ajouter le nom", en ? "site.com/watch → site.com/watch/anime-name" : "site.com/watch → site.com/watch/nom-anime"]].map(([id, t1, t2]) => (
              <button key={id} type="button" onClick={() => setMode(id)} className="rounded-xl border p-2.5 text-left transition"
                style={mode === id ? { borderColor: "rgba(139,92,246,.7)", background: "rgba(124,58,237,.14)" } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                <div className="text-[11.5px] font-extrabold text-slate-100">{t1}</div><div className="mt-0.5 text-[10px] leading-snug text-slate-500">{t2}</div>
              </button>
            ))}
          </div>
        )}
        {preview && <div className="mt-2 break-all rounded-lg bg-black/25 px-2.5 py-1.5 text-[10.5px] text-slate-400"><span className="text-slate-600">{en ? "Example → " : "Exemple → "}</span>{preview}</div>}
        {err && <div className="mt-2 text-[11px] font-bold text-red-400">{err}</div>}
        <div className="mt-3 flex gap-2">
          <button onClick={submit} className="rounded-xl px-4 py-2 text-[12px] font-extrabold text-white" style={{ background: GRADIENT_PRIMARY }}>{editId ? (en ? "Save" : "Enregistrer") : (en ? "Add" : "Ajouter")}</button>
          {editId && <button onClick={() => { setEditId(null); setName(""); setUrl(""); setMode("auto"); setErr(""); }} className="rounded-xl border border-white/10 px-4 py-2 text-[12px] font-bold text-slate-300">{en ? "Cancel" : "Annuler"}</button>}
        </div>
      </div>

      <details className="mt-4 text-[11.5px] leading-relaxed text-slate-400">
        <summary className="cursor-pointer font-bold text-slate-300">{en ? "Sites with IDs in their links (Miruro…)" : "Sites avec des identifiants dans leurs liens (Miruro…)"}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{en ? "Variables you can put in the link:" : "Variables utilisables dans le lien :"}</p>
          <p><code className="text-violet-300">{"{slug}"}</code> {en ? "english-title-like-this" : "titre-anglais-comme-ceci"} · <code className="text-violet-300">{"{slug_jp}"}</code> {en ? "japanese title slug" : "titre japonais en slug"} · <code className="text-violet-300">{"{title}"}</code> {en ? "title for a search" : "titre pour une recherche"} · <code className="text-violet-300">{"{id}"}</code> {en ? "MyAnimeList id" : "id MyAnimeList"}</p>
          <p>{en ? "Search example: " : "Exemple de recherche : "}<code className="break-all text-violet-300">{"https://monsite.tld/search?q={title}"}</code></p>
          <p>{en ? "If a site uses a unique code per anime, open the anime on that site once, copy the link, then use the ✎ on its button (right-click) to paste it: it will be remembered for that anime."
                 : "Si un site met un code unique par animé, ouvre l'animé sur ce site, copie le lien, puis clique droit sur son bouton (ou ✎) pour le coller : il sera retenu pour cet animé."}</p>
        </div>
      </details>
    </Shell>
  );
}

/** Coller le lien exact d'un animé pour une plateforme. */
export function ExactLinkModal({ platform, anime, onClose, lang = "fr" }) {
  const en = lang === "en";
  const [v, setV] = useState(getExactLink(platform.id, anime)), [err, setErr] = useState("");
  const save = () => { if (v.trim() && !normaliseUrl(v)) return setErr(en ? "Invalid link." : "Lien invalide."); setExactLink(platform.id, anime, v); onClose(); };
  return (
    <Shell onClose={onClose} title={`${platform.name} · ${anime.title_english || anime.title}`} width={440}>
      <p className="mb-3 text-[12px] leading-relaxed text-slate-400">{en ? "Paste the exact link of this anime on this site. It will be used instead of the automatic link. Leave empty to go back to automatic."
        : "Colle le lien exact de cet animé sur ce site. Il sera utilisé à la place du lien automatique. Laisse vide pour revenir à l'automatique."}</p>
      <input autoFocus value={v} onChange={(e) => { setV(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="https://…" className={inputCls} spellCheck={false} />
      <div className="mt-2 break-all text-[10.5px] text-slate-500">{en ? "Automatic: " : "Automatique : "}{buildCustomUrl({ ...platform, id: "_none" }, anime)}</div>
      {err && <div className="mt-2 text-[11px] font-bold text-red-400">{err}</div>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} className="rounded-xl px-4 py-2 text-[12px] font-extrabold text-white" style={{ background: GRADIENT_PRIMARY }}>{en ? "Save" : "Enregistrer"}</button>
        <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-[12px] font-bold text-slate-300">{en ? "Cancel" : "Annuler"}</button>
      </div>
    </Shell>
  );
}
