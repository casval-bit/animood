// ─── ANILIST IMPORT ───────────────────────────────────────────────────────────
import { sb, supabase } from "./supabase.js";

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function importAniListUser(username, myUsername) {
  const name = username.trim();
  if(!name) throw new Error("Entre un nom d'utilisateur AniList");

  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { userName: name } }),
  });
  const json = await res.json();
  if(json.errors?.length) {
    const msg = json.errors[0]?.message || "";
    if(msg === "Private User")    throw new Error(`La liste de "${name}" est privée sur AniList`);
    if(msg === "User not found")  throw new Error(`Utilisateur AniList "${name}" introuvable`);
    throw new Error(msg || "Erreur AniList");
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

  // ── Sync rated anime to user_votes via Supabase SDK ──────────────────────
  if(myUsername) {
    const ratedEntries = Object.entries(ratings);
    if(ratedEntries.length > 0) {
      const rows = ratedEntries.map(([malId, r]) => ({
        username:  myUsername,
        mal_id:    parseInt(malId),
        moods:     [],
        pts_added: null,
        score:     r.score,
        voted_at:  new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("user_votes")
        .upsert(rows, { onConflict: "username,mal_id" });
      if(error) console.warn("user_votes sync failed:", error.message);
      else console.log(`✅ ${rows.length} notes syncées vers user_votes`);
    }
  }

  return { watched, ratings, statuses, skipped };
}

// ─── FETCH AIRED DATES ────────────────────────────────────────────────────────
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

export async function fetchAiredDates(malIds) {
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
    const SEASON_MAP = { WINTER:"Hiver", SPRING:"Printemps", SUMMER:"Été", FALL:"Automne" };
    media.forEach(m => {
      if(!m.idMal) return;
      result[m.idMal] = {
        season: m.season ? `${SEASON_MAP[m.season]||m.season} ${m.seasonYear}` : null,
        year: m.seasonYear || m.startDate?.year || null,
        startDate: m.startDate,
      };
    });
    return result;
  } catch { return {}; }
}
