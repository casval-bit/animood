// ─── Onglet « Grille » : grille personnalisable des meilleurs animés de 2026 ──────────────────────────────────────────────────────────
// Neuf cases par défaut (meilleure animation, OST, histoire, perso masculin, anime de l'année, perso féminin, méchant, surprise, déception) ;
// chaque case se renomme, se déplace ou se supprime, on peut en ajouter (12 au plus), et le même animé peut remplir plusieurs cases.
// Sauvegarde automatique sur l'appareil ; image PNG à télécharger, copier ou partager (la partie « édition » n'apparaît pas sur l'image).
import { useState, useEffect, useRef, useMemo } from "react";
import { useApp } from "../../context/useApp.js";
import { useLang } from "../../context/useLang.js";
import { awardsText } from "../../constants/awardsI18n.js";
import {
  readGrid, writeGrid, defaultGrid, setCellAnime, clearCell, renameCell, addCell, removeCell, moveCell, setGridTitle, cellLabel, gridFilledCount,
  animeName, MAX_GRID_CELLS, MAX_LABEL_LENGTH, MAX_TITLE_LENGTH,
} from "../../utils/awards2026.js";
import { renderToCanvas, downloadCanvas, copyCanvas, canShareImages, shareCanvas, safeFileName } from "../../utils/posterExport.js";
import { Poster } from "../Poster.jsx";

const safeLocal = () => { try { return window.localStorage; } catch { return null; } };
const ink = "#f5f3ff";             // texte clair sur la carte sombre (l'image exportée est identique en thème clair et sombre)
const muted = "rgba(245,243,255,0.62)";

const iconBtn = (disabled) => ({
  width: 34, height: 34, borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
  border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: ink, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
});
const toolBtn = (disabled) => ({
  minHeight: 36, padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", opacity: disabled ? 0.55 : 1,
  border: "1px solid rgba(var(--ac-8b5cf6),0.28)", background: "rgba(var(--ac-8b5cf6),0.1)", color: "rgb(var(--ac-c4b5fd))",
});

function Cell({ cell, index, count, labels, t, editing, onEdit, onDone, onPick, onClear, onRename, onMove, onRemove }) {
  const label = cellLabel(cell, labels) || t.newCellLabel;
  const baseLabel = cellLabel({ key: cell.key, label: null }, labels);        // nom d'origine de la catégorie ("" pour une case ajoutée)
  const [draft, setDraft] = useState(cell.label ?? baseLabel);
  // Le nom d'origine laissé tel quel ne devient pas un nom « choisi » (il suivrait alors mal un changement de langue)
  const saveName = () => onRename(draft.trim() === baseLabel ? "" : draft);
  const commit = () => { saveName(); onDone(); };
  return (
    <div data-testid="grid-cell" data-cell-id={cell.id} data-key={cell.key || ""} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      {editing ? (
        <div data-no-export="1" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <input autoFocus value={draft} maxLength={MAX_LABEL_LENGTH} aria-label={t.renameCell} data-testid="grid-cell-input"
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if(e.key === "Enter") commit(); if(e.key === "Escape") { e.stopPropagation(); onDone(); } }}
            style={{ width: "100%", boxSizing: "border-box", minHeight: 34, padding: "5px 8px", borderRadius: 8, fontSize: 12, fontWeight: 800, color: ink,
              border: "1px solid rgba(251,191,36,0.6)", background: "rgba(255,255,255,0.08)", outline: "none" }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { saveName(); onMove(-1); }} disabled={index === 0} aria-label={t.moveBefore} title={t.moveBefore} style={iconBtn(index === 0)}>‹</button>
            <button type="button" onClick={() => { saveName(); onMove(1); }} disabled={index === count - 1} aria-label={t.moveAfter} title={t.moveAfter} style={iconBtn(index === count - 1)}>›</button>
            <button type="button" onClick={onRemove} disabled={count <= 1} aria-label={t.removeCell} title={t.removeCell} data-testid="grid-cell-remove" style={{ ...iconBtn(count <= 1), color: "#fb7185" }}>🗑</button>
            <button type="button" onClick={commit} aria-label="OK" data-testid="grid-cell-done" style={{ ...iconBtn(false), background: "rgba(34,197,94,0.25)", borderColor: "rgba(34,197,94,0.6)" }}>✓</button>
          </div>
        </div>
      ) : (
        // Zone du nom : elle prend toute la hauteur libre de la rangée (les affiches restent alignées d'une case à l'autre, même quand un nom passe
        // sur 3 lignes dans une colonne étroite : « Meilleur perso masculin » à 320 px) et le texte reste collé à l'affiche. 3 lignes au plus.
        <div style={{ flex: "1 1 auto", display: "flex", alignItems: "flex-end", minHeight: 26 }}>
          <button type="button" onClick={() => { setDraft(cell.label ?? baseLabel); onEdit(); }} title={t.renameCell} aria-label={`${t.renameCell} : ${label}`} data-testid="grid-cell-label"
            style={{ display: "block", width: "100%", textAlign: "left", padding: 0, background: "none", border: "none", cursor: "text",
              fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", lineHeight: 1.25, color: "#fbbf24", overflow: "hidden", maxHeight: "3.75em" }}>
            {label}<span data-no-export="1" aria-hidden="true" style={{ marginLeft: 4, opacity: 0.55 }}>✎</span>
          </button>
        </div>
      )}
      <div style={{ position: "relative" }}>
        <button type="button" onClick={onPick} aria-label={`${label} — ${cell.anime ? animeName(cell.anime) : t.emptyCell}`} data-testid="grid-cell-poster"
          style={{ display: "block", width: "100%", aspectRatio: "2 / 3", padding: 0, borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative",
            border: cell.anime ? "1px solid rgba(251,191,36,0.55)" : "1.5px dashed rgba(255,255,255,0.28)", background: cell.anime ? "#1a1030" : "rgba(255,255,255,0.05)" }}>
          {cell.anime
            ? <Poster anime={cell.anime} name={animeName(cell.anime)} w={100} />
            : <span data-no-export="1" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: muted, fontSize: 11, fontWeight: 800 }}>
                <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>+</span>{t.emptyCell}
              </span>}
        </button>
        {cell.anime && (
          <button type="button" data-no-export="1" onClick={onClear} aria-label={`${t.clearCell} : ${label}`} title={t.clearCell} data-testid="grid-cell-clear"
            style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.65)", color: "#fff", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
        )}
      </div>
      <div data-testid="grid-cell-title" style={{ height: "2.5em", overflow: "hidden", fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, color: ink }}>{cell.anime ? animeName(cell.anime) : ""}</div>
    </div>
  );
}

export function GridPanel({ pickAnime }) {
  const { myUsername } = useApp();
  const { lang } = useLang();
  const t = awardsText(lang);
  const [grid, setGrid] = useState(() => readGrid(safeLocal(), myUsername));
  const [editing, setEditing] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(null);                 // "png" | "copied"
  const exportRef = useRef(null);
  const canShare = useMemo(() => canShareImages(), []);

  useEffect(() => { writeGrid(safeLocal(), myUsername, grid); }, [grid, myUsername]);

  const pick = async (cell) => {
    const row = await pickAnime({ title: cellLabel(cell, t.cellLabels) || t.newCellLabel });
    if(row) setGrid(g => setCellAnime(g, cell.id, row));
  };
  const add = () => {
    if(grid.cells.length >= MAX_GRID_CELLS) return;
    const next = addCell(grid, "");
    setGrid(next);
    setEditing(next.cells[next.cells.length - 1].id);                 // la nouvelle case s'ouvre directement en renommage
  };
  const reset = () => {
    if(!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return; }
    setConfirmReset(false); setEditing(null); setGrid(defaultGrid());
  };

  // ── Export ──
  const filled = gridFilledCount(grid);
  const fileName = `animood-grille-2026${grid.title ? `-${safeFileName(grid.title, "")}` : ""}.png`;
  const render = () => {
    const width = exportRef.current?.offsetWidth || 560;
    return renderToCanvas(exportRef.current, { backgroundColor: "#0f0a1e", scale: Math.min(4, Math.max(2, 1080 / width)) });
  };
  const run = async (kind) => {
    if(!exportRef.current || busy) return;
    setBusy("png"); setEditing(null);
    try {
      const canvas = await render();
      if(kind === "download") downloadCanvas(canvas, fileName);
      else if(kind === "copy") { await copyCanvas(canvas); setBusy("copied"); setTimeout(() => setBusy(null), 1600); return; }
      else await shareCanvas(canvas, { fileName, title: grid.title || t.gridTitlePh, text: t.shareText });
    } catch(e) { console.error(e); alert(t.exportError); }
    setBusy(null);
  };

  return (
    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <p style={{ margin: 0, maxWidth: 560, width: "100%", fontSize: 12, lineHeight: 1.5, color: "var(--text-3)" }}>{t.gridHint}</p>

      <div ref={exportRef} data-keep-bright="" data-testid="grid-card"
        style={{ width: "100%", maxWidth: 560, boxSizing: "border-box", padding: 16, borderRadius: 18, color: ink,
          background: "linear-gradient(160deg,#1c1140 0%,#0f0a1e 55%,#1f1336 100%)", border: "1px solid rgba(251,191,36,0.35)", boxShadow: "0 10px 34px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontWeight: 900, letterSpacing: 2.2, textTransform: "uppercase", color: "#fbbf24" }}>
          <span aria-hidden="true">🎆</span><span>AniMood 2026</span>
        </div>
        <input value={grid.title} maxLength={MAX_TITLE_LENGTH} onChange={e => setGrid(g => ({ ...g, title: e.target.value }))} onBlur={() => setGrid(g => setGridTitle(g, g.title))}
          placeholder={t.gridTitlePh} aria-label={t.gridTitleLabel} data-testid="grid-title"
          style={{ width: "100%", boxSizing: "border-box", margin: "4px 0 12px", padding: "2px 0", background: "none", border: "none", outline: "none", fontSize: 21, fontWeight: 900, letterSpacing: -0.4, color: ink }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {grid.cells.map((cell, i) => (
            <Cell key={cell.id} cell={cell} index={i} count={grid.cells.length} labels={t.cellLabels} t={t}
              editing={editing === cell.id} onEdit={() => setEditing(cell.id)} onDone={() => setEditing(null)}
              onPick={() => pick(cell)} onClear={() => setGrid(g => clearCell(g, cell.id))}
              onRename={(v) => setGrid(g => renameCell(g, cell.id, v))} onMove={(d) => setGrid(g => moveCell(g, cell.id, d))}
              onRemove={() => { setEditing(null); setGrid(g => removeCell(g, cell.id)); }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 9, letterSpacing: 1.8, fontWeight: 800, textTransform: "uppercase", color: muted }}>
          <span>{t.gridFilled(filled, grid.cells.length)}</span><span>animood.me</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%", maxWidth: 560, alignItems: "center" }}>
        {grid.cells.length < MAX_GRID_CELLS && <button type="button" onClick={add} data-testid="grid-add" style={{ ...toolBtn(false), borderStyle: "dashed" }}>{t.addCell}</button>}
        <button type="button" onClick={reset} data-testid="grid-reset" style={{ ...toolBtn(false), color: confirmReset ? "#fb7185" : "var(--text-4)" }}>{confirmReset ? t.resetGridSure : t.resetGrid}</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => run("copy")} disabled={!!busy} data-testid="grid-copy" style={toolBtn(!!busy)}>{busy === "copied" ? t.copied : `⧉ ${t.copy}`}</button>
        {canShare && <button type="button" onClick={() => run("share")} disabled={!!busy} data-testid="grid-share" style={toolBtn(!!busy)}>↗ {t.share}</button>}
        <button type="button" onClick={() => run("download")} disabled={!!busy} data-testid="grid-download"
          style={{ ...toolBtn(!!busy), border: "none", color: "#1f1300", background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}>{busy === "png" ? t.exporting : `⬇ ${t.download}`}</button>
      </div>
    </div>
  );
}
