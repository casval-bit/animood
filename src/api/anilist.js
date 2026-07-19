// ─── ANILIST IMPORT ───────────────────────────────────────────────────────────
// Pulls a user's anime list straight from AniList's public GraphQL API (no auth,
// full CORS support) and maps it onto the same {watched, ratings, statuses} shape
// produced by parseMALXml() so both import paths can share one merge codepath.

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
  const statuses = {}, ratings = {};
  let skipped = 0;

  for(const list of lists) {
    if(list.isCustomList) continue; // avoid double-counting entries also on custom lists
    for(const entry of list.entries || []) {
      const malId = entry.media?.idMal;
      if(!malId) { skipped++; continue; }
      statuses[malId] = STATUS_MAP[entry.status] || "completed";
      if(entry.score > 0) ratings[malId] = { score: entry.score, moods: [] };
    }
  }

  const watched = Object.entries(statuses).filter(([,s]) => s !== "watchlist").map(([id]) => parseInt(id));
  return { watched, ratings, statuses, skipped };
}
