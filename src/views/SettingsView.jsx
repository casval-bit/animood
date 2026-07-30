import { useState, useRef } from "react";
import { useApp } from "../context/useApp.js";
import { parseMALXml } from "../constants/mal-import.js";
import { importAniListUser } from "../api/anilist.js";
import { GradientButton } from "../components/ui.jsx";

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="rounded-2xl border border-white/6 bg-white/3 p-4">{children}</div>
    </div>
  );
}

export function SettingsView({ onClose }) {
  const { me, saveMe, logout } = useApp();
  const [importStatus, setImportStatus] = useState(null);
  const [importStats, setImportStats]   = useState(null);
  const [importError, setImportError]   = useState(null);
  const fileRef = useRef(null);

  const [alUsername, setAlUsername] = useState("");
  const [alStatus, setAlStatus]     = useState(null);
  const [alStats, setAlStats]       = useState(null);
  const [alError, setAlError]       = useState(null);

  const mergeImport = ({ watched, ratings, statuses, customLists }) => {
    const mergedSubLists = { ...(me.anilistSubLists||{}) };
    Object.entries(customLists||{}).forEach(([malId, names]) => {
      mergedSubLists[malId] = [...new Set([...(mergedSubLists[malId]||[]), ...names])];
    });
    saveMe({
      ...me,
      watched: [...new Set([...me.watched, ...watched])],
      ratings: { ...me.ratings, ...ratings },
      statuses: { ...(me.statuses||{}), ...statuses },
      anilistSubLists: mergedSubLists,
    });
  };

  const handleXmlImport = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImportStatus("importing"); setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watched, ratings, statuses } = parseMALXml(ev.target.result);
        mergeImport({ watched, ratings, statuses });
        setImportStats({ watched: watched.length, rated: Object.keys(ratings).length });
        setImportStatus("done");
      } catch(err) {
        setImportError(err.message);
        setImportStatus("error");
      }
    };
    reader.readAsText(file);
  };

  const handleAniListImport = async () => {
    setAlStatus("importing"); setAlError(null);
    try {
      const { watched, ratings, statuses, customLists, skipped } = await importAniListUser(alUsername);
      mergeImport({ watched, ratings, statuses, customLists });
      const listNames = new Set(Object.values(customLists||{}).flat());
      setAlStats({ watched: Object.keys(statuses).length, rated: Object.keys(ratings).length, lists: listNames.size, skipped });
      setAlStatus("done");
    } catch(err) {
      setAlError(err.message);
      setAlStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-400 flex flex-col backdrop-blur-2xl" style={{ background: "rgba(7,11,23,.92)" }}>
      <div className="flex items-center gap-3 border-b border-white/6 px-6 py-4">
        <button onClick={onClose} className="text-xl text-slate-400">←</button>
        <span className="text-base font-black text-slate-100">Paramètres</span>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6">
        <Section title="📥 Importer depuis AniList">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Entre ton pseudo AniList — ta liste doit être publique. Les animés "Completed" seront ajoutés à ton historique avec leurs notes, et tes sous-listes perso (custom lists) seront récupérées pour filtrer ton journal.
          </p>
          <div className="flex gap-2">
            <input value={alUsername} onChange={e => setAlUsername(e.target.value)}
              onKeyDown={e => e.key==="Enter" && alUsername.trim() && handleAniListImport()}
              placeholder="Pseudo AniList…" disabled={alStatus==="importing"}
              className="flex-1 rounded-xl border border-white/10 bg-white/6 px-3.5 py-3 text-sm text-slate-100 outline-none disabled:opacity-50" />
            <GradientButton onClick={handleAniListImport} disabled={alStatus==="importing"||!alUsername.trim()} className="shrink-0 px-4.5 py-3 text-[13px]">
              {alStatus==="importing" ? "…" : "Importer"}
            </GradientButton>
          </div>
          {alStatus==="done" && alStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              ✅ Import réussi — {alStats.watched} animés importés · {alStats.rated} notes récupérées
              {alStats.lists>0 && ` · ${alStats.lists} sous-liste${alStats.lists!==1?"s":""} perso récupérée${alStats.lists!==1?"s":""}`}
              {alStats.skipped>0 && ` · ${alStats.skipped} ignorés (pas de fiche MAL)`}
            </div>
          )}
          {alStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {alError||"Erreur lors de l'import"}</div>
          )}
        </Section>

        <Section title="📥 Importer un fichier XML (MyAnimeList)">
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            MyAnimeList ne permet pas l'import direct par pseudo — exporte ta liste au format XML depuis ton profil MAL et importe-la ici.
          </p>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleXmlImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-indigo-400/40 bg-indigo-400/6 py-3.5 text-sm font-bold text-indigo-300">
            {importStatus==="importing" ? "Import en cours…" : "📂 Choisir un fichier XML"}
          </button>
          {importStatus==="done" && importStats && (
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5 text-xs text-emerald-400">
              ✅ Import réussi — {importStats.watched} animés importés · {importStats.rated} notes récupérées
            </div>
          )}
          {importStatus==="error" && (
            <div className="mt-2.5 rounded-lg border border-red-400/20 bg-red-400/8 px-3 py-2.5 text-xs text-red-400">❌ {importError||"Erreur lors de l'import — vérifie que le fichier est bien un XML MAL"}</div>
          )}
        </Section>

        <Section title="📊 Mes statistiques">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {l:"Vus",v:me.watched.length},
              {l:"Notés",v:Object.keys(me.ratings).length},
              {l:"Moy.",v:Object.keys(me.ratings).length ? (Object.values(me.ratings).reduce((a,r)=>a+r.score,0)/Object.keys(me.ratings).length).toFixed(1) : "—"},
            ].map(s => (
              <div key={s.l} className="rounded-xl border border-white/7 bg-white/4 py-3 text-center">
                <div className="text-xl font-black text-purple-300">{s.v}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{s.l}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="🚪 Déconnexion">
          <button onClick={logout} className="w-full rounded-xl border border-red-400/30 bg-red-400/6 py-3.5 text-sm font-bold text-red-400">
            Se déconnecter
          </button>
        </Section>
      </div>
    </div>
  );
}
