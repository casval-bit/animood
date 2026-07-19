import { STATUS_MAP } from "./statuses.js";

export function parseMALXml(xmlString) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlString, "text/xml");
  const entries = doc.querySelectorAll("anime");
  const statuses = {}, ratings = {};
  entries.forEach(entry => {
    const rawStatus = entry.querySelector("my_status")?.textContent;
    const id        = parseInt(entry.querySelector("series_animedb_id")?.textContent);
    const score     = parseInt(entry.querySelector("my_score")?.textContent || "0");
    if(!id || isNaN(id) || !rawStatus) return;
    const status = STATUS_MAP[rawStatus];
    if(!status) return;
    statuses[id] = status;
    if(score > 0) ratings[id] = { score, moods:[] };
  });
  const watched = Object.entries(statuses).filter(([,s]) => s !== "watchlist").map(([id]) => parseInt(id));
  return { watched, ratings, statuses };
}
