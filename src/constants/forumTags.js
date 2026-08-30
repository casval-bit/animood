// ─── FORUM TAGS — lightweight categorization for discussion threads ───────────
const FORUM_TAG_META = [
  { id: "discussion",     emoji: "💬", color: "#8B5CF6" },
  { id: "question",       emoji: "❓", color: "#38BDF8" },
  { id: "theorie",        emoji: "🧠", color: "#EC4899" },
  { id: "recommandation", emoji: "⭐", color: "#FBBF24" },
  { id: "spoiler",        emoji: "⚠️", color: "#EF4444" },
  { id: "rant",           emoji: "😤", color: "#FB923C" },
];

const FORUM_TAG_LABELS = {
  fr: { discussion:"Discussion", question:"Question", theorie:"Théorie",  recommandation:"Recommandation", spoiler:"Spoiler", rant:"Rant" },
  en: { discussion:"Discussion", question:"Question", theorie:"Theory",   recommandation:"Recommendation",  spoiler:"Spoiler", rant:"Rant" },
};

export const getForumTags = (lang = "fr") => {
  const labels = FORUM_TAG_LABELS[lang] || FORUM_TAG_LABELS.fr;
  return FORUM_TAG_META.map(t => ({ ...t, label: labels[t.id] }));
};

export const getForumTag = (id, lang = "fr") => getForumTags(lang).find(t => t.id === id);

export const MAX_THREAD_TAGS = 3;
