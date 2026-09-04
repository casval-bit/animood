// ─── ANIME TRACKING STATUSES ──────────────────────────────────────────────────
export const STATUS_MAP = {"Completed":"completed","Watching":"watching","Plan to Watch":"watchlist","Dropped":"dropped","On-Hold":"onhold"};

export const STATUS_LABELS = {
  fr: { completed:"Complété",  watching:"En cours", watchlist:"À voir",    dropped:"Abandonné", onhold:"En pause" },
  en: { completed:"Completed", watching:"Watching", watchlist:"To watch", dropped:"Dropped",    onhold:"On hold" },
};

export const getStatusLabel = (id, lang = "fr") => (STATUS_LABELS[lang] || STATUS_LABELS.fr)[id] || id;

export const STATUS_COLORS = {
  completed: {border:"#1e3a5f", bg:"rgba(30,58,95,0.25)",   dot:"#3b82f6"},
  watching:  {border:"#14532d", bg:"rgba(20,83,45,0.25)",    dot:"#22c55e"},
  watchlist: {border:"#374151", bg:"rgba(55,65,81,0.2)",     dot:"#9ca3af"},
  dropped:   {border:"#7f1d1d", bg:"rgba(127,29,29,0.25)",   dot:"#ef4444"},
  onhold:    {border:"#78350f", bg:"rgba(120,53,15,0.25)",   dot:"#f59e0b"},
};

export const STATUS_PRIORITY = {watching:0, onhold:1, completed:2, watchlist:3, dropped:4};
