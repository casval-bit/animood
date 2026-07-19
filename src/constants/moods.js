// ─── MOOD AXES ────────────────────────────────────────────────────────────────
export const MOOD_KEYS = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];

export const MOODS = [
  {id:"emotional", label:"Emotional", emoji:"💔", color:"#A78BFA"},
  {id:"happy",     label:"Happy",     emoji:"✨", color:"#FFD93D"},
  {id:"hype",      label:"Hype",      emoji:"⚡", color:"#F97316"},
  {id:"dark",      label:"Dark",      emoji:"🩸", color:"#EF4444"},
  {id:"chill",     label:"Chill",     emoji:"🌿", color:"#34D399"},
  {id:"twisted",   label:"Twisted",   emoji:"🌀", color:"#06B6D4"},
  {id:"in_love",   label:"In Love",   emoji:"🌸", color:"#F9A8D4"},
  {id:"thrills",   label:"Thrills",   emoji:"🎢", color:"#FB923C"},
];

export const getMoodObj = id => MOODS.find(m => m.id === id);
