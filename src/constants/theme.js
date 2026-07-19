// ─── SHARED DESIGN TOKENS — glass cards, gradients ────────────────────────────
// Single source of truth for the visual language introduced on the Moodboard
// page, reused across the whole app so every screen reads as one product.
export const GRADIENT_PRIMARY = "linear-gradient(135deg,#6D5BFF,#8B5CF6,#EC4899)";
export const GRADIENT_TEXT = "bg-linear-to-r from-[#8B5CF6] to-[#EC4899] bg-clip-text text-transparent";

export const GLASS = "rounded-[22px] border border-white/7 backdrop-blur-xl";
export const GLASS_STYLE = { background: "rgba(17,24,39,.75)", boxShadow: "0 15px 45px rgba(0,0,0,.35)" };

// Lighter-weight variant for nested/compact elements (rows inside modals, stat tiles) —
// avoids stacking heavy blur-on-blur when a glass card already sits on a blurred backdrop.
export const GLASS_SOFT = "rounded-2xl border border-white/7 bg-white/4";
