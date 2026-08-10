import { useState, useEffect } from "react";
import { sb } from "../api/supabase.js";

const MENTION_RE = /(?<=^|\s)(@[a-zA-Z0-9_]{2,20})/g;
const TRAILING_MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_]{1,20})$/;

// ─── Renders text with @username turned into clickable spans ──────────────────
// Returns an array of strings/elements — drop it straight inside whatever
// element already carries the text styling (e.g. a <p> with whiteSpace: pre-wrap).
export function MentionText({ text, onOpenUser }) {
  if(!text) return null;
  return text.split(MENTION_RE).map((part, i) => {
    const m = /^@([a-zA-Z0-9_]{2,20})$/.exec(part);
    if(!m) return part;
    return (
      <span key={i} role="button"
        onClick={e => { e.stopPropagation(); onOpenUser?.(m[1]); }}
        style={{ color: "#818cf8", fontWeight: 700, cursor: onOpenUser ? "pointer" : "inherit" }}>
        {part}
      </span>
    );
  });
}

// ─── Autocomplete for a composer — watches the trailing "@word" in a text
// value and resolves matching usernames. Deliberately simple: only completes
// a mention typed at the end of the text, not mid-sentence (covers the common
// case without needing to track caret position across differently-styled inputs).
export function useMentionAutocomplete(value, myUsername) {
  const [suggestions, setSuggestions] = useState([]);
  const match = TRAILING_MENTION_RE.exec(value || "");
  const query = match ? match[1] : null;

  useEffect(() => {
    if(query === null) { setSuggestions([]); return; }
    let cancelled = false;
    const enc = encodeURIComponent(query);
    const t = setTimeout(() => {
      sb.query(`profiles?or=(name.ilike.*${enc}*,username.ilike.${enc}*)&select=username,name,avatar&limit=6`)
        .then(rows => { if(!cancelled) setSuggestions((rows||[]).filter(r => r.username !== myUsername)); })
        .catch(() => { if(!cancelled) setSuggestions([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, myUsername]);

  const applyMention = (currentValue, username) => {
    if(query === null) return currentValue;
    return currentValue.slice(0, currentValue.length - query.length) + username + " ";
  };

  return { suggestions, applyMention, active: query !== null };
}

// ─── Dropdown list for the above — caller positions it (relative wrapper) ─────
export function MentionSuggestions({ suggestions, onPick }) {
  if(!suggestions.length) return null;
  return (
    <div style={{
      position: "absolute", zIndex: 50, marginTop: 4, minWidth: 190,
      background: "var(--surface-1-strong)", border: "1px solid rgba(var(--fg-rgb),0.1)",
      borderRadius: 10, padding: 4, boxShadow: "var(--shadow-modal)",
    }}>
      {suggestions.map(s => (
        <button key={s.username} onClick={() => onPick(s.username)}
          style={{ display: "flex", alignItems: "baseline", gap: 6, width: "100%", padding: "6px 8px",
            background: "none", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--fg-rgb),0.06)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{s.name || s.username}</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>@{s.username}</span>
        </button>
      ))}
    </div>
  );
}
