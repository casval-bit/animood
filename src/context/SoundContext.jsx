// ─── ANIMOOD — Sound Context ───────────────────────────────────────────────────
// Sons UI ultra-doux, ambiants — desktop uniquement.
// Sur le web, playSound() est un no-op.

import { createContext, useContext, useCallback, useRef, useState } from "react";
import { isDesktopApp } from "../utils/streamingLinks.js";

// ── LocalStorage ──────────────────────────────────────────────────────────────
const KEY_ENABLED = "animood_sound_enabled";
const KEY_VOLUME  = "animood_sound_volume";
const KEY_PACK    = "animood_sound_pack";

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function savePref(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

// ── Packs disponibles ─────────────────────────────────────────────────────────
export const SOUND_PACKS = [
  { id: "dreamy",  label: { fr: "Rêveur",      en: "Dreamy"   }, desc: { fr: "Sons doux, ambiants, comme des carillons lointains", en: "Soft, ambient, like distant wind chimes" } },
  { id: "crystal", label: { fr: "Cristal",     en: "Crystal"  }, desc: { fr: "Tintements clairs et purs",     en: "Clear, pure chimes"     } },
  { id: "minimal", label: { fr: "Minimaliste", en: "Minimal"  }, desc: { fr: "Presque silencieux, très discret", en: "Almost silent, very subtle" } },
  { id: "cyber",   label: { fr: "Cyber",        en: "Cyber"   }, desc: { fr: "Futuriste et technique",        en: "Futuristic and techy"   } },
];

// ── Primitives ────────────────────────────────────────────────────────────────

/**
 * Oscillateur avec enveloppe ADSR ultra-douce.
 * VOL volontairement limité — jamais agressif.
 */
function osc(ctx, dest, {
  freq1, freq2 = null, dur = 0.15, type = "sine",
  vol = 0.12, attack = 0.012, decay = 0.06, sustain = 0.4,
  startAt = 0, detune = 0,
}) {
  const t0 = ctx.currentTime + startAt;
  const o  = ctx.createOscillator();
  const g  = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq1, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(freq2, 20), t0 + dur * 0.65);
  // ADSR arrondi
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.linearRampToValueAtTime(vol * sustain, t0 + attack + decay);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.04);
}

/** Bruit très filtré, doux comme un souffle */
function breath(ctx, dest, { dur = 0.06, vol = 0.04, freq = 600, q = 6, startAt = 0 }) {
  const t0  = ctx.currentTime + startAt;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d   = buf.getChannelData(0);
  // Fenêtre hanning pour éviter tout clic
  for (let i = 0; i < d.length; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (d.length - 1));
    d[i] = (Math.random() * 2 - 1) * win;
  }
  const src  = ctx.createBufferSource();
  const filt = ctx.createBiquadFilter();
  const g    = ctx.createGain();
  src.buffer = buf;
  filt.type = "bandpass"; filt.frequency.value = freq; filt.Q.value = q;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(dest);
  src.start(t0);
}

/** Reverb plus longue et spacieuse pour effet rêveur */
function makeReverb(ctx, dur = 0.8, decay = 2.5) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

// ── Bibliothèque de sons ──────────────────────────────────────────────────────
// Tous les sons restent sous vol ≤ 0.18 pour être agréables.
// "dreamy"  → sinusoïdales pures, lentes, carillons lointains
// "crystal" → octaves plus hautes, notes distinctes
// "minimal" → quasi-inaudible, présence plus que son
// "cyber"   → triangle + breath léger

const SOUNDS = {

  // ── tab — glissement ascendant très doux ─────────────────────────────────────
  tab: {
    dreamy:  (c,g) => {
      osc(c,g,{freq1:392,freq2:523,dur:0.18,vol:0.13,attack:0.015,decay:0.07,sustain:0.35});
      osc(c,g,{freq1:784,dur:0.12,vol:0.05,attack:0.025,startAt:0.10});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:880,freq2:1047,dur:0.14,vol:0.14,attack:0.006,decay:0.04,sustain:0.25});
      osc(c,g,{freq1:1760,dur:0.08,vol:0.06,attack:0.004,startAt:0.08});
    },
    minimal: (c,g) => { osc(c,g,{freq1:523,freq2:659,dur:0.10,vol:0.05,attack:0.018}); },
    cyber:   (c,g) => {
      osc(c,g,{freq1:440,freq2:660,dur:0.10,type:"triangle",vol:0.10,attack:0.008});
      breath(c,g,{dur:0.03,vol:0.03,freq:2500,startAt:0.06});
    },
  },

  // ── click — souffle délicat ───────────────────────────────────────────────────
  click: {
    dreamy:  (c,g) => {
      breath(c,g,{dur:0.025,vol:0.06,freq:900,q:7});
      osc(c,g,{freq1:440,dur:0.06,vol:0.07,attack:0.005,decay:0.02,sustain:0.1,startAt:0.005});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:1760,dur:0.07,vol:0.12,attack:0.002,decay:0.01,sustain:0.04});
    },
    minimal: (c,g) => { breath(c,g,{dur:0.015,vol:0.03,freq:1000,q:8}); },
    cyber:   (c,g) => {
      breath(c,g,{dur:0.025,vol:0.08,freq:1800,q:4});
      osc(c,g,{freq1:880,dur:0.04,type:"triangle",vol:0.05,startAt:0.01});
    },
  },

  // ── confirm — accord do majeur chaleureux (staggeré, très doux) ──────────────
  confirm: {
    dreamy:  (c,g) => {
      // Do-Mi-Sol étalé, pur sine, très doux
      [[261,0],[329,0.09],[392,0.17]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,dur:0.35,vol:0.13,attack:0.018,decay:0.08,sustain:0.45,startAt:t}));
      // Octave haute en shimmer
      osc(c,g,{freq1:523,dur:0.22,vol:0.05,attack:0.03,sustain:0.2,startAt:0.24});
    },
    crystal: (c,g) => {
      [[523,0],[659,0.08],[784,0.15],[1047,0.22]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,dur:0.22,vol:0.12,attack:0.005,decay:0.04,sustain:0.3,startAt:t}));
    },
    minimal: (c,g) => {
      osc(c,g,{freq1:392,dur:0.15,vol:0.06,attack:0.02,startAt:0});
      osc(c,g,{freq1:523,dur:0.12,vol:0.05,attack:0.02,startAt:0.12});
    },
    cyber:   (c,g) => {
      osc(c,g,{freq1:330,freq2:660,dur:0.18,type:"triangle",vol:0.11,attack:0.012});
      osc(c,g,{freq1:660,freq2:990,dur:0.14,type:"sine",vol:0.09,startAt:0.14});
    },
  },

  // ── back — descente douce ─────────────────────────────────────────────────────
  back: {
    dreamy:  (c,g) => {
      osc(c,g,{freq1:523,freq2:329,dur:0.18,vol:0.12,attack:0.010,decay:0.06,sustain:0.3});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:880,freq2:659,dur:0.14,vol:0.13,attack:0.005,decay:0.03,sustain:0.2});
    },
    minimal: (c,g) => { osc(c,g,{freq1:440,freq2:330,dur:0.10,vol:0.05,attack:0.015}); },
    cyber:   (c,g) => { osc(c,g,{freq1:523,freq2:220,dur:0.12,type:"triangle",vol:0.10,attack:0.008}); },
  },

  // ── notify — deux notes douces, légèrement magiques ──────────────────────────
  notify: {
    dreamy:  (c,g) => {
      // Mi-La — intervalle de quinte, très consonant
      osc(c,g,{freq1:329,dur:0.20,vol:0.15,attack:0.012,decay:0.07,sustain:0.4,startAt:0});
      osc(c,g,{freq1:493,dur:0.22,vol:0.13,attack:0.012,decay:0.08,sustain:0.35,startAt:0.18});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:880,dur:0.16,vol:0.14,attack:0.004,decay:0.03,sustain:0.2,startAt:0});
      osc(c,g,{freq1:1175,dur:0.18,vol:0.12,attack:0.004,startAt:0.14});
    },
    minimal: (c,g) => {
      osc(c,g,{freq1:659,dur:0.10,vol:0.05,attack:0.018,startAt:0});
      osc(c,g,{freq1:784,dur:0.10,vol:0.04,attack:0.018,startAt:0.12});
    },
    cyber:   (c,g) => {
      osc(c,g,{freq1:660,dur:0.10,type:"triangle",vol:0.11,attack:0.008,startAt:0});
      breath(c,g,{dur:0.03,vol:0.04,freq:2200,startAt:0.08});
      osc(c,g,{freq1:880,dur:0.10,type:"triangle",vol:0.10,attack:0.008,startAt:0.13});
    },
  },

  // ── error — tension très douce, pas agressive ────────────────────────────────
  error: {
    dreamy:  (c,g) => {
      // Demi-ton descendant, très pianissimo
      osc(c,g,{freq1:277,freq2:261,dur:0.22,vol:0.11,attack:0.016,decay:0.08,sustain:0.35,startAt:0});
      osc(c,g,{freq1:311,dur:0.16,vol:0.07,attack:0.016,sustain:0.2,startAt:0.20});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:466,dur:0.18,vol:0.13,attack:0.006,startAt:0});
      osc(c,g,{freq1:440,dur:0.18,vol:0.10,attack:0.008,startAt:0.05,detune:-15});
    },
    minimal: (c,g) => { osc(c,g,{freq1:277,dur:0.12,vol:0.05,attack:0.020}); },
    cyber:   (c,g) => {
      breath(c,g,{dur:0.05,vol:0.08,freq:250,q:2});
      osc(c,g,{freq1:220,freq2:196,dur:0.16,type:"triangle",vol:0.10,attack:0.012,startAt:0.04});
    },
  },

  // ── vote — légèreté joyeuse ───────────────────────────────────────────────────
  vote: {
    dreamy:  (c,g) => {
      osc(c,g,{freq1:392,freq2:523,dur:0.18,vol:0.14,attack:0.010,decay:0.06,sustain:0.4});
      osc(c,g,{freq1:659,dur:0.14,vol:0.08,attack:0.016,startAt:0.14});
    },
    crystal: (c,g) => {
      osc(c,g,{freq1:880,freq2:1047,dur:0.14,vol:0.14,attack:0.003,decay:0.03,sustain:0.25});
      osc(c,g,{freq1:1319,dur:0.10,vol:0.09,attack:0.003,startAt:0.12});
    },
    minimal: (c,g) => { osc(c,g,{freq1:523,freq2:659,dur:0.12,vol:0.06,attack:0.018}); },
    cyber:   (c,g) => {
      osc(c,g,{freq1:330,freq2:660,dur:0.12,type:"triangle",vol:0.11,attack:0.010});
      breath(c,g,{dur:0.025,vol:0.04,freq:2000,startAt:0.10});
    },
  },

  // ── unlock — fanfare onirique montante ────────────────────────────────────────
  unlock: {
    dreamy:  (c,g) => {
      // Arpège sol-do-mi-sol, très lent, avec shimmer
      [[196,0],[261,0.13],[329,0.25],[392,0.36]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,freq2:f*1.12,dur:0.30,vol:0.14,attack:0.014,decay:0.08,sustain:0.45,startAt:t}));
      // Shimmer final haut
      osc(c,g,{freq1:1047,dur:0.28,vol:0.06,attack:0.030,sustain:0.2,startAt:0.46});
      osc(c,g,{freq1:1568,dur:0.20,vol:0.04,attack:0.040,sustain:0.15,startAt:0.54});
    },
    crystal: (c,g) => {
      [[523,0],[659,0.11],[784,0.21],[988,0.30],[1175,0.39]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,dur:0.20,vol:0.13,attack:0.004,decay:0.03,sustain:0.25,startAt:t}));
    },
    minimal: (c,g) => {
      [[329,0],[392,0.12],[523,0.23]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,dur:0.14,vol:0.06,attack:0.020,startAt:t}));
    },
    cyber:   (c,g) => {
      [[220,0],[330,0.10],[440,0.19],[660,0.27]].forEach(([f,t]) =>
        osc(c,g,{freq1:f,freq2:f*1.4,dur:0.15,type:"triangle",vol:0.12,attack:0.010,startAt:t}));
      breath(c,g,{dur:0.05,vol:0.05,freq:2500,startAt:0.36});
    },
  },
};

// ── Context ───────────────────────────────────────────────────────────────────
const SoundCtx = createContext(null);

export function SoundProvider({ children }) {
  const isDesktop = isDesktopApp();

  const audioCtxRef = useRef(null);
  const masterGain  = useRef(null);
  const reverbRef   = useRef(null);
  const dryGainRef  = useRef(null);
  const wetGainRef  = useRef(null);

  const [soundEnabled, _setSoundEnabled] = useState(() => loadPref(KEY_ENABLED, true));
  const [volume, _setVolume]             = useState(() => loadPref(KEY_VOLUME, 0.65));
  const [pack, _setPack]                 = useState(() => loadPref(KEY_PACK, "dreamy"));
  const enabledRef = useRef(soundEnabled);
  const volumeRef  = useRef(volume);
  const packRef    = useRef(pack);

  function getCtx() {
    if (!audioCtxRef.current) {
      const ACtx = window.AudioContext || window.webkitAudioContext;
      if (!ACtx) return null;
      const ctx = new ACtx();
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.connect(ctx.destination);
      masterGain.current = master;

      // Reverb plus spacieuse (wet 22%) pour l'effet rêveur
      const reverb  = makeReverb(ctx, 0.8, 2.5);
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      dryGain.gain.value = 0.82;
      wetGain.gain.value = 0.22;
      dryGain.connect(master);
      reverb.connect(wetGain);
      wetGain.connect(master);
      reverbRef.current  = reverb;
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  const playSound = useCallback((name) => {
    if (!isDesktop) return;
    if (!enabledRef.current) return;
    const fn = SOUNDS[name]?.[packRef.current] ?? SOUNDS[name]?.dreamy;
    if (!fn) return;
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const vol = ctx.createGain();
      // Volume global × 0.50 pour rester doux
      vol.gain.value = volumeRef.current * 0.50;
      vol.connect(dryGainRef.current);
      vol.connect(reverbRef.current);
      fn(ctx, vol);
    } catch { /* silent */ }
  }, [isDesktop]);

  const setSoundEnabled = useCallback((v) => { enabledRef.current = v; _setSoundEnabled(v); savePref(KEY_ENABLED, v); }, []);
  const setVolume       = useCallback((v) => { volumeRef.current = v; _setVolume(v); savePref(KEY_VOLUME, v); }, []);
  const setPack         = useCallback((v) => { packRef.current = v; _setPack(v); savePref(KEY_PACK, v); }, []);

  return (
    <SoundCtx.Provider value={{ playSound, soundEnabled, setSoundEnabled, volume, setVolume, pack, setPack, packs: SOUND_PACKS }}>
      {children}
    </SoundCtx.Provider>
  );
}

export const useSound = () => {
  const ctx = useContext(SoundCtx);
  if (!ctx) throw new Error("useSound must be inside <SoundProvider>");
  return ctx;
};
