import { BANNED_WORDS } from "../constants/bannedWords.js";

// Normalise pour contourner accents, majuscules et leetspeak basique (@ -> a, 0 -> o, etc.)
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[013]/g, m => (m === "3" ? "e" : "o"))
    .replace(/[1!|]/g, "i")
    .replace(/[$5]/g, "s")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Retourne le mot/expression bannie trouvée, ou null si le texte est propre.
export function findBannedWord(text) {
  if(!text) return null;
  const normalized = normalize(text);
  if(!normalized) return null;
  const words = normalized.split(" ");
  const wordSet = new Set(words);
  for(const banned of BANNED_WORDS) {
    const normalizedBanned = normalize(banned);
    if(normalizedBanned.includes(" ")) {
      if(normalized.includes(normalizedBanned)) return banned;
    } else if(wordSet.has(normalizedBanned)) {
      return banned;
    }
  }
  return null;
}

export function containsBannedWord(text) {
  return findBannedWord(text) !== null;
}
