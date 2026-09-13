// ─── BADGES SYSTEM ────────────────────────────────────────────────────────────
// Suit exactement la même logique que les frames (src/frames/frames.js).
// Conditions de déblocage calculées côté client, affichage dans le profil.
// Chaque badge a un emoji, une couleur, et une condition.

export const BADGES = {

  // ── WATCHED ─────────────────────────────────────────────────────────────────
  watched_10: {
    id:"watched_10", category:"watched",
    label:"Curieux", desc:"10 animés vus",
    emoji:"🔍", color:"#94A3B8",
    threshold: 10,
  },
  watched_100: {
    id:"watched_100", category:"watched",
    label:"Amateur", desc:"100 animés vus",
    emoji:"📚", color:"#A3E635",
    threshold: 100,
  },
  watched_500: {
    id:"watched_500", category:"watched",
    label:"Connaisseur", desc:"500 animés vus",
    emoji:"🎓", color:"#FB923C",
    threshold: 500,
  },
  watched_1000: {
    id:"watched_1000", category:"watched",
    label:"Expert", desc:"1000 animés vus",
    emoji:"👑", color:"#FBBF24",
    threshold: 1000,
  },
  watched_5000: {
    id:"watched_5000", category:"watched",
    label:"Légende", desc:"5000 animés vus",
    emoji:"🌟", color:"#FDE68A",
    threshold: 5000,
  },

  // ── FOLLOWERS ──────────────────────────────────────────────────────────────
  followers_10: {
    id:"followers_10", category:"followers",
    label:"Reconnu", desc:"10 abonnés",
    emoji:"🤝", color:"#C0C0C0",
    threshold: 10,
  },
  followers_50: {
    id:"followers_50", category:"followers",
    label:"Populaire", desc:"50 abonnés",
    emoji:"⭐", color:"#FFD700",
    threshold: 50,
  },
  followers_250: {
    id:"followers_250", category:"followers",
    label:"Célébrité", desc:"250 abonnés",
    emoji:"💎", color:"#A5F3FC",
    threshold: 250,
  },

  // ── CONTRIBUTION (mood votes) ──────────────────────────────────────────────
  contrib_10: {
    id:"contrib_10", category:"contribution",
    label:"Novice", desc:"10 pts de mood assignés",
    emoji:"🌱", color:"#6EE7B7",
    threshold: 10,
  },
  contrib_100: {
    id:"contrib_100", category:"contribution",
    label:"Contributeur", desc:"100 pts de mood assignés",
    emoji:"🔬", color:"#818CF8",
    threshold: 100,
  },
  contrib_1000: {
    id:"contrib_1000", category:"contribution",
    label:"Oracle", desc:"1000 pts de mood assignés",
    emoji:"🔮", color:"#F0ABFC",
    threshold: 1000,
  },

  // ── JEUX ───────────────────────────────────────────────────────────────────
  games_100: {
    id:"games_100", category:"games",
    label:"Joueur", desc:"100 pts de jeu",
    emoji:"🎮", color:"#86EFAC",
    threshold: 100,
  },
  games_500: {
    id:"games_500", category:"games",
    label:"Compétiteur", desc:"500 pts de jeu",
    emoji:"🏅", color:"#60A5FA",
    threshold: 500,
  },
  games_2000: {
    id:"games_2000", category:"games",
    label:"Champion", desc:"2000 pts de jeu",
    emoji:"🏆", color:"#F97316",
    threshold: 2000,
  },
  games_5000: {
    id:"games_5000", category:"games",
    label:"Roi du jeu", desc:"5000 pts de jeu",
    emoji:"👑", color:"#F0ABFC",
    threshold: 5000,
  },

  // ── GENRE (premier genre à 100) ────────────────────────────────────────────
  genre_explorer: {
    id:"genre_explorer", category:"genre",
    label:"Explorateur", desc:"Premier genre à 100 animés",
    emoji:"🗺️", color:"#34D399",
    threshold: 100,
  },

  // ── TOTAL RATED ────────────────────────────────────────────────────────────
  rated_100: {
    id:"rated_100", category:"rated",
    label:"Critique", desc:"100 animés notés",
    emoji:"✍️", color:"#A78BFA",
    threshold: 100,
  },
  rated_500: {
    id:"rated_500", category:"rated",
    label:"Évaluateur", desc:"500 animés notés",
    emoji:"📝", color:"#818CF8",
    threshold: 500,
  },
};

// ── Compute all unlocked badges for a user ────────────────────────────────────
export function getUnlockedBadges({ watchedCount, followerCount, userVotes, gamePoints=0, genreCounts={}, ratedCount=0 }) {
  const unlocked = [];

  // Watched
  unlocked.push(BADGES.watched_10);   // always — 0 is not a badge
  if(watchedCount >= 100)  unlocked.push(BADGES.watched_100);
  if(watchedCount >= 500)  unlocked.push(BADGES.watched_500);
  if(watchedCount >= 1000) unlocked.push(BADGES.watched_1000);
  if(watchedCount >= 5000) unlocked.push(BADGES.watched_5000);

  // Followers
  if(followerCount >= 10)  unlocked.push(BADGES.followers_10);
  if(followerCount >= 50)  unlocked.push(BADGES.followers_50);
  if(followerCount >= 250) unlocked.push(BADGES.followers_250);

  // Contribution
  const totalPts = (userVotes||[]).reduce((sum, v) => {
    const pts = v.pts_added;
    if(!pts || typeof pts !== "object") return sum;
    return sum + Object.values(pts).reduce((a,b)=>a+(parseInt(b)||0),0);
  }, 0);
  if(totalPts >= 10)   unlocked.push(BADGES.contrib_10);
  if(totalPts >= 100)  unlocked.push(BADGES.contrib_100);
  if(totalPts >= 1000) unlocked.push(BADGES.contrib_1000);

  // Games
  if(gamePoints >= 100)  unlocked.push(BADGES.games_100);
  if(gamePoints >= 500)  unlocked.push(BADGES.games_500);
  if(gamePoints >= 2000) unlocked.push(BADGES.games_2000);
  if(gamePoints >= 5000) unlocked.push(BADGES.games_5000);

  // Genre — premier genre à 100+
  if(Object.values(genreCounts).some(c => c >= 100)) {
    unlocked.push(BADGES.genre_explorer);
  }

  // Rated
  if(ratedCount >= 100)  unlocked.push(BADGES.rated_100);
  if(ratedCount >= 500)  unlocked.push(BADGES.rated_500);

  return unlocked;
}

// ── Get the "best" badge (highest tier in a priority order) ──────────────────
export function getBestBadge(unlocked) {
  if(!unlocked?.length) return null;
  const priority = ["watched","contribution","followers","games","genre","rated"];
  // Sort by category priority, then by threshold descending within category
  const sorted = [...unlocked].sort((a,b) => {
    const pa = priority.indexOf(a.category);
    const pb = priority.indexOf(b.category);
    if(pa !== pb) return pa - pb;
    return (b.threshold||0) - (a.threshold||0);
  });
  return sorted[sorted.length - 1];
}

// ── i18n helpers ─────────────────────────────────────────────────────────────
const BADGE_LABELS_EN = {
  watched_10:"Curious", watched_100:"Amateur", watched_500:"Connoisseur",
  watched_1000:"Expert", watched_5000:"Legend",
  followers_10:"Recognized", followers_50:"Popular", followers_250:"Celebrity",
  contrib_10:"Novice", contrib_100:"Contributor", contrib_1000:"Oracle",
  games_100:"Gamer", games_500:"Competitor", games_2000:"Champion", games_5000:"Game King",
  genre_explorer:"Explorer",
  rated_100:"Critic", rated_500:"Evaluator",
};

const BADGE_DESCS_EN = {
  watched_10:"10 anime watched", watched_100:"100 anime watched", watched_500:"500 anime watched",
  watched_1000:"1000 anime watched", watched_5000:"5000 anime watched",
  followers_10:"10 followers", followers_50:"50 followers", followers_250:"250 followers",
  contrib_10:"10 mood pts assigned", contrib_100:"100 mood pts assigned", contrib_1000:"1000 mood pts assigned",
  games_100:"100 game pts", games_500:"500 game pts", games_2000:"2000 game pts", games_5000:"5000 game pts",
  genre_explorer:"First genre with 100 anime",
  rated_100:"100 anime rated", rated_500:"500 anime rated",
};

export function getBadgeLabel(badgeOrId, lang = "fr") {
  const badge = typeof badgeOrId === "string" ? BADGES[badgeOrId] : badgeOrId;
  if(!badge) return "";
  return lang === "en" ? (BADGE_LABELS_EN[badge.id] || badge.label) : badge.label;
}

export function getBadgeDesc(badgeOrId, lang = "fr") {
  const badge = typeof badgeOrId === "string" ? BADGES[badgeOrId] : badgeOrId;
  if(!badge) return "";
  return lang === "en" ? (BADGE_DESCS_EN[badge.id] || badge.desc) : badge.desc;
}

// ── Render badge emoji with color for inline display ─────────────────────────
export function BadgeDisplay({ badge, size = 18 }) {
  if(!badge) return null;
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{
        fontSize: size,
        lineHeight: 1,
        filter: `drop-shadow(0 0 4px ${badge.color}60)`,
      }}
      title={`${badge.label} — ${badge.desc}`}
    >
      {badge.emoji}
    </span>
  );
}