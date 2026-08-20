// ─── FORUM TAGS — lightweight categorization for discussion threads ───────────
export const FORUM_TAGS = [
  { id: "discussion",     label: "Discussion",     emoji: "💬", color: "#8B5CF6" },
  { id: "question",       label: "Question",       emoji: "❓", color: "#38BDF8" },
  { id: "theorie",        label: "Théorie",        emoji: "🧠", color: "#EC4899" },
  { id: "recommandation", label: "Recommandation", emoji: "⭐", color: "#FBBF24" },
  { id: "spoiler",        label: "Spoiler",        emoji: "⚠️", color: "#EF4444" },
  { id: "rant",           label: "Rant",           emoji: "😤", color: "#FB923C" },
];

export const getForumTag = id => FORUM_TAGS.find(t => t.id === id);

export const MAX_THREAD_TAGS = 3;
