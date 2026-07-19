// ─── ANIME TRACKING STATUSES ──────────────────────────────────────────────────
export const STATUS_MAP = {"Completed":"completed","Watching":"watching","Plan to Watch":"watchlist","Dropped":"dropped","On-Hold":"onhold"};

export const STATUS_COLORS = {
  completed: {border:"#1e3a5f", bg:"rgba(30,58,95,0.25)",   label:"Complété",  dot:"#3b82f6"},
  watching:  {border:"#14532d", bg:"rgba(20,83,45,0.25)",    label:"En cours",  dot:"#22c55e"},
  watchlist: {border:"#374151", bg:"rgba(55,65,81,0.2)",     label:"À voir",    dot:"#9ca3af"},
  dropped:   {border:"#7f1d1d", bg:"rgba(127,29,29,0.25)",   label:"Abandonné", dot:"#ef4444"},
  onhold:    {border:"#78350f", bg:"rgba(120,53,15,0.25)",   label:"En pause",  dot:"#f59e0b"},
};

export const STATUS_PRIORITY = {watching:0, onhold:1, completed:2, watchlist:3, dropped:4};
