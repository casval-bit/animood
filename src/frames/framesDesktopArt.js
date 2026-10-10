// Les cadres d'origine (frames.js) restent tels quels. Ici : 11 cadres supplémentaires aux FORMES et EFFETS variés
// (losange, sortilège, foudre, brasier, rétro, steampunk, prestige, blush, glitch, orbite, néant) — lumière,
// glitch, distorsion. Repère 0‒100 (l'avatar = disque centré en 50,50 de rayon 50), mis à l'échelle par wrap().

const P = (n) => Math.round(n * 100) / 100;
const rd = (d) => (d * Math.PI) / 180;
const ptc = (r, a) => [P(50 + r * Math.cos(rd(a))), P(50 + r * Math.sin(rd(a)))];
const arcD = (r, a0, a1) => {
  const [x0, y0] = ptc(r, a0), [x1, y1] = ptc(r, a1);
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}`;
};
const an = (attr, values, dur, begin = 0, extra = "") =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}s" begin="${P(begin)}s" repeatCount="indefinite" ${extra}/>`;
const tr = (type, values, dur, begin = 0, extra = "") =>
  `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}s" begin="${P(begin)}s" repeatCount="indefinite" ${extra}/>`;
const mo = (path, dur, begin = 0, extra = "") =>
  `<animateMotion path="${path}" dur="${dur}s" begin="${P(begin)}s" repeatCount="indefinite" ${extra}/>`;
const at = (x, y, rot = 0, sc = 1, inner = "") => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
const radial = (a, r, inner) => { const [x, y] = ptc(r, a); return at(x, y, a + 90, 1, inner); };
const wrap = (s, defs, body) => `<defs>${defs}</defs><g transform="scale(${P(s / 100)})">${body}</g>`;
const glowF = (id, sd) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const lg = (id, stops, x2 = 1, y2 = 1) => typeof stops === "string" ? lg(id, [[0, stops], [1, x2]], 1, 1) : `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

const STAR4 = "M0,-5L1.2,-1.2L5,0L1.2,1.2L0,5L-1.2,1.2L-5,0L-1.2,-1.2Z";
const HEART = "M0,3.2C-5.2,-.6 -3.6,-5 0,-2C3.6,-5 5.2,-.6 0,3.2Z";
const spark = (x, y, sz, col, dur = 2, begin = 0) =>
  `<g transform="translate(${x} ${y})"><g>${tr("scale", "0 0;1 1;0 0", dur, begin)}<path d="${STAR4}" transform="scale(${sz})" fill="${col}"/></g></g>`;
const heart = (x, y, sz, col, extra = "") => `<g transform="translate(${x} ${y})"><g>${extra}<path d="${HEART}" transform="scale(${sz})" fill="${col}"/></g></g>`;

// Flamme à trois couches qui vacille — la base est en (x,y), la pointe monte (avant rotation)
const flame = (x, y, w, h, rot = 0, dur = 1.1, begin = 0, pal = ["#dc2626", "#f97316", "#fde047"]) => {
  const sh = (ww, hh) => `M${P(-ww / 2)},0C${P(-ww / 2)},${P(-hh * 0.4)} ${P(-ww * 0.14)},${P(-hh * 0.56)} ${P(ww * 0.02)},${-hh}C${P(ww * 0.12)},${P(-hh * 0.58)} ${P(ww / 2)},${P(-hh * 0.4)} ${P(ww / 2)},0Q0,${P(hh * 0.16)} ${P(-ww / 2)},0Z`;
  const layer = (ww, hh, col, b) => `<path d="${sh(P(ww), P(hh))}" fill="${col}">${tr("scale", "1 1;.86 1.14;1.08 .9;1 1", dur, begin + b)}</path>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><g>${tr("rotate", "-4 0 0;4 0 0;-4 0 0", dur * 2.2, begin)}${layer(w, h, pal[0], 0)}${layer(w * 0.66, h * 0.72, pal[1], 0.15)}${layer(w * 0.34, h * 0.46, pal[2], 0.3)}</g></g>`;
};

// Éclair irrégulier (le tracé change à chaque scintillement)
const boltD = (x1, y1, x2, y2, seed, segs = 6, amp = 4) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  let d = `M${x1},${y1}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs, o = i === segs ? 0 : Math.sin(seed * 12.9898 + i * 78.233) * amp;
    d += `L${P(x1 + dx * t + nx * o)},${P(y1 + dy * t + ny * o)}`;
  }
  return d;
};
const bolt = (x1, y1, x2, y2, seed, col, begin = 0, segs = 6, amp = 4, w = 1.1) => {
  const ds = [0, 3.7, 8.1].map((o) => boltD(x1, y1, x2, y2, seed + o, segs, amp));
  const vals = `${ds[0]};${ds[1]};${ds[2]};${ds[0]}`;
  return `<g>${an("opacity", "0;1;.25;1;0;0", 1.7, begin, 'keyTimes="0;.06;.13;.2;.34;1"')}
    <path d="${ds[0]}" fill="none" stroke="${col}" stroke-width="${P(w * 3)}" stroke-linecap="round" stroke-linejoin="round" opacity=".45">${an("d", vals, 0.34, begin)}</path>
    <path d="${ds[0]}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${an("d", vals, 0.34, begin)}</path></g>`;
};

// ── utilitaires locaux ──────────────────────────────────────────────────────
const fGlow = (id, sd = 1.4) => glowF(id, sd);
const turb = (id, freq, scale, dur = 3) =>
  `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="3" result="n">${an("baseFrequency", `${freq};${P(freq * 1.5)};${freq}`, dur)}</feTurbulence><feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
const spin = (dur, dir = 1, a0 = 0) => tr("rotate", `${a0} 50 50;${a0 + 360 * dir} 50 50`, dur);
const star = (x, y, sz, col, dur = 2.4, begin = 0) => spark(x, y, sz, col, dur, begin);
const gear = (cx, cy, R, teeth, id, dir = 1, dur = 8) => {
  const ri = R * 0.78, n = teeth * 4;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360, r = (i % 4 === 1 || i % 4 === 2) ? R : ri;
    const [x, y] = [P(r * Math.cos(rd(a))), P(r * Math.sin(rd(a)))];
    d += (i ? "L" : "M") + x + "," + y;
  }
  return `<g transform="translate(${cx} ${cy})"><g>${tr("rotate", `0;${360 * dir}`, dur)}<path d="${d}Z" fill="url(#${id})" stroke="#3b1d08" stroke-width=".9" stroke-linejoin="round"/><circle r="${P(R * 0.4)}" fill="#1c0f05" stroke="#fcd9a0" stroke-width=".8"/><circle r="${P(R * 0.14)}" fill="#fcd9a0"/></g></g>`;
};
const rune = (i) => ["M0,-4V4M0,-4L3,-1M0,0L3,3", "M0,-4V4M0,-4L3,-2L0,0", "M0,-4V4M-3,-2L0,0L3,-2", "M-2,-4V4M-2,-4L2,0L-2,4", "M0,-4L-3,0L0,4M0,-4L3,0L0,4", "M-3,-4L3,4M3,-4L-3,4", "M0,-4V4M-3,-1L0,-4L3,-1"][i % 7];

export const ART = {
  // ═══ LOSANGE — cadre à pointes qui dépassent, lumière qui court sur le contour ═══
  ds_diamond: (s) => {
    const pts = (h) => `50,${50 - h} ${50 + h},50 50,${50 + h} ${50 - h},50`;
    const tips = [[50, -16], [116, 50], [50, 116], [-16, 50]];
    return wrap(s, lg("dd", "#a5f3fc", "#8b5cf6") + fGlow("ddg", 1.2),
      `<polygon points="${pts(66)}" fill="none" stroke="url(#dd)" stroke-width="2.8" stroke-linejoin="round" filter="url(#ddg)"/>` +
      `<polygon points="${pts(59)}" fill="none" stroke="#c4b5fd" stroke-width=".8" stroke-dasharray="2 3.2" opacity=".6"/>` +
      `<circle cx="50" cy="50" r="51" fill="none" stroke="url(#dd)" stroke-width="1.3" opacity=".65"/>` +
      `<polygon points="${pts(66)}" pathLength="100" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="9 91" filter="url(#ddg)">${an("stroke-dashoffset", "100;0", 3.4)}</polygon>` +
      tips.map(([x, y], i) => `<g transform="translate(${x} ${y}) rotate(45)"><rect x="-3.6" y="-3.6" width="7.2" height="7.2" rx="1" fill="#0b0d1f" stroke="#e0f2fe" stroke-width="1.1">${an("stroke-opacity", ".5;1;.5", 2.4, i * 0.6)}</rect><rect x="-1.8" y="-1.8" width="3.6" height="3.6" fill="#a5b4fc"/></g>`).join("") +
      star(10, 10, 0.55, "#e0e7ff", 2.8, 0.4) + star(92, 90, 0.55, "#e0e7ff", 2.8, 1.6));
  },

  // ═══ SORTILÈGE — cercle magique : runes, double triangle, halo violet ═══
  ds_spell: (s) => {
    let runes = "";
    for (let i = 0; i < 28; i++) { const [x, y] = ptc(58, i * (360 / 28)); runes += `<g transform="translate(${x} ${y}) rotate(${P(i * (360 / 28) + 90)}) scale(.62)"><path d="${rune(i * 3 + 1)}" fill="none" stroke="#f0abfc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`; }
    const tri = (rot) => { const p = [0, 120, 240].map((a) => ptc(55, a + rot).join(",")).join(" "); return `<polygon points="${p}" fill="none" stroke="#c084fc" stroke-width=".8" stroke-linejoin="round"/>`; };
    return wrap(s, fGlow("spg", 1.6),
      `<circle cx="50" cy="50" r="51.5" fill="none" stroke="#a855f7" stroke-width="2" filter="url(#spg)">${an("opacity", ".55;1;.55", 3.2)}</circle>` +
      `<circle cx="50" cy="50" r="54.6" fill="none" stroke="#e9d5ff" stroke-width=".7" opacity=".75"/><circle cx="50" cy="50" r="62" fill="none" stroke="#e9d5ff" stroke-width=".7" opacity=".5"/>` +
      `<g opacity=".95">${runes}${spin(70)}</g>` +
      `<g opacity=".6">${tri(-90)}${tri(90)}${spin(36, -1)}</g>` +
      `<circle cx="50" cy="50" r="62" fill="none" stroke="#f0abfc" stroke-width="1.2" stroke-dasharray="1 7.5" stroke-linecap="round" opacity=".9">${an("stroke-dashoffset", "0;-17", 2.2)}</circle>` +
      star(2, 14, 0.7, "#f5d0fe", 2.2) + star(98, 82, 0.7, "#f5d0fe", 2.2, 1.1) + star(86, 4, 0.5, "#fff", 1.9, 0.6));
  },

  // ═══ FOUDRE — arcs électriques qui jaillissent, ring qui grésille ═══
  ds_lightning: (s) => {
    const arcs = [[25, 0], [85, 0.5], [145, 1.1], [205, 0.3], [265, 0.9], [325, 1.4]].map(([a, b], i) => {
      const [x1, y1] = ptc(52.5, a), [x2, y2] = ptc(70, a + (i % 2 ? 10 : -10));
      return bolt(x1, y1, x2, y2, i * 3.7 + 1, "#7dd3fc", b, 6, 4.6, 1.15);
    }).join("");
    const ring = [0, 1, 2].map((k) => { const [x1, y1] = ptc(51, k * 120 + 30), [x2, y2] = ptc(51, k * 120 + 100); return bolt(x1, y1, x2, y2, k * 5.3 + 2, "#bae6fd", k * 0.57, 9, 1.8, 0.9); }).join("");
    return wrap(s, fGlow("ltg", 1.5) + lg("lt", "#e0f2fe", "#38bdf8"),
      `<circle cx="50" cy="50" r="51.4" fill="none" stroke="url(#lt)" stroke-width="2" filter="url(#ltg)">${an("opacity", "1;.55;1;.8;1;1", 1.3, 0, 'keyTimes="0;.1;.2;.28;.4;1"')}</circle>` +
      `<circle cx="50" cy="50" r="64" fill="#bae6fd" opacity="0">${an("opacity", "0;.1;0;.06;0;0", 1.7, 0, 'keyTimes="0;.06;.13;.2;.34;1"')}</circle>` + ring + arcs +
      star(100, 8, 0.6, "#e0f2fe", 1.6) + star(-2, 88, 0.6, "#e0f2fe", 1.6, 0.8));
  },

  // ═══ BRASIER — couronne de flammes qui s'élèvent, braises, chaleur qui ondule ═══
  ds_flames: (s) => {
    const fl = [];
    for (let a = 0; a < 360; a += 13) {
      const out = a + 90, dev = ((((0 - out) % 360) + 540) % 360) - 180; // écart vers la verticale (-180..180)
      const rot = out + dev * 0.5, up = Math.max(0, -Math.sin(rd(a))); // 1 en haut, 0 en bas
      const [x, y] = ptc(48.5, a);
      fl.push(flame(x, y, P(9 + 3.5 * up), P(15 + 12 * up), P(rot), 0.9 + (fl.length % 4) * 0.13, (fl.length * 0.17) % 1));
    }
    const emb = [[34, 30, 3.2, 0], [66, 24, 2.8, 1.1], [18, 36, 2.6, 0.6], [82, 32, 3, 1.7], [50, 14, 2.4, 2]].map(([x, y, d, b]) =>
      `<circle cx="${x}" cy="${y}" r=".95" fill="#fde047"><animate attributeName="cy" values="${y};${y - 30}" dur="${d}s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${d}s" begin="${b}s" repeatCount="indefinite"/></circle>`).join("");
    return wrap(s, lg("fl", "#fde047", "#dc2626") + turb("flt", 0.045, 2.6, 2.4) + fGlow("flg", 1.6),
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#fl)" stroke-width="3" filter="url(#flg)"/>` +
      `<g filter="url(#flt)">${fl.join("")}</g>${emb}`);
  },

  // ═══ RÉTRO — cadre arcade : pixels LED, balayage CRT, tranche qui glitche ═══
  ds_retro: (s) => {
    const led = (y, off) => Array.from({ length: 11 }, (_, i) => `<rect x="${P(-1 + i * 10.4)}" y="${y}" width="3.6" height="3.6" fill="${i % 2 ? "#22d3ee" : "#f0abfc"}">${an("opacity", ".25;1;.25", 1.6, (i * 0.15 + off) % 1.6, 'calcMode="discrete"')}</rect>`).join("");
    const br = (x, y, sx, sy) => `<path d="M${x},${y + sy * 14}V${y}H${x + sx * 14}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="square"/>`;
    const frame = (col, w, extra = "") => `<rect x="-8" y="-8" width="116" height="116" rx="14" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`;
    return wrap(s, lg("rt", "#f0abfc", "#22d3ee") + `<clipPath id="rtb"><rect x="-20" y="22" width="140" height="9"/></clipPath>`,
      frame("url(#rt)", 3) + frame("#22d3ee", 1, 'opacity=".45" transform="translate(1.6 0)"') + frame("#f472b6", 1, 'opacity=".45" transform="translate(-1.6 0)"') +
      br(-8, -8, 1, 1) + br(108, -8, -1, 1) + br(-8, 108, 1, -1) + br(108, 108, -1, -1) +
      `<g transform="translate(0 -11)">${led(0, 0)}</g><g transform="translate(0 109)">${led(0, 0.7)}</g>` +
      `<g clip-path="url(#rtb)"><g>${tr("translate", "0 0;0 0;7 0;-5 0;0 0;0 0", 4.2, 0, 'keyTimes="0;.7;.74;.78;.82;1" calcMode="discrete"')}${frame("#22d3ee", 3.2)}</g></g>` +
      `<rect x="-8" y="-8" width="116" height="1.6" fill="#fff" opacity=".28">${an("y", "-8;108", 3.6)}</rect>`);
  },

  // ═══ STEAMPUNK — anneau de laiton riveté, engrenages qui tournent, vapeur ═══
  ds_steampunk: (s) => {
    const rivets = Array.from({ length: 16 }, (_, i) => { const [x, y] = ptc(51.5, i * 22.5); return `<circle cx="${x}" cy="${y}" r="1.15" fill="#fde68a" stroke="#5b2f0a" stroke-width=".4"/>`; }).join("");
    const puff = (x, b) => `<circle cx="${x}" cy="0" r="2"><animate attributeName="cy" values="4;-26" dur="3.2s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="r" values="1.6;5.5" dur="3.2s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".0;.55;0" dur="3.2s" begin="${b}s" repeatCount="indefinite"/></circle>`;
    const [gx1, gy1] = ptc(55, 138), [gx2, gy2] = ptc(54, -42), [gx3, gy3] = ptc(52, 22);
    return wrap(s, lg("sp", "#fde7b0", "#b45309") + lg("spg2", "#fcd9a0", "#92400e"),
      `<circle cx="50" cy="50" r="51.4" fill="none" stroke="url(#sp)" stroke-width="5"/><circle cx="50" cy="50" r="48.6" fill="none" stroke="#3b1d08" stroke-width=".9" opacity=".6"/><circle cx="50" cy="50" r="54" fill="none" stroke="#fff7e0" stroke-width=".6" opacity=".35"/>` +
      rivets + gear(gx1, gy1, 14, 12, "spg2", 1, 14) + gear(gx2, gy2, 9, 9, "spg2", -1, 9.5) + gear(gx3, gy3, 6, 7, "spg2", -1, 6.5) +
      `<g transform="translate(${gx2 + 6} ${gy2 - 6})" fill="#e5e7eb">${puff(0, 0)}${puff(5, 1.1)}${puff(-4, 2.1)}</g>`);
  },

  // ═══ PRESTIGE — couronne de laurier dorée, gemme sommitale, reflets ═══
  ds_prestige: (s) => {
    const leaf = (a, side) => { const [x, y] = ptc(57, a); return `<g transform="translate(${x} ${y}) rotate(${P(a + 90 + (side ? -28 : 28))})"><path d="M0,-5C3.2,-2.6 3.2,2.6 0,5C-3.2,2.6 -3.2,-2.6 0,-5Z" fill="url(#pg)" stroke="#92400e" stroke-width=".35"/><path d="M0,-4V4" stroke="#fff7d6" stroke-width=".5" opacity=".7"/></g>`; };
    let leaves = "";
    for (let i = 0; i < 8; i++) { leaves += leaf(108 - i * 11.5, 0) + leaf(72 + i * 11.5, 1); }
    return wrap(s, lg("pg", "#fff7d6", "#d97706") + lg("pgr", "#fff1b8", "#b45309") + fGlow("pgg", 1.3),
      `<circle cx="50" cy="50" r="52" fill="none" stroke="url(#pgr)" stroke-width="3" filter="url(#pgg)"/><circle cx="50" cy="50" r="47.6" fill="none" stroke="#fde68a" stroke-width=".8" opacity=".7"/>` +
      leaves +
      `<g transform="translate(50 -7)"><g>${tr("scale", "1;1.12;1", 2.6)}<path d="M0,-8L7,0L0,8L-7,0Z" fill="#0b0d1f" stroke="url(#pgr)" stroke-width="1.6"/><path d="M0,-4.6L4,0L0,4.6L-4,0Z" fill="#fde68a"/></g></g>` +
      `<g transform="translate(50 -7)"><g>${tr("rotate", "0;360", 7)}<circle r="12" fill="none" stroke="#fff7d6" stroke-width=".7" stroke-dasharray="1 5" opacity=".8"/></g></g>` +
      `<g>${spin(5)}<path d="${arcD(52, -30, 25)}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/></g>` +
      star(14, 2, 0.8, "#fff7d6", 2.4) + star(88, 6, 0.65, "#fff7d6", 2.4, 1.2) + star(50, 108, 0.7, "#fff7d6", 2.4, 0.6));
  },

  // ═══ BLUSH — anneau rose pâle, joues qui rosissent, petits cœurs ═══
  ds_blush: (s) => {
    const cheek = (x) => `<g><ellipse cx="${x}" cy="66" rx="12" ry="6.6" fill="#fb7185" filter="url(#bhb)">${an("opacity", ".08;.42;.08", 3)}</ellipse>` +
      [0, 1, 2].map((k) => `<path d="M${x - 5 + k * 4},${63 + 0} l-2.4,6" stroke="#f43f5e" stroke-width="1.2" stroke-linecap="round" fill="none">${an("opacity", ".1;.85;.1", 3, k * 0.12)}</path>`).join("") + `</g>`;
    const hrt = (x, b, d) => `<g transform="translate(${x} 0)"><g>${an("opacity", "0;1;0", d, b)}<animateTransform attributeName="transform" type="translate" values="0 78;6 40;-2 6" dur="${d}s" begin="${b}s" repeatCount="indefinite"/><path d="${HEART}" transform="scale(.9)" fill="#fb7185"/></g></g>`;
    return wrap(s, lg("bh", "#fecdd3", "#f472b6") + fGlow("bhg", 1.8) + `<filter id="bhb"><feGaussianBlur stdDeviation="2.4"/></filter>`,
      `<circle cx="50" cy="50" r="51.4" fill="none" stroke="url(#bh)" stroke-width="3" filter="url(#bhg)">${an("opacity", ".8;1;.8", 2.8)}</circle><circle cx="50" cy="50" r="47.8" fill="none" stroke="#fda4af" stroke-width=".8" stroke-dasharray="1.2 4.2" stroke-linecap="round" opacity=".75"/>` +
      cheek(27) + cheek(73) + hrt(-4, 0, 3.6) + hrt(104, 1.4, 3.8) + hrt(2, 2.4, 3.2) +
      star(92, 12, 0.6, "#ffe4e6", 2.4) + star(8, 90, 0.55, "#ffe4e6", 2.4, 1));
  },

  // ═══ GLITCH — contour décalé RGB, tranches qui sautent, pixels corrompus ═══
  ds_glitch: (s) => {
    const jit = (v, d, b) => tr("translate", v, d, b, 'calcMode="discrete" keyTimes="0;.62;.66;.7;.74;.8;.84;1"');
    const ring = (col, w, op, anim = "") => `<g opacity="${op}">${anim}<circle cx="50" cy="50" r="51" fill="none" stroke="${col}" stroke-width="${w}"/></g>`;
    const blocks = [[8, 20, 5, 2.4], [92, 70, 6, 2], [60, 98, 4.5, 2], [88, 18, 4, 2.4], [14, 80, 5, 2]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i % 2 ? "#22d3ee" : "#f43f5e"}">${an("opacity", "0;0;1;0;0;1;0", 2.6 + i * 0.3, i * 0.37, 'calcMode="discrete"')}</rect>`).join("");
    return wrap(s, `<clipPath id="gl1"><rect x="-20" y="32" width="140" height="10"/></clipPath><clipPath id="gl2"><rect x="-20" y="64" width="140" height="7"/></clipPath>` +
      `<filter id="gld" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.0 0.4" numOctaves="1" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">${an("scale", "0;0;0;9;0;0;5;0", 3.4, 0, 'calcMode="discrete"')}</feDisplacementMap></filter>`,
      `<g filter="url(#gld)">` + ring("#22d3ee", 2.2, ".8", jit("0 0;0 0;-3 0;2 1;-1 0;3 -1;0 0;0 0", 3.4, 0)) + ring("#f43f5e", 2.2, ".8", jit("0 0;0 0;3 0;-2 -1;1 0;-3 1;0 0;0 0", 3.4, 0.05)) + ring("#fff", 1.7, "1") + `</g>` +
      `<g clip-path="url(#gl1)">${tr("translate", "0 0;0 0;6 0;-4 0;0 0;0 0", 2.8, 0, 'keyTimes="0;.5;.55;.6;.65;1" calcMode="discrete"')}${ring("#fff", 3, "1")}</g>` +
      `<g clip-path="url(#gl2)">${tr("translate", "0 0;0 0;-7 0;4 0;0 0;0 0", 3.1, 0.7, 'keyTimes="0;.4;.45;.5;.55;1" calcMode="discrete"')}${ring("#22d3ee", 3, "1")}</g>` + blocks);
  },

  // ═══ ORBITE — large anneau planétaire qui passe devant et derrière l'avatar ═══
  ds_orbit: (s) => {
    const back = "M-24,50A74,19 0 0 1 124,50", front = "M-24,50A74,19 0 0 0 124,50";
    const rim = (d, w, op) => `<path d="${d}" fill="none" stroke="url(#ob)" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
    return wrap(s, lg("ob", "#f0abfc", "#67e8f9") + fGlow("obg", 1.4) +
      `<clipPath id="obc"><path clip-rule="evenodd" d="M-60,-60H160V160H-60Z M0,50a50,50 0 1,0 100,0a50,50 0 1,0 -100,0Z"/></clipPath>`,
      `<g clip-path="url(#obc)"><g transform="rotate(-18 50 50)">${rim(back, 3, 0.95)}${rim("M-34,50A84,24 0 0 1 134,50", 1, 0.45)}</g></g>` +
      `<g transform="rotate(-18 50 50)" filter="url(#obg)">${rim(front, 3.4, 1)}${rim("M-34,50A84,24 0 0 0 134,50", 1, 0.5)}` +
      `<circle r="3.6" fill="#fff" stroke="#c4b5fd" stroke-width="1"><animateMotion path="${front}" dur="5.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" dur="5.4s" repeatCount="indefinite"/></circle></g>` +
      `<circle cx="50" cy="50" r="51" fill="none" stroke="url(#ob)" stroke-width="1.2" opacity=".5"/>` +
      star(8, 22, 0.55, "#f5d0fe", 2.6) + star(94, 78, 0.55, "#cffafe", 2.6, 1.2));
  },

  // ═══ NÉANT — anneau d'ombre qui ondule, particules aspirées ═══
  ds_void: (s) => {
    const orb = (r, dur, dir, a0, col, sz) => `<g>${spin(dur, dir, -a0)}<circle cx="${50 + r}" cy="50" r="${sz}" fill="${col}"/></g>`;
    return wrap(s, lg("vd", "#0b0618", "#7c3aed") + turb("vdt", 0.032, 6, 4) + fGlow("vdg", 2),
      `<g filter="url(#vdt)"><circle cx="50" cy="50" r="52" fill="none" stroke="url(#vd)" stroke-width="7"/></g>` +
      `<circle cx="50" cy="50" r="48.4" fill="none" stroke="#c084fc" stroke-width="1" filter="url(#vdg)">${an("opacity", ".35;.9;.35", 3.4)}</circle>` +
      orb(58, 7, 1, 0, "#e9d5ff", 1.5) + orb(56, 11, -1, 3, "#a78bfa", 1.2) + orb(60, 9.5, 1, 5, "#c084fc", 1) + orb(57.5, 14, -1, 8, "#f5d0fe", 1.3) +
      star(100, 20, 0.5, "#e9d5ff", 3, 0.5));
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// LES 27 CADRES D'ORIGINE, REDESSINÉS DANS LE MÊME STYLE (lumière, glitch, distorsion) ET THÉMATISÉS PAR CATÉGORIE.
// Mêmes identifiants que frames.js : sur l'appli de bureau getFrameSvg() prend ces dessins en priorité.
// ═════════════════════════════════════════════════════════════════════════════
const rgd = (id, c1, c2, sd = 1.5) => lg(id, c1, c2) + fGlow(id + "g", sd);
const rg = (id, w = 3, r = 51.4, anim = "") => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}" filter="url(#${id}g)">${anim}</circle>`;
const dot = (r, dur, dir, a0, col, sz, extra = "") => `<g>${spin(dur, dir, a0)}<circle cx="${P(50 + r)}" cy="50" r="${sz}" fill="${col}">${extra}</circle></g>`;
const comet = (r, dur, dir, a0, col, sz = 1.8) => `<g>${spin(dur, dir, a0)}` +
  [[34, 0.16, 0.7], [20, 0.36, 1.1], [9, 0.7, 1.7]].map(([l, o, w]) => `<path d="${dir > 0 ? arcD(r, -l, 0) : arcD(r, 0, l)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`).join("") +
  `<circle cx="${P(50 + r)}" cy="50" r="${sz}" fill="#fff"/></g>`;
const drift = (x0, y0, x1, y1, dur, begin, inner) =>
  `<g>${tr("translate", `${x0} ${y0};${x1} ${y1}`, dur, begin)}<g>${an("opacity", "0;1;1;0", dur, begin, 'keyTimes="0;.15;.75;1"')}${inner}</g></g>`;
const ripple = (col, dur = 3, begin = 0, r0 = 51, r1 = 63) =>
  `<circle cx="50" cy="50" r="${r0}" fill="none" stroke="${col}" stroke-width=".9">${an("r", `${r0};${r1}`, dur, begin)}${an("opacity", ".75;0", dur, begin)}</circle>`;
const pulse = (dur = 2.6, begin = 0) => tr("scale", "1;1.35;1", dur, begin);
// aile faite de plumes : base en (0,0), s'ouvre vers la gauche (miroir pour la droite)
const wing = (n, len, hgt, fillId, flap = 3.6) => {
  let f = "";
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1), L = P(len * (1 - 0.35 * t)), H = P(-hgt + t * hgt * 1.5);
    f += `<path d="M0,${P(t * 4)}C${P(-L * 0.4)},${P(H * 0.2 + t * 2)} ${P(-L * 0.8)},${P(H * 0.7)} ${-L},${H}C${P(-L * 0.7)},${P(H * 0.3 + 4)} ${P(-L * 0.35)},${P(5 + t * 3)} 0,${P(6 + t * 4)}Z" fill="url(#${fillId})" stroke="#fff" stroke-width=".35" stroke-opacity=".7"/>`;
  }
  return `<g>${tr("rotate", "0;-7;0", flap)}${f}</g>`;
};

Object.assign(ART, {
  // ═══════ ABONNÉS — aura sociale ═══════
  followers_10: (s) => wrap(s, rgd("fa1", "#e2e8f0", "#7dd3fc", 1.2),
    rg("fa1", 2.4) + ripple("#bae6fd", 3.2) + ripple("#bae6fd", 3.2, 1.6) +
    dot(56, 9, 1, 0, "#f1f5f9", 1.5, an("opacity", ".4;1;.4", 2)) + dot(56, 9, 1, 120, "#bae6fd", 1.3, an("opacity", "1;.4;1", 2)) + dot(56, 9, 1, 240, "#f1f5f9", 1.5, an("opacity", ".4;1;.4", 2, 1)) +
    star(10, 12, 0.5, "#e0f2fe", 2.6) + star(92, 90, 0.5, "#e0f2fe", 2.6, 1.3)),

  followers_50: (s) => {
    let h = ""; for (let i = 0; i < 8; i++) { const [x, y] = ptc(58, i * 45); h += heart(x, y, 1.1, i % 2 ? "#fda4af" : "#fcd34d", tr("scale", "1;1.4;1", 2, i * 0.25)); }
    return wrap(s, rgd("fa2", "#fcd34d", "#f472b6", 1.6),
      rg("fa2", 3) + ripple("#fcd34d", 2.8) + ripple("#f9a8d4", 2.8, 1.4) + `<g>${spin(26)}${h}</g>` +
      star(2, 14, 0.7, "#fff7d6", 2.2) + star(98, 84, 0.7, "#ffe4e6", 2.2, 1.1) + star(92, 6, 0.5, "#fff", 1.8, 0.5));
  },

  followers_250: (s) => {
    let sh = "";
    for (let i = 0; i < 14; i++) { const a = i * (360 / 14) - 90, big = i % 2 === 0; sh += radial(a, 51.5, `<g>${an("opacity", ".55;1;.55", 2.4, i * 0.17)}<path d="M0,${big ? -15 : -9}L${big ? 3.2 : 2.2},-3L0,2L${big ? -3.2 : -2.2},-3Z" fill="url(#fa3)" stroke="#fff" stroke-width=".4"/><path d="M0,${big ? -15 : -9}L0,2" stroke="#fff" stroke-width=".35" opacity=".7"/></g>`); }
    return wrap(s, rgd("fa3", "#f0fdff", "#22d3ee", 1.3),
      rg("fa3", 2.6) + sh + `<g>${spin(5)}<path d="${arcD(51.5, -20, 26)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/></g>` +
      star(4, 6, 0.8, "#fff", 2.2) + star(96, 18, 0.6, "#cffafe", 2.2, 0.8) + star(8, 94, 0.6, "#cffafe", 2.2, 1.5) + star(94, 92, 0.8, "#fff", 2.2, 0.3));
  },

  // ═══════ CONTRIBUTION — données, nœuds, œil ═══════
  contrib_10: (s) => {
    let nodes = ""; for (let i = 0; i < 4; i++) { const [x, y] = ptc(57, i * 90 + 45); nodes += `<circle cx="${x}" cy="${y}" r="2.2" fill="#0b0d1f" stroke="#bef264" stroke-width="1">${an("r", "1.6;2.8;1.6", 2.4, i * 0.6)}</circle><circle cx="${x}" cy="${y}" r=".9" fill="#d9f99d"/>`; }
    return wrap(s, rgd("fc1", "#d9f99d", "#2dd4bf", 1.3),
      rg("fc1", 2.6) + `<g>${spin(18)}<circle cx="50" cy="50" r="57" fill="none" stroke="#a3e635" stroke-width=".9" stroke-dasharray="2.2 4.4" stroke-linecap="round" opacity=".8"/></g>` + nodes +
      comet(51.4, 4.4, 1, 0, "#bef264", 1.4) + star(94, 12, 0.5, "#ecfccb", 2.4) + star(6, 90, 0.5, "#ecfccb", 2.4, 1.2));
  },

  contrib_100: (s) => {
    const hex = (r) => [0, 1, 2, 3, 4, 5].map((i) => ptc(r, i * 60 - 90).join(",")).join(" ");
    let gems = ""; for (let i = 0; i < 6; i++) { const [x, y] = ptc(58, i * 60 - 90); gems += `<g transform="translate(${x} ${y}) rotate(45)"><rect x="-2.8" y="-2.8" width="5.6" height="5.6" rx=".8" fill="#06222c" stroke="#a5f3fc" stroke-width="1">${an("stroke-opacity", ".4;1;.4", 2.2, i * 0.37)}</rect><rect x="-1.2" y="-1.2" width="2.4" height="2.4" fill="#22d3ee"/></g>`; }
    return wrap(s, rgd("fc2", "#cffafe", "#0891b2", 1.3),
      `<circle cx="50" cy="50" r="51" fill="none" stroke="url(#fc2)" stroke-width="1.2" opacity=".6"/>` +
      `<polygon points="${hex(58)}" fill="none" stroke="url(#fc2)" stroke-width="2.6" stroke-linejoin="round" filter="url(#fc2g)"/>` +
      `<polygon points="${hex(58)}" pathLength="100" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-dasharray="10 90" filter="url(#fc2g)">${an("stroke-dashoffset", "100;0", 3)}</polygon>` +
      `<g>${spin(16, -1)}<polygon points="${hex(52)}" fill="none" stroke="#67e8f9" stroke-width=".7" stroke-dasharray="3 5" opacity=".7"/></g>` + gems +
      star(50, -10, 0.55, "#ecfeff", 2.4) + star(50, 110, 0.55, "#ecfeff", 2.4, 1.2));
  },

  contrib_1000: (s) => {
    let rays = ""; for (let i = 0; i < 16; i++) { const a = i * 22.5, [x1, y1] = ptc(55, a), [x2, y2] = ptc(i % 2 ? 61 : 68, a); rays += `<path d="M${x1},${y1}L${x2},${y2}" stroke="#f5d0fe" stroke-width="${i % 2 ? 0.8 : 1.3}" stroke-linecap="round"/>`; }
    return wrap(s, rgd("fc3", "#f5d0fe", "#c026d3", 1.6) + lg("fc3g2", "#fde68a", "#f59e0b"),
      rg("fc3", 3, 51.4, an("opacity", ".7;1;.7", 3)) + `<g>${spin(40)}${rays}</g>` +
      `<g transform="translate(50 -9)"><g>${tr("scale", "1;1.06;1", 3)}<path d="M-12,0Q0,-9.5 12,0Q0,9.5 -12,0Z" fill="#12061c" stroke="url(#fc3g2)" stroke-width="1.5" filter="url(#fc3g)"/><circle r="4.4" fill="url(#fc3g2)">${an("r", "3.6;4.8;3.6", 3)}</circle><circle r="1.9" fill="#12061c"/><circle cx="-1.2" cy="-1.3" r=".8" fill="#fff"/></g></g>` +
      drift(-6, 62, -10, 26, 3.6, 0, `<circle r="1" fill="#f5d0fe"/>`) + drift(106, 66, 110, 30, 3.8, 1.2, `<circle r="1" fill="#fde68a"/>`) + drift(50, 112, 52, 100, 3, 0.6, `<circle r=".8" fill="#fff"/>`) +
      star(2, 10, 0.6, "#fae8ff", 2.2) + star(98, 14, 0.6, "#fae8ff", 2.2, 1));
  },

  // ═══════ JEUX — rangs ═══════
  games_rookie: (s) => {
    let px = ""; for (let i = 0; i < 6; i++) { const [x, y] = ptc(57, i * 60); px += `<rect x="${P(x - 2)}" y="${P(y - 2)}" width="4" height="4" fill="${i % 2 ? "#bbf7d0" : "#4ade80"}">${an("opacity", ".25;1;.25", 1.8, i * 0.3, 'calcMode="discrete"')}</rect>`; }
    const up = (x, b) => drift(x, 70, x, 30, 2.8, b, `<path d="M-3.4,2L0,-2L3.4,2" fill="none" stroke="#86efac" stroke-width="1.4" stroke-linecap="square"/>`);
    return wrap(s, rgd("fg1", "#bbf7d0", "#16a34a", 1.2),
      rg("fg1", 2.8) + `<g>${spin(14)}${px}</g>` + up(-8, 0) + up(108, 1.4) + up(-8, 1.4) + up(108, 0) +
      `<circle cx="50" cy="50" r="51" fill="none" stroke="#86efac" stroke-width=".6" stroke-dasharray="1 3" opacity=".6"/>`);
  },

  games_challenger: (s) => wrap(s, rgd("fg2", "#c7d2fe", "#6366f1", 1.6) + lg("fg2w", [[0, "#e0e7ff"], [1, "#6366f1"]], 1, 0),
    rg("fg2", 3) + `<g transform="translate(-1 52)">${wing(3, 22, 12, "fg2w")}</g><g transform="translate(101 52) scale(-1 1)">${wing(3, 22, 12, "fg2w", 3.6)}</g>` +
    comet(51.4, 3.2, 1, 0, "#a5b4fc", 1.7) + comet(51.4, 3.2, 1, 180, "#a5b4fc", 1.7) + star(50, -9, 0.7, "#e0e7ff", 2.2) + star(8, 8, 0.5, "#c7d2fe", 2.4, 0.6) + star(92, 8, 0.5, "#c7d2fe", 2.4, 1.2)),

  games_master: (s) => {
    let sp = ""; for (let i = 0; i < 7; i++) { const a = -150 + i * 20, mid = i === 3, [x, y] = ptc(51, a); sp += `<g transform="translate(${x} ${y}) rotate(${a + 90})"><g>${tr("scale", "1 1;1 1.12;1 1", 2.4, i * 0.2)}<path d="M-3.4,0L0,${mid ? -15 : -10}L3.4,0Z" fill="url(#fg3)" stroke="#92400e" stroke-width=".4"/><circle cy="${mid ? -12 : -8}" r="${mid ? 1.5 : 1}" fill="${mid ? "#ef4444" : "#fff7d6"}"/></g></g>`; }
    return wrap(s, rgd("fg3", "#fef3c7", "#d97706", 1.5),
      rg("fg3", 3.4) + `<circle cx="50" cy="50" r="47.6" fill="none" stroke="#fde68a" stroke-width=".7" opacity=".7"/>` + sp +
      `<g>${spin(5)}<path d="${arcD(51.4, 40, 110)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/></g>` +
      star(4, 90, 0.6, "#fff7d6", 2.2) + star(96, 90, 0.6, "#fff7d6", 2.2, 1.1) + star(50, 108, 0.5, "#fff", 2, 0.5));
  },

  games_grandmaster: (s) => {
    let ry = ""; for (let i = 0; i < 20; i++) { const a = i * 18, long = i % 2 === 0, [x, y] = ptc(53, a); ry += radial(a, 53, `<path d="M-1.6,0L0,${long ? -17 : -9}L1.6,0Z" fill="${long ? "#fff" : "#fae8ff"}" opacity="${long ? 0.95 : 0.7}"/>`); }
    return wrap(s, `<linearGradient id="fg4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0abfc"/><stop offset=".33" stop-color="#fde68a"/><stop offset=".66" stop-color="#67e8f9"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient>` + fGlow("fg4g", 1.8),
      `<circle cx="50" cy="50" r="64" fill="#fff" opacity="0">${an("opacity", "0;.07;0", 2.8)}</circle>` + `<g>${spin(36)}${ry}</g>` +
      rg("fg4", 3.4) + comet(51.4, 3.6, 1, 0, "#fff", 1.9) + comet(51.4, 3.6, 1, 180, "#fde68a", 1.9) +
      star(2, 12, 1, "#fff", 2, 0) + star(98, 12, 1, "#fff", 2, 0.7) + star(2, 88, 0.9, "#fdf4ff", 2, 1.3) + star(98, 88, 1, "#fff", 2, 0.4));
  },

  // ═══════ VUS — pellicule & grades ═══════
  watched_50: (s) => {
    let f = ""; for (let i = 0; i < 28; i++) { const [x, y] = ptc(57, i * (360 / 28)); f += `<g transform="translate(${x} ${y}) rotate(${P(i * (360 / 28))})"><rect x="-1.5" y="-1.1" width="3" height="2.2" rx=".5" fill="#e0f2fe"/></g>`; }
    return wrap(s, rgd("fw1", "#e0f2fe", "#38bdf8", 1.2),
      rg("fw1", 2.4) + `<g>${spin(40)}<circle cx="50" cy="50" r="57" fill="none" stroke="#0c4a6e" stroke-width="5" opacity=".75"/><circle cx="50" cy="50" r="57" fill="none" stroke="#7dd3fc" stroke-width="5" stroke-dasharray=".1 99" opacity="0"/>${f}</g>` +
      `<circle cx="50" cy="50" r="59.6" fill="none" stroke="#7dd3fc" stroke-width=".6" opacity=".7"/><circle cx="50" cy="50" r="54.4" fill="none" stroke="#7dd3fc" stroke-width=".6" opacity=".7"/>` +
      star(8, 8, 0.5, "#e0f2fe", 2.4) + star(94, 92, 0.5, "#e0f2fe", 2.4, 1.2));
  },

  watched_500: (s) => {
    let tk = ""; for (let i = 0; i < 60; i++) { const a = i * 6, big = i % 5 === 0, [x1, y1] = ptc(54, a), [x2, y2] = ptc(big ? 60 : 57, a); tk += `<path d="M${x1},${y1}L${x2},${y2}" stroke="${big ? "#c7d2fe" : "#6366f1"}" stroke-width="${big ? 1.1 : 0.6}" stroke-linecap="round"/>`; }
    return wrap(s, rgd("fw2", "#c7d2fe", "#4f46e5", 1.4),
      rg("fw2", 3) + tk + `<g>${spin(7)}<path d="${arcD(57, -50, 20)}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" filter="url(#fw2g)"/></g>` +
      `<g transform="translate(50 -9)"><g>${tr("scale", "1;1.14;1", 2.4)}<circle r="6.4" fill="#0b0d2e" stroke="url(#fw2)" stroke-width="1.5"/><path d="M-1.9,-2.8L3.2,0L-1.9,2.8Z" fill="#c7d2fe"/></g></g>` +
      star(2, 90, 0.55, "#e0e7ff", 2.4) + star(98, 90, 0.55, "#e0e7ff", 2.4, 1.2));
  },

  watched_1000: (s) => {
    let st = ""; for (let i = 0; i < 8; i++) { const [x, y] = ptc(53, i * 45); st += `<circle cx="${x}" cy="${y}" r="2.3" fill="#1b0b2e" stroke="#e9d5ff" stroke-width=".9"/><circle cx="${x}" cy="${y}" r="1.1" fill="#c084fc">${an("opacity", ".3;1;.3", 2.4, i * 0.3)}</circle>`; }
    const chev = (y, b) => `<path d="M-8,${y}L0,${y + 6}L8,${y}" fill="none" stroke="#f3e8ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${an("opacity", ".25;1;.25", 2.4, b)}</path>`;
    return wrap(s, rgd("fw3", "#f3e8ff", "#9333ea", 1.5),
      rg("fw3", 4.2) + `<circle cx="50" cy="50" r="48.4" fill="none" stroke="#e9d5ff" stroke-width=".7" opacity=".7"/>` + st +
      `<g transform="translate(50 -16)" filter="url(#fw3g)">${chev(0, 0.8)}${chev(5, 0.4)}${chev(10, 0)}</g>` +
      `<g>${spin(6)}<path d="${arcD(53, 200, 262)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/></g>` +
      star(4, 10, 0.7, "#faf5ff", 2.2) + star(96, 10, 0.7, "#faf5ff", 2.2, 1));
  },

  watched_5000: (s) => wrap(s, rgd("fw4", "#fffbeb", "#f59e0b", 1.8) + lg("fw4w", [[0, "#fffbeb"], [1, "#fcd34d"]], 1, 0),
    `<circle cx="50" cy="50" r="62" fill="#fde68a" opacity="0">${an("opacity", "0;.09;0", 3)}</circle>` +
    `<g transform="translate(-2 56)">${wing(4, 28, 16, "fw4w", 4.2)}</g><g transform="translate(102 56) scale(-1 1)">${wing(4, 28, 16, "fw4w", 4.2)}</g>` +
    rg("fw4", 3.4) + `<g transform="translate(50 -12)"><g>${tr("translate", "0 0;0 -1.6;0 0", 3)}<ellipse rx="13" ry="3.6" fill="none" stroke="url(#fw4)" stroke-width="2" filter="url(#fw4g)"/></g></g>` +
    comet(51.4, 4, 1, 0, "#fde68a", 1.9) + drift(10, 14, 0, 70, 3.4, 0, `<circle r=".9" fill="#fde68a"/>`) + drift(92, 10, 100, 64, 3.8, 1.3, `<circle r=".9" fill="#fff7d6"/>`) + drift(50, 100, 46, 116, 2.8, 0.6, `<circle r=".8" fill="#fde68a"/>`) +
    star(50, 108, 0.8, "#fff", 2.2) + star(8, 96, 0.6, "#fef3c7", 2.2, 0.9) + star(94, 98, 0.6, "#fef3c7", 2.2, 1.6)),

  // ═══════ GENRES ═══════
  genre_romance: (s) => {
    let ch = ""; for (let i = 0; i < 12; i++) { const [x, y] = ptc(52, i * 30); ch += heart(x, y, 1.05, "#fb7185", `${an("opacity", ".35;1;.35", 2.4, i * 0.2)}${tr("scale", "1;1.3;1", 2.4, i * 0.2)}`); }
    const flo = (x0, x1, b) => drift(x0, 112, x1, 14, 4.2, b, `<g>${tr("scale", "1;1.25;1", 1.8, b)}<path d="${HEART}" transform="scale(.9)" fill="#fda4af"/></g>`);
    const pet = (x0, x1, b) => drift(x0, -8, x1, 108, 5, b, `<g>${tr("rotate", "0;240", 5, b)}<path d="M0,-3C2.6,-1.6 2.6,1.6 0,3C-2.6,1.6 -2.6,-1.6 0,-3Z" fill="#f9a8d4"/></g>`);
    return wrap(s, rgd("gr", "#fbcfe8", "#ec4899", 1.6),
      rg("gr", 2.6) + ch + flo(-6, -12, 0) + flo(106, 112, 1.5) + flo(10, 4, 2.8) + pet(20, 6, 0.4) + pet(84, 100, 2.2) +
      star(94, 10, 0.55, "#fdf2f8", 2.4) + star(6, 92, 0.55, "#fdf2f8", 2.4, 1.2));
  },

  genre_scifi: (s) => wrap(s, rgd("gs", "#bfdbfe", "#2563eb", 1.4),
    `<circle cx="50" cy="50" r="51" fill="none" stroke="url(#gs)" stroke-width="2" filter="url(#gsg)"/>` +
    `<g>${spin(22)}<circle cx="50" cy="50" r="56" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-dasharray="22 9" opacity=".9"/></g>` +
    `<g>${spin(15, -1)}<circle cx="50" cy="50" r="61" fill="none" stroke="#93c5fd" stroke-width=".9" stroke-dasharray="3 4" opacity=".8"/></g>` +
    `<g>${spin(9)}<path d="${arcD(66, 20, 70)}" fill="none" stroke="#38bdf8" stroke-width="1.4" stroke-linecap="round"/></g>` +
    `<g>${spin(4.2, 1, 30)}<path d="${arcD(51, 0, 24)}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" filter="url(#gsg)"/></g>` +
    dot(66, 12, 1, 200, "#e0f2fe", 2.2) + `<rect x="46" y="-13" width="8" height="2" fill="#38bdf8">${an("opacity", "1;.2;1", 1.2, 0, 'calcMode="discrete"')}</rect><rect x="46" y="111" width="8" height="2" fill="#38bdf8">${an("opacity", ".2;1;.2", 1.2, 0, 'calcMode="discrete"')}</rect>` +
    star(8, 12, 0.6, "#dbeafe", 2.2) + star(92, 90, 0.6, "#dbeafe", 2.2, 1)),

  genre_horror: (s) => {
    const drip = (x, y, d, b) => drift(x, y, x, y + 16, d, b, `<path d="M0,-3C1.8,-.4 2.2,1.4 0,2.6C-2.2,1.4 -1.8,-.4 0,-3Z" fill="#b91c1c">${an("opacity", "1;1", d)}</path>`);
    const dr = [[20, 80, 2.2, 0], [34, 92, 2.8, 0.8], [52, 102, 2.4, 1.5], [70, 94, 3, 0.3], [82, 80, 2.6, 1.2], [8, 60, 3.2, 1.9], [94, 62, 2.9, 0.6]];
    return wrap(s, rgd("gh", "#fca5a5", "#7f1d1d", 1.8) + turb("ght", 0.05, 2.2, 3),
      `<circle cx="50" cy="50" r="62" fill="#ef4444" opacity="0">${an("opacity", "0;.1;0;.05;0;0", 2.2, 0, 'keyTimes="0;.1;.2;.3;.5;1"')}</circle>` +
      `<g filter="url(#ght)">${rg("gh", 3.6, 51.4, an("opacity", "1;.6;1;.85;1;1", 2.2, 0, 'keyTimes="0;.1;.2;.3;.5;1"'))}</g>` +
      dr.map(([x, y, d, b]) => drip(x, y, d, b)).join("") +
      `<path d="M2,70l5,6M5,66l5,6M8,62l5,6" stroke="#7f1d1d" stroke-width="1" stroke-linecap="round" opacity=".7">${an("opacity", "0;.9;0", 3.4)}</path>`);
  },

  genre_action: (s) => {
    const slash = (x1, y1, x2, y2, b) => `<g>${an("opacity", "0;0;1;.2;0", 2.4, b, 'keyTimes="0;.55;.6;.75;1"')}<path d="M${x1},${y1}L${x2},${y2}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M${x1},${y1}L${x2},${y2}" stroke="#fb923c" stroke-width="4" stroke-linecap="round" opacity=".4"/></g>`;
    const spk = (a, b) => { const [x1, y1] = ptc(54, a), [x2, y2] = ptc(66, a); return `<path d="M${x1},${y1}L${x2},${y2}" stroke="#fde047" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="3 12">${an("stroke-dashoffset", "0;-15", 1, b)}</path>`; };
    return wrap(s, rgd("ga", "#fdba74", "#dc2626", 1.8) + turb("gat", 0.04, 2.8, 1.4),
      `<g filter="url(#gat)">${rg("ga", 3.4)}</g>` + ripple("#fb923c", 1.6, 0, 51, 66) + ripple("#fde047", 1.6, 0.8, 51, 62) +
      slash(-14, 22, 38, -8, 0) + slash(116, 80, 62, 112, 0.8) + slash(-12, 90, 20, 116, 1.5) + slash(112, 12, 80, -12, 0.4) +
      Array.from({ length: 12 }, (_, i) => spk(i * 30 + 10, (i % 4) * 0.25)).join("") + star(98, 96, 0.7, "#fde68a", 1.6) + star(2, 4, 0.7, "#fde68a", 1.6, 0.7));
  },

  genre_fantasy: (s) => wrap(s, rgd("gf", "#a7f3d0", "#059669", 1.5),
    rg("gf", 2.8) + `<g>${spin(30, -1)}<circle cx="50" cy="50" r="57" fill="none" stroke="#6ee7b7" stroke-width=".8" stroke-dasharray="1.6 5" stroke-linecap="round" opacity=".9"/></g>` +
    comet(58, 5.4, 1, 0, "#6ee7b7", 2) + comet(63, 7.6, -1, 100, "#fde68a", 1.7) + comet(55, 4.6, 1, 220, "#a7f3d0", 1.5) +
    `<g transform="translate(88 -4)"><g>${tr("rotate", "-6;6;-6", 4)}<path d="M0,-7A7,7 0 1 0 5,5A5.6,5.6 0 1 1 0,-7Z" fill="#fef3c7" filter="url(#gfg)"/></g></g>` +
    star(8, 10, 0.8, "#d1fae5", 2.1) + star(98, 56, 0.6, "#fef3c7", 2.1, 0.7) + star(4, 80, 0.7, "#d1fae5", 2.1, 1.3) + star(60, 110, 0.6, "#fef3c7", 2.1, 0.4) +
    drift(30, 104, 24, 70, 3.4, 0, `<circle r="1" fill="#a7f3d0"/>`) + drift(76, 106, 84, 76, 3.8, 1.2, `<circle r="1" fill="#fde68a"/>`)),

  genre_comedy: (s) => {
    const cols = ["#f472b6", "#38bdf8", "#a78bfa", "#fb923c", "#4ade80", "#fde047"];
    const conf = Array.from({ length: 14 }, (_, i) => { const x = i % 2 ? -10 + (i * 7) % 26 : 84 + (i * 5) % 26, b = (i * 0.37) % 3; return drift(x, -14, x + (i % 3 - 1) * 8, 112, 3.2 + (i % 4) * 0.4, b, `<g>${tr("rotate", "0;540", 3.2 + (i % 4) * 0.4, b)}<rect x="-1.4" y="-.8" width="2.8" height="1.6" fill="${cols[i % 6]}"/></g>`); }).join("");
    return wrap(s, rgd("gc", "#fef9c3", "#f59e0b", 1.4),
      `<g>${tr("scale", "1 1;1.03 .97;.98 1.03;1 1", 1.6, 0, 'additive="sum"')}</g>` +
      `<g transform="translate(50 50)"><g>${tr("scale", "1;1.035;.985;1", 1.4)}<g transform="translate(-50 -50)">${rg("gc", 3.4)}<circle cx="50" cy="50" r="47.8" fill="none" stroke="#fde047" stroke-width=".8" stroke-dasharray="1 3.4" stroke-linecap="round" opacity=".8"/></g></g></g>` +
      conf + star(6, 8, 0.8, "#fff", 1.4) + star(96, 94, 0.8, "#fff", 1.4, 0.7) + star(98, 8, 0.6, "#fef08a", 1.4, 0.3));
  },

  genre_drama: (s) => {
    const curtain = `<path d="M-6,-10H24C23,2 14,14 -6,22C0,12 0,2 -6,-10Z" fill="url(#gdc)"/><path d="M4,-10C6,0 4,8 -4,16M14,-10C15,0 11,10 -2,19" fill="none" stroke="#3b0764" stroke-width=".8" opacity=".55"/>`;
    return wrap(s, rgd("gd", "#ddd6fe", "#7c3aed", 1.4) + lg("gdc", [[0, "#a78bfa"], [1, "#4c1d95"]], 1, 1),
      rg("gd", 3) + `<g>${tr("rotate", "-2.5 -6 -10;2.5 -6 -10;-2.5 -6 -10", 5)}${curtain}</g><g transform="translate(100 0) scale(-1 1)">${curtain}</g>` +
      `<g transform="translate(50 -12)"><path d="M-4,0L-14,14H14L4,0Z" fill="#fde68a" opacity=".16">${an("opacity", ".05;.22;.05", 3)}</path></g>` +
      `<g>${spin(8)}<path d="${arcD(51.4, 110, 168)}" fill="none" stroke="#fde68a" stroke-width="2.2" stroke-linecap="round" filter="url(#gdg)"/></g>` +
      drift(20, 8, 8, 112, 5.5, 0, `<g>${tr("rotate", "0;300", 5.5)}<path d="M0,-3C2.6,-1.6 2.6,1.6 0,3C-2.6,1.6 -2.6,-1.6 0,-3Z" fill="#e11d48"/></g>`) + drift(80, 4, 96, 108, 6.5, 2.6, `<g>${tr("rotate", "0;-300", 6.5)}<path d="M0,-3C2.6,-1.6 2.6,1.6 0,3C-2.6,1.6 -2.6,-1.6 0,-3Z" fill="#be123c"/></g>`) +
      star(50, 108, 0.7, "#fde68a", 2.2));
  },

  genre_sports: (s) => {
    const chev = (x, y, b) => drift(x, y, x + 16, y, 1.1, b, `<path d="M-3,-3L0,0L-3,3M1.5,-3L4.5,0L1.5,3" fill="none" stroke="#bbf7d0" stroke-width="1.3" stroke-linecap="round"/>`);
    return wrap(s, rgd("gp", "#bbf7d0", "#16a34a", 1.5),
      rg("gp", 3.8) + `<circle cx="50" cy="50" r="48.4" fill="none" stroke="#fff" stroke-width=".7" stroke-dasharray="4 3" opacity=".6"/>` +
      comet(51.4, 2.2, 1, 0, "#fff", 2.1) + comet(51.4, 2.2, 1, 120, "#86efac", 2.1) + comet(51.4, 2.2, 1, 240, "#bbf7d0", 2.1) +
      chev(-24, 14, 0) + chev(-26, 88, 0.55) + chev(100, 10, 0.3) + chev(98, 92, 0.8) + star(94, 8, 0.6, "#dcfce7", 1.8) + star(6, 94, 0.6, "#dcfce7", 1.8, 0.9));
  },

  genre_mystery: (s) => {
    const q = (x, y, b, r) => `<text x="${x}" y="${y}" font-family="Georgia,serif" font-weight="700" font-size="15" text-anchor="middle" fill="#e2e8f0" transform="rotate(${r} ${x} ${y})">?${an("opacity", "0;.9;0", 4, b)}</text>`;
    const smoke = (x, y, b) => `<circle cx="${x}" cy="${y}" r="7" fill="#94a3b8" filter="url(#gmb)" opacity="0">${an("opacity", "0;.32;0", 5, b)}${an("cx", `${x};${x + 6};${x}`, 5, b)}</circle>`;
    return wrap(s, rgd("gm", "#e2e8f0", "#475569", 1.2) + turb("gmt", 0.035, 3.4, 4) + `<filter id="gmb"><feGaussianBlur stdDeviation="3.2"/></filter>`,
      `<g filter="url(#gmt)">${rg("gm", 3, 51.4, an("opacity", ".7;1;.7", 3.4))}</g>` + smoke(10, 20, 0) + smoke(92, 70, 1.6) + smoke(46, 104, 3.1) + smoke(94, 14, 2.2) +
      q(-5, 28, 0, -14) + q(106, 46, 1.4, 12) + q(22, 112, 2.7, -6) + q(86, 108, 3.5, 10) +
      `<g>${spin(7)}<path d="${arcD(51.4, -10, 38)}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" filter="url(#gmg)"/></g>`);
  },

  genre_sliceoflife: (s) => {
    const leaf = (x0, x1, d, b, col) => drift(x0, -10, x1, 110, d, b, `<g>${tr("rotate", "-40;40;-40", 2.4, b)}<path d="M0,-4C3.4,-2 3.4,2 0,4C-3.4,2 -3.4,-2 0,-4Z" fill="${col}"/><path d="M0,-3.4V3.4" stroke="#14532d" stroke-width=".4" opacity=".6"/></g>`);
    const flower = (x, y, b) => `<g transform="translate(${x} ${y})"><g>${tr("scale", "0;1;1;0", 5, b, 'keyTimes="0;.3;.8;1"')}${[0, 72, 144, 216, 288].map((a) => `<ellipse cy="-2.4" rx="1.5" ry="2.4" fill="#fde68a" transform="rotate(${a})"/>`).join("")}<circle r="1.2" fill="#f59e0b"/></g></g>`;
    return wrap(s, rgd("gl", "#dcfce7", "#4ade80", 1.2),
      rg("gl", 2.8, 51.4, an("opacity", ".75;1;.75", 4)) + `<circle cx="50" cy="50" r="48.2" fill="none" stroke="#bbf7d0" stroke-width=".7" stroke-dasharray="1 4" stroke-linecap="round" opacity=".8"/>` +
      leaf(14, -4, 5.4, 0, "#4ade80") + leaf(86, 104, 6.2, 1.8, "#86efac") + leaf(30, 14, 5.8, 3.4, "#22c55e") + leaf(70, 90, 6.6, 0.9, "#bbf7d0") +
      flower(4, 96, 0) + flower(98, 6, 2.5) + star(92, 92, 0.6, "#fef9c3", 2.6) + star(10, 10, 0.55, "#fef9c3", 2.6, 1.3));
  },

  genre_mecha: (s) => {
    const oct = (r) => Array.from({ length: 8 }, (_, i) => ptc(r, i * 45 + 22.5).join(",")).join(" ");
    const br = (a) => { const [x, y] = ptc(66, a); return `<g transform="translate(${x} ${y}) rotate(${a + 45})"><path d="M-6,-1L-6,-5L-2,-5M6,-1L6,-5L2,-5" fill="none" stroke="#fb923c" stroke-width="1.6" stroke-linecap="square"/></g>`; };
    const led = Array.from({ length: 5 }, (_, i) => `<rect x="${P(38 + i * 6)}" y="112" width="3.6" height="2.2" fill="${i % 2 ? "#fb923c" : "#38bdf8"}">${an("opacity", ".2;1;.2", 1.4, i * 0.28, 'calcMode="discrete"')}</rect>`).join("");
    return wrap(s, rgd("gmc", "#bae6fd", "#0369a1", 1.2),
      `<polygon points="${oct(60)}" fill="none" stroke="url(#gmc)" stroke-width="3" stroke-linejoin="miter" filter="url(#gmcg)"/><polygon points="${oct(55)}" fill="none" stroke="#475569" stroke-width="1" stroke-linejoin="miter" opacity=".8"/>` +
      `<polygon points="${oct(60)}" pathLength="100" fill="none" stroke="#fb923c" stroke-width="2.4" stroke-dasharray="8 92" stroke-linejoin="miter" filter="url(#gmcg)">${an("stroke-dashoffset", "100;0", 2.6)}</polygon>` +
      [45, 135, 225, 315].map(br).join("") + led +
      `<path d="M66,-7l4,-4M70,-7l4,-4" stroke="#fde047" stroke-width="1" stroke-linecap="round">${an("opacity", "0;1;0;0", 1.7, 0, 'calcMode="discrete"')}</path>` +
      `<path d="M-6,108l-4,4M-10,108l-4,4" stroke="#fde047" stroke-width="1" stroke-linecap="round">${an("opacity", "0;0;1;0", 1.9, 0.4, 'calcMode="discrete"')}</path>`);
  },

  genre_supernatural: (s) => {
    const wisp = (a, b, dur) => { const [x, y] = ptc(54, a); return flame(x, y, 8, 20, a + 90, dur, b, ["#7e22ce", "#c084fc", "#a5f3fc"]); };
    return wrap(s, rgd("gu", "#e9d5ff", "#7e22ce", 1.8) + turb("gut", 0.04, 4, 3.4),
      `<g filter="url(#gut)">${rg("gu", 3, 51.4, an("opacity", ".5;1;.5", 3))}</g>` +
      `<g filter="url(#gut)">${[-130, -90, -50, 20, 160, 200].map((a, i) => wisp(a, i * 0.4, 1.2 + (i % 3) * 0.2)).join("")}</g>` +
      dot(60, 8, 1, 40, "#a5f3fc", 1.6, an("opacity", ".3;1;.3", 2)) + dot(63, 11, -1, 160, "#e9d5ff", 1.4, an("opacity", "1;.3;1", 2.4)) +
      drift(30, 112, 24, 82, 3.4, 0, `<circle r="1.1" fill="#a5f3fc"/>`) + drift(76, 110, 84, 80, 3.8, 1.4, `<circle r="1" fill="#e9d5ff"/>`));
  },

  // ═══════ FONDATEUR ═══════
  special_founder: (s) => {
    let st = ""; for (let i = 0; i < 8; i++) { const [x, y] = ptc(58, i * 45 + 22); st += `<g transform="translate(${x} ${y})"><g>${tr("scale", "1;1.4;1", 2.4, i * 0.3)}<path d="${STAR4}" transform="scale(.6)" fill="${i % 2 ? "#fde68a" : "#e9d5ff"}"/></g></g>`; }
    return wrap(s, rgd("sf", "#fef3c7", "#d97706", 1.8) + lg("sfv", "#fde68a", "#7c3aed"),
      `<g transform="translate(50 50)"><g>${tr("scale", "1;1.12;1", 3.2)}<circle r="64" fill="#fbbf24" opacity=".06"/></g></g>` +
      rg("sf", 3.6) + `<circle cx="50" cy="50" r="47.8" fill="none" stroke="url(#sfv)" stroke-width="1" opacity=".8"/>` + `<g>${spin(30)}${st}</g>` +
      `<g transform="translate(50 -8) scale(1.15)"><g>${tr("translate", "0 0;0 -1.4;0 0", 3)}<path d="M-12,4L-13,-6L-6,-1L0,-10L6,-1L13,-6L12,4Z" fill="url(#sf)" stroke="#92400e" stroke-width=".7" filter="url(#sfg)"/><circle cy="-10" r="1.7" fill="#ef4444"/><circle cx="-13" cy="-6" r="1.3" fill="#a78bfa"/><circle cx="13" cy="-6" r="1.3" fill="#a78bfa"/><rect x="-12" y="1.6" width="24" height="1.6" fill="#7c3aed" opacity=".7"/></g></g>` +
      `<g>${spin(6)}<path d="${arcD(51.4, 100, 150)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/></g>` +
      star(4, 14, 0.8, "#fff7d6", 2.1) + star(96, 14, 0.8, "#fff7d6", 2.1, 0.7) + star(50, 110, 0.7, "#fde68a", 2.1, 1.3));
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// FORMES VARIÉES — mêmes principes que les 11 cadres « effets » (silhouettes qui dépassent, lumière qui court,
// particules). Remplace les anneaux simples de certains cadres d'origine et ajoute 5 nouveaux cadres.
// ═════════════════════════════════════════════════════════════════════════════
const OUT_CLIP = (id) => `<clipPath id="${id}"><path clip-rule="evenodd" d="M-60,-60H160V160H-60Z M0,50a50,50 0 1,0 100,0a50,50 0 1,0 -100,0Z"/></clipPath>`;
const pixelRing = (R, g) => {
  const pts = [];
  for (let i = 0; i < 96; i++) { const a = (i / 96) * 2 * Math.PI; pts.push([Math.round((50 + R * Math.cos(a)) / g) * g, Math.round((50 + R * Math.sin(a)) / g) * g]); }
  const out = []; let prev = null;
  for (const p of pts) { if (prev && p[0] !== prev[0] && p[1] !== prev[1]) out.push([p[0], prev[1]]); if (!prev || p[0] !== prev[0] || p[1] !== prev[1]) out.push(p); prev = p; }
  const f = out[0], l = out[out.length - 1]; if (f[0] !== l[0] && f[1] !== l[1]) out.push([f[0], l[1]]);
  return out.map((p) => p.join(",")).join(" ");
};
const wavy = (r, amp, n, steps = 144) => {
  let d = "";
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * 2 * Math.PI, rr = r + amp * Math.sin(n * a); d += `${i ? "L" : "M"}${P(50 + rr * Math.cos(a))},${P(50 + rr * Math.sin(a))}`; }
  return d + "Z";
};

Object.assign(ART, {
  // ═══ RECONNU — cadre arrondi bleu glacé, lumière qui court sur le contour ═══
  followers_10: (s) => wrap(s, rgd("n10", "#e2e8f0", "#7dd3fc", 1.2),
    `<rect x="-3" y="-3" width="106" height="106" rx="34" fill="none" stroke="url(#n10)" stroke-width="2.6" filter="url(#n10g)"/>` +
    `<rect x="-8" y="-8" width="116" height="116" rx="40" fill="none" stroke="#bae6fd" stroke-width=".7" stroke-dasharray="2 4" opacity=".55"/>` +
    `<rect x="-3" y="-3" width="106" height="106" rx="34" pathLength="100" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="10 90" filter="url(#n10g)">${an("stroke-dashoffset", "100;0", 3.6)}</rect>` +
    [[2, 2], [98, 2], [98, 98], [2, 98]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2" fill="#e0f2fe">${an("opacity", ".3;1;.3", 2.4, i * 0.6)}</circle>`).join("") +
    star(10, -6, 0.5, "#e0f2fe", 2.6) + star(94, 106, 0.5, "#e0f2fe", 2.6, 1.3)),

  // ═══ POPULAIRE — couronne de pétales festonnés, cœurs qui battent ═══
  followers_50: (s) => {
    let sc = "", h = "";
    for (let i = 0; i < 10; i++) {
      const [x, y] = ptc(59, i * 36);
      sc += `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="url(#n50)" stroke-width="1.8">${an("opacity", ".65;1;.65", 2.6, i * 0.26)}</circle>`;
      h += heart(x, y, 1.15, i % 2 ? "#fda4af" : "#fcd34d", tr("scale", "1;1.45;1", 2, i * 0.2));
    }
    return wrap(s, rgd("n50", "#fcd34d", "#f472b6", 1.5),
      `<g filter="url(#n50g)">${spin(60)}${sc}</g><g>${spin(60)}${h}</g>` +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#n50)" stroke-width="2.2" filter="url(#n50g)"/>` +
      ripple("#f9a8d4", 3, 0, 51, 66) + star(2, 10, 0.6, "#fff7d6", 2.2) + star(98, 90, 0.6, "#ffe4e6", 2.2, 1.1));
  },

  // ═══ CONTRIBUTEUR — viseur à angles, point qui parcourt le carré ═══
  contrib_10: (s) => {
    const br = (x, y, sx, sy) => `<path d="M${x},${y + sy * 18}V${y}H${x + sx * 18}" fill="none" stroke="url(#n1c)" stroke-width="3" stroke-linecap="square" filter="url(#n1cg)"/>`;
    return wrap(s, rgd("n1c", "#bef264", "#4ade80", 1.2),
      `<rect x="-3" y="-3" width="106" height="106" rx="4" fill="none" stroke="#86efac" stroke-width=".7" stroke-dasharray="1.5 3" opacity=".6"/>` +
      br(-4, -4, 1, 1) + br(104, -4, -1, 1) + br(104, 104, -1, -1) + br(-4, 104, 1, -1) +
      `<g filter="url(#n1cg)"><circle r="2.2" fill="#fff"><animateMotion dur="5s" repeatCount="indefinite" path="M-3,-3H103V103H-3Z"/></circle></g>` +
      [[50, -8], [108, 50], [50, 108], [-8, 50]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><path d="M-3,0H3M0,-3V3" stroke="#bef264" stroke-width="1.2">${an("opacity", ".3;1;.3", 2, i * 0.5)}</path></g>`).join("") +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#n1c)" stroke-width="1.2" opacity=".6"/>`);
  },

  // ═══ DÉBUTANT (jeux) — anneau pixel en escalier, LED qui clignotent ═══
  games_rookie: (s) => {
    const poly = pixelRing(56, 6);
    const leds = Array.from({ length: 8 }, (_, i) => { const [x, y] = ptc(63, i * 45 + 22.5); return `<rect x="${P(x - 1.8)}" y="${P(y - 1.8)}" width="3.6" height="3.6" fill="${i % 2 ? "#bef264" : "#4ade80"}">${an("opacity", ".2;1;.2", 1.6, i * 0.2, 'calcMode="discrete"')}</rect>`; }).join("");
    const up = (x, b) => `<g>${tr("translate", "0 8;0 -6", 2.4, b)}<g>${an("opacity", "0;1;0", 2.4, b)}<path d="M${x - 3},4L${x},1L${x + 3},4M${x - 3},8L${x},5L${x + 3},8" fill="none" stroke="#86efac" stroke-width="1.3"/></g></g>`;
    return wrap(s, rgd("n1g", "#bbf7d0", "#22c55e", 1.2),
      `<polygon points="${poly}" fill="none" stroke="url(#n1g)" stroke-width="2.8" stroke-linejoin="miter" filter="url(#n1gg)"/>` +
      `<polygon points="${poly}" pathLength="100" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="7 93" stroke-linejoin="miter">${an("stroke-dashoffset", "100;0", 3.2)}</polygon>` +
      leds + up(50, 0) + up(50, 1.2));
  },

  // ═══ DÉBUTANT (vus) — pellicule de film qui défile ═══
  watched_50: (s) => {
    let perf = "";
    for (let i = 0; i < 28; i++) perf += radial(i * (360 / 28), 56, `<rect x="-1.9" y="-2.5" width="3.8" height="5" rx="1" fill="#e0f2fe"/>`);
    return wrap(s, rgd("n5w", "#7dd3fc", "#38bdf8", 1.1),
      `<circle cx="50" cy="50" r="56" fill="none" stroke="#0b1a2e" stroke-width="9.6" opacity=".92"/>` +
      `<circle cx="50" cy="50" r="51.2" fill="none" stroke="url(#n5w)" stroke-width="1.2" filter="url(#n5wg)"/><circle cx="50" cy="50" r="60.8" fill="none" stroke="url(#n5w)" stroke-width="1.2" opacity=".8"/>` +
      `<g>${spin(40)}${perf}</g>` +
      `<g filter="url(#n5wg)"><path d="${arcD(56, -30, 25)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8">${tr("rotate", "0 50 50;360 50 50", 5)}</path></g>` +
      star(96, 12, 0.5, "#e0f2fe", 2.4) + star(6, 92, 0.5, "#e0f2fe", 2.4, 1));
  },

  // ═══ VÉTÉRAN — orbites d'atome qui passent derrière l'avatar ═══
  watched_1000: (s) => {
    const orb = [0, 60, 120].map((rot, i) => `<g transform="rotate(${rot} 50 50)"><ellipse cx="50" cy="50" rx="64" ry="23" fill="none" stroke="url(#n1k)" stroke-width="1.5" opacity=".9"/>` +
      `<circle r="3" fill="#fff" stroke="#c4b5fd" stroke-width="1"><animateMotion dur="${4 + i * 0.9}s" repeatCount="indefinite" path="M-14,50A64,23 0 1,1 114,50A64,23 0 1,1 -14,50Z"/></circle></g>`).join("");
    return wrap(s, rgd("n1k", "#c4b5fd", "#f0abfc", 1.4) + OUT_CLIP("n1kc"),
      `<g clip-path="url(#n1kc)" filter="url(#n1kg)">${orb}</g>` +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#n1k)" stroke-width="2.2" filter="url(#n1kg)"/>` +
      star(6, 8, 0.6, "#f5d0fe", 2.4) + star(96, 94, 0.6, "#ddd6fe", 2.4, 1.2));
  },

  // ═══ COMIQUE — anneau qui ondule + confettis ═══
  genre_comedy: (s) => {
    const cols = ["#f43f5e", "#22d3ee", "#a3e635", "#f472b6", "#fbbf24"];
    const conf = Array.from({ length: 12 }, (_, i) => { const [x, y] = ptc(60 + (i % 3) * 2, i * 30 + 10); return `<g transform="translate(${x} ${y})"><g>${tr("rotate", `0;${i % 2 ? 360 : -360}`, 3 + (i % 4) * 0.7, i * 0.2)}${an("opacity", ".4;1;.4", 2.2, i * 0.15)}<rect x="-1.6" y="-0.9" width="3.2" height="1.8" fill="${cols[i % 5]}"/></g></g>`; }).join("");
    return wrap(s, lg("n1m", [[0, "#fde047"], [1, "#fb923c"]]) + fGlow("n1mg", 1.2),
      `<g filter="url(#n1mg)">${spin(16)}<path d="${wavy(52.4, 2.6, 12)}" fill="none" stroke="url(#n1m)" stroke-width="2.6" stroke-linejoin="round"/></g>` +
      `<g>${spin(24, -1)}<path d="${wavy(56.5, 1.6, 18)}" fill="none" stroke="#fef08a" stroke-width=".8" opacity=".6"/></g>` + conf);
  },

  // ═══ SPORTIF — piste à damier qui défile + lignes de vitesse ═══
  genre_sports: (s) => {
    const chev = (y, b) => `<g>${tr("translate", `-16 ${y};16 ${y}`, 1.6, b)}<g>${an("opacity", "0;1;0", 1.6, b)}<path d="M-14,-3L-11,0L-14,3M-9,-3L-6,0L-9,3" fill="none" stroke="#86efac" stroke-width="1.2" stroke-linecap="round"/></g></g>`;
    return wrap(s, rgd("n1s", "#86efac", "#16a34a", 1.2),
      `<circle cx="50" cy="50" r="53.5" fill="none" stroke="#0b1d12" stroke-width="7.4"/>` +
      `<circle cx="50" cy="50" r="51.8" pathLength="100" fill="none" stroke="#f8fafc" stroke-width="3.4" stroke-dasharray="2.5 2.5">${an("stroke-dashoffset", "0;-5", 1.2)}</circle>` +
      `<circle cx="50" cy="50" r="55.2" pathLength="100" fill="none" stroke="#f8fafc" stroke-width="3.4" stroke-dasharray="2.5 2.5" stroke-dashoffset="2.5">${an("stroke-dashoffset", "2.5;-2.5", 1.2)}</circle>` +
      `<circle cx="50" cy="50" r="58.4" fill="none" stroke="url(#n1s)" stroke-width="1.6" filter="url(#n1sg)"/>` +
      `<g transform="translate(60 8)">${chev(0, 0)}</g><g transform="translate(78 92)">${chev(0, 0.5)}</g><g transform="translate(24 98)">${chev(0, 1)}</g>` +
      comet(58.4, 3.6, 1, 0, "#bbf7d0", 1.7));
  },

  // ═══ QUOTIDIEN — fleur de pétales douce qui se balance ═══
  genre_sliceoflife: (s) => {
    let pet = "", pol = "";
    for (let i = 0; i < 8; i++) {
      pet += `<g transform="rotate(${i * 45} 50 50)"><ellipse cx="50" cy="-10" rx="8.2" ry="10.5" fill="url(#n1p)" stroke="#22c55e" stroke-width="1" opacity=".92">${an("ry", "10.5;12;10.5", 3, i * 0.3)}</ellipse></g>`;
      const [x, y] = ptc(52, i * 45 + 22.5); pol += `<circle cx="${x}" cy="${y}" r="1.5" fill="#fde047">${an("opacity", ".3;1;.3", 2.4, i * 0.3)}</circle>`;
    }
    return wrap(s, `<radialGradient id="n1p" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fef9c3"/><stop offset="1" stop-color="#86efac"/></radialGradient>` + fGlow("n1pg", 1.1),
      `<g filter="url(#n1pg)">${tr("rotate", "-6 50 50;6 50 50;-6 50 50", 7)}${pet}</g>` + pol +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="#bbf7d0" stroke-width="1.6"/>` +
      drift(10, 0, 30, 24, 4.4, 0, `<circle cx="0" cy="0" r="1.5" fill="#fde047"/>`) + drift(80, 4, 66, 22, 5, 1.8, `<circle cx="0" cy="0" r="1.3" fill="#fda4af"/>`));
  },

  // ═══════ NOUVEAUX CADRES ═══════
  // BUREAU — écran d'ordinateur avec pied, curseur qui clignote
  ds_desktop: (s) => wrap(s, lg("ndk", "#38bdf8", "#818cf8") + fGlow("ndkg", 1.2),
    `<rect x="-4" y="-4" width="108" height="108" rx="15" fill="none" stroke="url(#ndk)" stroke-width="2.8" filter="url(#ndkg)"/>` +
    `<rect x="-9" y="-9" width="118" height="118" rx="20" fill="none" stroke="#7dd3fc" stroke-width=".7" stroke-dasharray="3 3.4" opacity=".5"/>` +
    `<rect x="-4" y="-4" width="108" height="108" rx="15" pathLength="100" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="9 91" filter="url(#ndkg)">${an("stroke-dashoffset", "100;0", 3.4)}</rect>` +
    `<path d="M38,104L34,117H66L62,104" fill="#0b1226" stroke="url(#ndk)" stroke-width="1.6" stroke-linejoin="round"/><path d="M28,118H72" stroke="url(#ndk)" stroke-width="2.4" stroke-linecap="round"/>` +
    [0, 1, 2].map((i) => `<circle cx="${6 + i * 7}" cy="-9" r="1.7" fill="${["#fb7185", "#fbbf24", "#4ade80"][i]}"/>`).join("") +
    `<rect x="82" y="106" width="9" height="2.6" fill="#7dd3fc">${an("opacity", "1;0;1", 1.1, 0, 'calcMode="discrete"')}</rect>` +
    star(104, -4, 0.6, "#e0f2fe", 2.6)),

  // SAKURA — couronne de pétales + pétales qui tombent
  ds_sakura: (s) => {
    let pet = "";
    for (let i = 0; i < 12; i++) pet += radial(i * 30, 51, `<g>${tr("rotate", `${i % 2 ? -5 : 5};${i % 2 ? 5 : -5};${i % 2 ? -5 : 5}`, 3.4, i * 0.2)}<path d="M0,0C-5.4,-3 -5.4,-12 0,-15C5.4,-12 5.4,-3 0,0Z" fill="url(#nsk)" stroke="#ec4899" stroke-width=".6"/><path d="M0,-1V-9" stroke="#fbcfe8" stroke-width=".5"/></g>`);
    const fall = (x, b, d) => `<g transform="translate(${x} 0)"><g>${tr("translate", "0 -6;8 112", d, b)}${an("opacity", "0;1;1;0", d, b, 'keyTimes="0;.1;.8;1"')}<g>${tr("rotate", "0;360", d * 0.7, b)}<path d="M0,0C-2.4,-1.4 -2.4,-5 0,-6.4C2.4,-5 2.4,-1.4 0,0Z" fill="#fbcfe8"/></g></g></g>`;
    return wrap(s, `<radialGradient id="nsk" cx=".5" cy=".9" r="1"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#fce7f3"/></radialGradient>` + fGlow("nskg", 1),
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="#f9a8d4" stroke-width="1.6"/><g filter="url(#nskg)">${pet}</g>` +
      fall(-10, 0, 6) + fall(108, 2.4, 6.6) + fall(30, 4, 7) + fall(80, 1.2, 6.2));
  },

  // ÉTOILE — shuriken doré à pointes, qui tourne
  ds_star: (s) => {
    const pts = (ro, ri, n, a0 = -90) => Array.from({ length: n * 2 }, (_, i) => ptc(i % 2 ? ri : ro, a0 + (i * 180) / n).join(",")).join(" ");
    return wrap(s, lg("nst", "#fef3c7", "#f59e0b") + fGlow("nstg", 1.4),
      `<g>${spin(26)}<polygon points="${pts(68, 52, 8)}" fill="none" stroke="url(#nst)" stroke-width="2" stroke-linejoin="round" filter="url(#nstg)"/></g>` +
      `<g>${spin(18, -1)}<polygon points="${pts(60, 51.5, 8, -67.5)}" fill="none" stroke="#fde68a" stroke-width=".9" stroke-linejoin="round" opacity=".7"/></g>` +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#nst)" stroke-width="1.8" filter="url(#nstg)"/>` +
      comet(51, 2.8, 1, 0, "#fff", 1.6) + star(0, 0, 0.7, "#fff", 2.4) + star(100, 100, 0.7, "#fff", 2.4, 1.2));
  },

  // GIVRE — flocon de cristal
  ds_ice: (s) => {
    let arms = "";
    for (let i = 0; i < 6; i++) {
      const a = i * 60, [x1, y1] = ptc(51, a), [x2, y2] = ptc(70, a), [bx, by] = ptc(61, a);
      const [l1x, l1y] = ptc(70, a - 14), [r1x, r1y] = ptc(70, a + 14);
      arms += `<g><path d="M${x1},${y1}L${x2},${y2}M${bx},${by}L${P(bx + (l1x - 50) * 0.25)},${P(by + (l1y - 50) * 0.25)}M${bx},${by}L${P(bx + (r1x - 50) * 0.25)},${P(by + (r1y - 50) * 0.25)}" stroke="url(#nic)" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="2" fill="#fff">${an("opacity", ".4;1;.4", 2.4, i * 0.4)}</circle></g>`;
    }
    return wrap(s, lg("nic", "#ecfeff", "#22d3ee") + fGlow("nicg", 1.3),
      `<g filter="url(#nicg)">${spin(40)}${arms}</g>` +
      `<circle cx="50" cy="50" r="50.8" fill="none" stroke="url(#nic)" stroke-width="2.2" filter="url(#nicg)"/>` +
      `<circle cx="50" cy="50" r="55" fill="none" stroke="#a5f3fc" stroke-width=".7" stroke-dasharray="1 3" opacity=".7"/>` +
      drift(20, 100, 14, 70, 4, 0, `<circle r="1.2" fill="#fff"/>`) + drift(86, 104, 92, 72, 4.6, 1.6, `<circle r="1.2" fill="#e0f2fe"/>`) + star(4, 6, 0.6, "#fff", 2.2) + star(98, 94, 0.6, "#cffafe", 2.2, 1));
  },

  // LUNE — croissant de lune + étoiles
  ds_moon: (s) => wrap(s, lg("nmn", "#fef9c3", "#fcd34d") + fGlow("nmng", 2) +
    `<mask id="nmm" maskUnits="userSpaceOnUse" x="-40" y="-40" width="180" height="180"><rect x="-40" y="-40" width="180" height="180" fill="#fff"/><circle cx="59" cy="59" r="62" fill="#000"/></mask>`,
    `<g filter="url(#nmng)"><g mask="url(#nmm)"><circle cx="50" cy="50" r="62" fill="url(#nmn)">${an("opacity", ".85;1;.85", 4)}</circle></g></g>` +
    `<circle cx="50" cy="50" r="50.8" fill="none" stroke="#fde68a" stroke-width="1.4" opacity=".75"/>` +
    star(14, 90, 0.9, "#fef9c3", 2.2) + star(92, 92, 0.6, "#fff", 2.6, 0.8) + star(102, 40, 0.7, "#fde68a", 2.4, 1.4) + star(84, 104, 0.5, "#fff", 2.8, 0.3) + star(36, 4, 0.6, "#fff", 2.5, 1)),
});
