// ─── ANILIST IMPORT ───────────────────────────────────────────────────────────
// Pulls a user's anime list straight from AniList's public GraphQL API (no auth,
// full CORS support) and maps it onto the same {watched, ratings, statuses} shape
// produced by parseMALXml() so both import paths can share one merge codepath.

const ANILIST_URL = "https://graphql.anilist.co";

const QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    lists {
      name
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

export async function importAniListUser(username) {
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
    if(msg === "Private User") throw new Error(`La liste de "${name}" est privée sur AniList`);
    if(msg === "User not found") throw new Error(`Utilisateur AniList "${name}" introuvable`);
    throw new Error(msg || "Erreur AniList");
  }

  const lists = json.data?.MediaListCollection?.lists || [];
  const statuses = {}, ratings = {}, customLists = {};
  let skipped = 0;

  for(const list of lists) {
    if(list.isCustomList) {
      // Custom (sub-)lists mirror entries already counted on a status list above —
      // just record membership, don't touch statuses/ratings again.
      for(const entry of list.entries || []) {
        const malId = entry.media?.idMal;
        if(!malId || !list.name) continue;
        (customLists[malId] ||= []).push(list.name);
      }
      continue;
    }
    for(const entry of list.entries || []) {
      const malId = entry.media?.idMal;
      if(!malId) { skipped++; continue; }
      statuses[malId] = STATUS_MAP[entry.status] || "completed";
      if(entry.score > 0) ratings[malId] = { score: entry.score, moods: [] };
    }
  }

  const watched = Object.entries(statuses).filter(([,s]) => s !== "watchlist").map(([id]) => parseInt(id));
  return { watched, ratings, statuses, customLists, skipped };
}

// ─── Exact air dates for a batch of MAL ids — Jikan only stores the year, but
// AniList's idMal_in filter gives day-level startDate in a single request, which
// is what a real countdown ("J-12") needs.
const DATES_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: ANIME) {
      idMal
      startDate { year month day }
    }
  }
}`;

export async function fetchAiredDates(malIds) {
  const ids = [...new Set(malIds)].filter(Boolean).slice(0, 50);
  if(!ids.length) return {};
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query: DATES_QUERY, variables: { ids } }),
    });
    const json = await res.json();
    const out = {};
    (json.data?.Page?.media || []).forEach(m => {
      const d = m.startDate;
      if(m.idMal && d?.year && d?.month && d?.day) out[m.idMal] = new Date(Date.UTC(d.year, d.month - 1, d.day));
    });
    return out;
  } catch { return {}; }
}
