// ─── ANILIST IMPORT ───────────────────────────────────────────────────────────
import { sb } from "./supabase.js";

const ANILIST_URL = "https://graphql.anilist.co";
const QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    lists {
      isCustomList
      entries {
        status
        score(format: POINT_10)
        media { idMal }
      }
    }
  }
}`;

const STATUS_MAP = {
  CURRENT:   "watching",
  REPEATING: "watching",
  COMPLETED: "completed",
  PAUSED:    "onhold",
  DROPPED:   "dropped",
  PLANNING:  "watchlist",
};

export async function importAniListUser(username, myUsername, lang = "fr") {
  const name = username.trim();
  if(!name) throw new Error(lang === "en" ? "Enter an AniList username" : "Entre un nom d'utilisateur AniList");

  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { userName: name } }),
  });
  const json = await res.json();
  if(json.errors?.length) {
    const msg = json.errors[0]?.message || "";
    if(msg === "Private User")    throw new Error(lang === "en" ? `"${name}"'s list is private on AniList` : `La liste de "${name}" est privée sur AniList`);
    if(msg === "User not found")  throw new Error(lang === "en" ? `AniList user "${name}" not found` : `Utilisateur AniList "${name}" introuvable`);
    throw new Error(msg || (lang === "en" ? "AniList error" : "Erreur AniList"));
  }

  const lists = json.data?.MediaListCollection?.lists || [];
  const statuses = {}, ratings = {};
  let skipped = 0;

  for(const list of lists) {
    if(list.isCustomList) continue;
    for(const entry of list.entries || []) {
      const malId = entry.media?.idMal;
      if(!malId) { skipped++; continue; }
      statuses[malId] = STATUS_MAP[entry.status] || "completed";
      if(entry.score > 0) ratings[malId] = { score: entry.score, moods: [] };
    }
  }

  const watched = Object.entries(statuses)
    .filter(([,s]) => s !== "watchlist")
    .map(([id]) => parseInt(id));

  // ── Sync rated anime to user_votes so friend scores work ──────────────────
  if(myUsername) {
    const ratedEntries = Object.entries(ratings);
    // Batch upsert in chunks of 50 to avoid request size limits
    const CHUNK = 50;
    for(let i = 0; i < ratedEntries.length; i += CHUNK) {
      const chunk = ratedEntries.slice(i, i + CHUNK);
      const rows = chunk.map(([malId, r]) => ({
        username:   myUsername,
        mal_id:     parseInt(malId),
        moods:      [],
        pts_added:  null,
        score:      r.score,
        voted_at:   new Date().toISOString(),
      }));
      try {
        await sb.query("user_votes?on_conflict=username,mal_id", {
          method: "POST",
          headers: { ...sb.headers, "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(rows),
        });
      } catch(e) {
        console.warn("user_votes sync failed for chunk", i, e);
      }
    }
  }

  return { watched, ratings, statuses, skipped };
}

// ─── FETCH AIRED DATES ────────────────────────────────────────────────────────
// Used by ForumView to get season/year info for anime by MAL ID
const AIRED_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: ANIME) {
      idMal
      season
      seasonYear
      startDate { year month day }
    }
  }
}`;

const SEASON_MAP = {
  fr: { WINTER:"Hiver", SPRING:"Printemps", SUMMER:"Été", FALL:"Automne" },
  en: { WINTER:"Winter", SPRING:"Spring", SUMMER:"Summer", FALL:"Fall" },
};

export async function fetchAiredDates(malIds, lang = "fr") {
  if(!malIds?.length) return {};
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query: AIRED_QUERY, variables: { ids: malIds } }),
    });
    const json = await res.json();
    const media = json.data?.Page?.media || [];
    const result = {};
    const seasons = SEASON_MAP[lang] || SEASON_MAP.fr;
    media.forEach(m => {
      if(!m.idMal) return;
      result[m.idMal] = {
        season: m.season ? `${seasons[m.season]||m.season} ${m.seasonYear}` : null,
        year: m.seasonYear || m.startDate?.year || null,
        startDate: m.startDate,
      };
    });
    return result;
  } catch { return {}; }
}
