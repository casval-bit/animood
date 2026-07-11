import { useState, useRef } from "react";
import { useApp } from "../constants.js";
import { saveProfile } from "../api/supabase.js";
import { parseMALXml } from "../constants.js";
// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({onLogout}) {
  const {me, setMe} = useApp();
  const [importStatus, setImportStatus] = useState(null);
  const [importStats, setImportStats]   = useState(null);
  const fileRef = useRef(null);

  const handleXmlImport = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    setImportStatus("importing");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { watched, ratings, statuses } = parseMALXml(ev.target.result);
        const merged = {
          ...me,
          watched: [...new Set([...me.watched, ...watched])],
          ratings: { ...me.ratings, ...ratings },
          statuses: { ...(me.statuses||{}), ...statuses },
        };
        setMe(merged);
        saveProfile("brice", merged);
        setImportStats({ watched: watched.length, rated: Object.keys(ratings).length });
        setImportStatus("done");
      } catch(err) {
        setImportStatus("error");
      }
    };
    reader.readAsText(file);
  };


  return (
    <div style={{flex:1,overflowY:"auto",padding:"18px 18px 100px"}}>
      <div style={{fontSize:"20px",fontWeight:900,color:"#f3f4f6",marginBottom:"24px"}}>⚙️ Paramètres</div>

      {/* Import MAL */}
      <Section title="📥 Importer ma liste MAL / AniList">
        <p style={{fontSize:"12px",color:"#6b7280",margin:"0 0 12px",lineHeight:1.6}}>
          Exporte ta liste depuis AniList (XML MAL) et importe-la ici. Les animés "Completed" seront ajoutés à ton historique avec leurs notes.
        </p>
        <input ref={fileRef} type="file" accept=".xml" onChange={handleXmlImport} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"13px",borderRadius:"12px",border:"2px dashed rgba(129,140,248,0.4)",background:"rgba(129,140,248,0.06)",color:"#818cf8",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
          {importStatus==="importing" ? "Import en cours…" : "📂 Choisir un fichier XML"}
        </button>
        {importStatus==="done"&&importStats&&(
          <div style={{marginTop:"10px",background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:"10px",padding:"10px 12px",fontSize:"12px",color:"#34D399"}}>
            ✅ Import réussi — {importStats.watched} animés importés · {importStats.rated} notes récupérées
          </div>
        )}
        {importStatus==="error"&&(
          <div style={{marginTop:"10px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"10px",padding:"10px 12px",fontSize:"12px",color:"#ef4444"}}>
            ❌ Erreur lors de l'import — vérifie que le fichier est bien un XML MAL/AniList
          </div>
        )}
      </Section>

      {/* Stats */}
      <Section title="📊 Mes statistiques">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
          {[
            {l:"Vus",v:me.watched.length},
            {l:"Notés",v:Object.keys(me.ratings).length},
            {l:"Moy.",v:Object.keys(me.ratings).length?(Object.values(me.ratings).reduce((a,r)=>a+r.score,0)/Object.keys(me.ratings).length).toFixed(1):"—"},
          ].map(s=>(
            <div key={s.l} style={{background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"12px",textAlign:"center",border:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:"20px",fontWeight:900,color:"#c084fc"}}>{s.v}</div>
              <div style={{fontSize:"10px",color:"#6b7280",marginTop:"2px"}}>{s.l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Logout */}
      <Section title="🚪 Déconnexion">
        <button onClick={onLogout} style={{width:"100%",padding:"13px",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.06)",color:"#ef4444",fontWeight:700,fontSize:"14px",cursor:"pointer"}}>
          Se déconnecter
        </button>
      </Section>
    </div>
  );
}

function Section({title,children}) {
  return (
    <div style={{marginBottom:"24px"}}>
      <div style={{fontSize:"11px",fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"1px",marginBottom:"12px"}}>{title}</div>
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:"14px",padding:"16px",border:"1px solid rgba(255,255,255,0.06)"}}>{children}</div>
    </div>
  );
}


export { SettingsPage, Section };
