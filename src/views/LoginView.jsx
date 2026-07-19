import { useState } from "react";
import { signInWithGoogle } from "../api/supabase.js";
import { Spinner } from "../components/Spinner.jsx";
import { GLASS, GLASS_STYLE, GRADIENT_TEXT } from "../constants/theme.js";

export function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try { await signInWithGoogle(); }
    catch(e) { setError(e.message); setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className={`w-full max-w-sm p-8 text-center ${GLASS}`} style={GLASS_STYLE}>
        <div className="mb-3 text-6xl">🌀</div>
        <h1 className={`mb-2 text-4xl font-black tracking-tight ${GRADIENT_TEXT}`}>
          AniMood
        </h1>
        <p className="mb-10 text-sm text-slate-400">Découvre des animés selon ton mood</p>

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
              Se connecter avec Google
            </>
          )}
        </button>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <p className="mt-6 text-[11px] leading-relaxed text-slate-600">
          En te connectant tu acceptes que tes données soient stockées dans AniMood.
          <br />Aucune donnée n'est partagée avec des tiers.
        </p>
      </div>
    </div>
  );
}
