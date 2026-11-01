import { useEffect, useState } from "react";
import { signInWithGoogle } from "../api/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_TEXT } from "../constants/theme.js";
import { useLang } from "../context/useLang.js";
import { LOGIN_I18N } from "../constants/loginI18n.js";
import { MOODBOARD_I18N } from "../constants/moodboardI18n.js";
import { MOODS } from "../constants/moods.js";
import { SHOWCASE_BY_MOOD, SHOWCASE_WALL } from "../constants/loginShowcase.js";

const AUTO_CYCLE_MS = 3600; // tant que le visiteur n'a pas choisi, les moods défilent tout seuls
const WALL_COLS = 6;
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ─── MUR D'AFFICHES (fond) ───────────────────────────────────────────────────
// Colonnes qui défilent lentement en sens alterné. Chaque colonne est doublée pour une boucle sans à-coup
// (l'animation remonte de 50 %). Purement décoratif : aucune interaction, masqué aux lecteurs d'écran.
function PosterWall({ color }) {
  const cols = Array.from({ length: WALL_COLS }, (_, c) => SHOWCASE_WALL.filter((_, i) => i % WALL_COLS === c));
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -inset-x-[10%] -inset-y-[20%] flex -rotate-6 justify-center gap-3 opacity-40 sm:gap-4">
        {cols.map((col, c) => (
          <div key={c} className={`w-28 shrink-0 sm:w-36 ${c >= 4 ? "hidden md:block" : ""}`}>
            <div className={`login-wall-col ${c % 2 ? "login-wall-col--down" : ""}`} style={{ animationDuration: `${70 + c * 9}s` }}>
              {[...col, ...col].map((a, i) => (
                <div key={i} className="pb-3 sm:pb-4">
                  <img src={a.img} alt="" loading="eager" decoding="async"
                    className="aspect-[2/3] w-full rounded-xl object-cover" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="login-veil absolute inset-0" />
      {/* Halo de la couleur du mood choisi */}
      <div className="absolute left-1/2 top-1/3 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl transition-colors duration-1000"
        style={{ backgroundColor: color }} />
    </div>
  );
}

// ─── SÉLECTEUR DE MOOD + APERÇU ──────────────────────────────────────────────
function MoodTeaser({ t, lang, mood, onPick, onCta, disabled }) {
  const moodId = mood.id;
  const desc = (MOODBOARD_I18N[lang] || MOODBOARD_I18N.fr).moodDescriptions[moodId];

  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t.pickMood}</p>
      <div className="flex flex-wrap gap-2">
        {MOODS.map(m => {
          const active = m.id === moodId;
          return (
            <button key={m.id} type="button" onClick={() => onPick(m.id)} aria-pressed={active}
              className={`rounded-full border px-3.5 py-2 text-sm font-bold transition duration-300 hover:-translate-y-0.5 ${active ? "scale-105 text-slate-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
              style={active ? { borderColor: m.color, background: `${m.color}33`, boxShadow: `0 0 22px ${m.color}55` } : undefined}>
              <span className="mr-1.5">{m.emoji}</span>{m.label}
            </button>
          );
        })}
      </div>

      {/* key = mood : le bloc est recréé à chaque changement, ce qui relance les animations d'entrée */}
      <div key={moodId} className="mt-4">
        <p className="login-fade-in mb-3 min-h-10 text-sm text-slate-400">{desc}</p>
        <div className="grid max-w-xl grid-cols-5 gap-2 sm:gap-3">
          {SHOWCASE_BY_MOOD[moodId].map((a, i) => (
            <figure key={a.mal_id} className="login-poster-in" style={{ animationDelay: `${i * 70}ms` }}>
              <img src={a.img} alt={a.title} decoding="async"
                className="aspect-[2/3] w-full rounded-xl object-cover ring-1 ring-white/10"
                style={{ boxShadow: `0 10px 28px ${mood.color}40` }} />
              <figcaption className="mt-1.5 truncate text-[11px] font-semibold text-slate-400">{a.title}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <button type="button" onClick={onCta} disabled={disabled}
        className="mt-4 text-sm font-bold transition hover:translate-x-1 disabled:opacity-60">
        <span className={GRADIENT_TEXT}>{t.teaserCta}</span>
      </button>
    </div>
  );
}

export function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [inBrowser, setInBrowser] = useState(false); // appli de bureau : connexion ouverte dans le navigateur
  const { lang, setLang } = useLang();
  const t = LOGIN_I18N[lang] || LOGIN_I18N.fr;
  const [moodId, setMoodId] = useState(MOODS[0].id);
  const [picked, setPicked] = useState(false);
  const mood = MOODS.find(m => m.id === moodId);

  useEffect(() => {
    if (picked || prefersReducedMotion()) return;
    const id = setInterval(() => {
      setMoodId(cur => MOODS[(MOODS.findIndex(m => m.id === cur) + 1) % MOODS.length].id);
    }, AUTO_CYCLE_MS);
    return () => clearInterval(id);
  }, [picked]);

  const pickMood = (id) => { setPicked(true); setMoodId(id); };

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try {
      await signInWithGoogle();
      if (window.animood?.isDesktop) { setInBrowser(true); setLoading(false); }
    }
    catch(e) { setError(e.message); setLoading(false); }
  };

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <PosterWall color={mood.color} />

      <main className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 content-center items-center gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:gap-x-14 lg:gap-y-6">
        {/* ── Accroche + moods ── */}
        <section className="login-rise lg:col-start-1 lg:row-start-1">
          <div className="mb-5 flex items-center gap-3">
            <img src="/logo-mark.png" alt="" className="h-11 w-11 rounded-2xl object-cover" />
            <span className={`text-2xl font-black tracking-tight ${GRADIENT_TEXT}`}>AniMood</span>
          </div>
          <h1 className="text-[2rem] font-black leading-[1.08] tracking-tight text-slate-100 sm:text-5xl lg:text-[2.6rem]">
            {t.heroLine1}<br />
            <span className={GRADIENT_TEXT}>{t.heroLine2}</span>
          </h1>
          <p className="mb-6 mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">{t.heroSub}</p>
          <MoodTeaser t={t} lang={lang} mood={mood} onPick={pickMood} onCta={handleGoogle} disabled={loading} />
        </section>

        {/* ── Connexion ── */}
        <aside className="login-rise lg:col-start-2 lg:row-span-2 lg:row-start-1" style={{ animationDelay: "120ms" }}>
          <div className={`mx-auto w-full max-w-sm p-8 text-center ${GLASS}`} style={GLASS_STYLE}>
            <img src="/logo-mark.png" alt="" className="animate-float mx-auto mb-4 h-20 w-20 rounded-3xl object-cover" />
            <h2 className="mb-1.5 text-2xl font-black tracking-tight text-slate-100">{t.cardTitle}</h2>
            <p className="mb-8 text-sm text-slate-400">{t.cardSub}</p>

            <button
              onClick={handleGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-[15px] font-bold text-slate-100 transition hover:-translate-y-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Spinner small /> : (
                <>
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {t.googleBtn}
                </>
              )}
            </button>

            {inBrowser && !error && <p className="mt-3 text-xs text-slate-400">{t.inBrowser}</p>}
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <p className="mt-6 text-[11px] leading-relaxed text-slate-600">
              {t.disclaimer}
              <br />{t.disclaimer2}
            </p>

            <div className="mt-5 flex justify-center gap-1 text-[11px] font-bold">
              {["fr", "en"].map(l => (
                <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
                  className={`rounded-full px-2.5 py-1 uppercase transition ${lang === l ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Ce qu'il y a dedans ── */}
        <section className="login-rise grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-start-1 lg:row-start-2" style={{ animationDelay: "220ms" }}>
          {t.features.map(f => (
            <div key={f.title} className="rounded-2xl border border-white/7 bg-white/4 p-4 backdrop-blur-xl">
              <div className="mb-1.5 text-xl">{f.icon}</div>
              <p className="text-sm font-black text-slate-100">{f.title}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-400">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
