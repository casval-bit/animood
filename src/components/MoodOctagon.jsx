const KEYS = ["emotional","happy","hype","dark","chill","twisted","in_love","thrills"];

const MOOD_META = {
  emotional:{emoji:"💔",color:"#A78BFA",label:"Emotional"},
  happy:    {emoji:"✨",color:"#FFD93D",label:"Happy"},
  hype:     {emoji:"⚡",color:"#F97316",label:"Hype"},
  dark:     {emoji:"🩸",color:"#EF4444",label:"Dark"},
  chill:    {emoji:"🌿",color:"#34D399",label:"Chill"},
  twisted:  {emoji:"🌀",color:"#06B6D4",label:"Twisted"},
  in_love:  {emoji:"🌸",color:"#F9A8D4",label:"In Love"},
  thrills:  {emoji:"🎢",color:"#FB923C",label:"Thrills"},
};

export function MoodOctagon({ pts }) {
  const size = 340, center = 170, levels = [25,50,75,100];

  // thrills is stored on a 0-33 scale — normalize to 0-100 for display only
  const displayPts = { ...(pts||{}) };
  if(displayPts.thrills !== undefined) displayPts.thrills = Math.round((displayPts.thrills / 33) * 100);

  const gridMaxR = 122;

  // Dominant mood is pinned to the outer ring (100%); every other axis is
  // normalized relative to it, so the shape always reads clearly even when
  // every raw pts value is small.
  const dominant = Object.entries(pts||{}).filter(([k]) => k!=="thrills").sort((a,b) => b[1]-a[1])[0]?.[0] || "hype";
  const dominantMeta = MOOD_META[dominant] || {emoji:"❔", color:"#818cf8"};
  const fillColor = dominantMeta.color;
  const dominantVal = displayPts[dominant] || 0;

  const ptsList = KEYS.map((k, i) => {
    const angle = (Math.PI*2*i/KEYS.length) - Math.PI/2;
    const v = dominantVal > 0 ? Math.min((displayPts[k] || 0) / dominantVal, 1) * 100 : 0;
    const r = (v/100) * gridMaxR;
    return {
      key: k,
      x: center + Math.cos(angle)*r,
      y: center + Math.sin(angle)*r,
      lx: center + Math.cos(angle)*(gridMaxR+30),
      ly: center + Math.sin(angle)*(gridMaxR+30),
      meta: MOOD_META[k] || {emoji:"?", color:"#818cf8"},
    };
  });

  const polygon = ptsList.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
      <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Profil émotionnel
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[340px]">
        {levels.map(lvl => {
          const gPts = KEYS.map((_, i) => {
            const a = (Math.PI*2*i/KEYS.length) - Math.PI/2;
            return `${center+Math.cos(a)*(lvl/100)*gridMaxR},${center+Math.sin(a)*(lvl/100)*gridMaxR}`;
          }).join(" ");
          return <polygon key={lvl} points={gPts} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        {KEYS.map((_, i) => {
          const a = (Math.PI*2*i/KEYS.length) - Math.PI/2;
          return <line key={i} x1={center} y1={center} x2={center+Math.cos(a)*gridMaxR} y2={center+Math.sin(a)*gridMaxR} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>;
        })}
        <polygon points={polygon} fill={`${fillColor}28`} stroke={fillColor} strokeWidth="2.5" strokeLinejoin="round"/>
        {ptsList.map(p => (
          <text key={p.key} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle" fontSize="16">{p.meta.emoji}</text>
        ))}
      </svg>
    </div>
  );
}
