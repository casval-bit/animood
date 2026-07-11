// ─── CONSTANTS & CONTEXT ──────────────────────────────────────────────────────
import { createContext, useContext } from "react";

export const MOOD_KEYS = ["emotional","happy","twisted","chill","in_love","hype","dark","thrills"];
export const MOOD_KEYS_V2 = MOOD_KEYS;

export const MOODS = [
  {id:"emotional", label:"Emotional", emoji:"💔", color:"#A78BFA"},
  {id:"happy",     label:"Happy",     emoji:"✨", color:"#FFD93D"},
  {id:"hype",      label:"Hype",      emoji:"⚡", color:"#F97316"},
  {id:"dark",      label:"Dark",      emoji:"🩸", color:"#EF4444"},
  {id:"chill",     label:"Chill",     emoji:"🌿", color:"#34D399"},
  {id:"twisted",   label:"Twisted",   emoji:"🌀", color:"#06B6D4"},
  {id:"in_love",   label:"In Love",   emoji:"🌸", color:"#F9A8D4"},
  {id:"thrills",   label:"Thrills",   emoji:"🎢", color:"#FB923C"},
];

export const DURATIONS   = [{id:"all",label:"Tout",emoji:"🔀"},{id:"short",label:"Court",emoji:"⚡"},{id:"medium",label:"Moyen",emoji:"📺"},{id:"long",label:"Long",emoji:"📚"}];
export const MEDIA_TYPES = [{id:"all",label:"Tout",emoji:"🔀"},{id:"TV",label:"Animé",emoji:"📺"},{id:"Movie",label:"Film",emoji:"🎬"},{id:"OVA",label:"OAV",emoji:"💿"}];
export const COUNTRIES   = [{id:"all",label:"Tout",emoji:"🔀"},{id:"JP",label:"Japonais",emoji:"🇯🇵"},{id:"other",label:"Autres",emoji:"🌍"}];
export const STREAMING_COLORS = {"Netflix":"#E50914","Crunchyroll":"#F47521","ADN":"#00AEEF","Hidive":"#00BCD4","Amazon Prime Video":"#00A8E0","Funimation":"#410099"};

export const STATUS_MAP = {"Completed":"completed","Watching":"watching","Plan to Watch":"watchlist","Dropped":"dropped","On-Hold":"onhold"};
export const STATUS_COLORS = {
  completed: {border:"#1e3a5f", bg:"rgba(30,58,95,0.25)",   label:"Complété",  dot:"#3b82f6"},
  watching:  {border:"#14532d", bg:"rgba(20,83,45,0.25)",    label:"En cours",  dot:"#22c55e"},
  watchlist: {border:"#374151", bg:"rgba(55,65,81,0.2)",     label:"À voir",    dot:"#9ca3af"},
  dropped:   {border:"#7f1d1d", bg:"rgba(127,29,29,0.25)",   label:"Abandonné", dot:"#ef4444"},
  onhold:    {border:"#78350f", bg:"rgba(120,53,15,0.25)",   label:"En pause",  dot:"#f59e0b"},
};

export const AVATAR_EMOJIS = ["🎮","🌸","⚔️","🌀","💀","🐉","🦊","🐺","🌙","⭐","🔥","💎","🎭","🎯","🌊","🦋","🎪","🏯","🌺","🍜","🎸","🎨","🚀","🧩","🦁","🐧","🎃","👾","🌈","🦄"];

export const DEFAULT_PROFILE = {
  id:"brice", name:"Brice", avatar:"🎮", bio:"",
  watched:[], statuses:{}, ratings:{},
  favorites:[null,null,null,null,null],
  hiddenCompleted:[], posts:[],
};

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export const getMoodObj = id => MOODS.find(m=>m.id===id);

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

// Studio → Country mapping
export const CN_STUDIOS = new Set([
  "shanghai animation film studio","ruo hong culture","suoyi technology","fantawild animation",
  "haoliners animation","foch film","sparkly key animation studio","b.cmay pictures",
  "big firebird culture","cctv animation group","motion magic","nice boat animation",
  "original force","shengying animation","shenman entertainment","alpha animation",
  "l²studio","wawayu animation","cg year","wonder cat animation","breakbottle","rocen",
  "colored pencil animation","landq studios","liberty animation studio","xing yi kai chen",
  "yien animation studio","dandelion animation studio","oriental creative color",
  "painting dream","transcendence picture","cloud art","light chaser animation studios",
  "qingxiang culture","qiyuan yinghua","hutoon animation","east fish studio",
  "seven stone entertainment","blue cat","kung fu frog animation","new deer","sek studios",
  "sharefun studio","lingsanwu animation","lx animation studio","huamei animation",
  "shanghai hippo animation","painted blade studio","passion paint animation","aqua aris",
  "y.o.u.c","phoenix entertainment","cmc media","pb animation","red dog culture house",
  "yhkt entertainment","jinnis animation studios","lan studio","qzil.la",
  "next media animation","build dream","comma studio","2:10 animation",
]);

export const KR_STUDIOS = new Set([
  "samg entertainment","dongwoo a&e","iconix entertainment","dr movie","daewon media",
  "dangun pictures","ocon studio","atoonz","mook animation",
]);

export function detectCountry(studios=[], producers=[]) {
  const all = [...studios,...producers].map(s=>(s.name||s||"").toLowerCase().trim());
  if(all.some(n=>[...CN_STUDIOS].some(cn=>n.includes(cn)))) return "CN";
  if(all.some(n=>[...KR_STUDIOS].some(kr=>n.includes(kr)))) return "KR";
  return "JP";
}
