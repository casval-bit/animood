// Liste de mots/expressions bannis (insultes courantes FR/EN).
// Normalisée en minuscules, sans accents — voir src/utils/contentFilter.js pour le matching.
export const BANNED_WORDS = [
  // FR — insultes courantes
  "connard", "connasse", "encule", "enculee", "enfoire", "salope", "salopard",
  "pute", "putain", "batard", "batarde", "abruti", "abrutie", "crétin", "cretin",
  "cretine", "imbecile", "debile", "attardé", "attarde", "attardee", "sombre con",
  "gros con", "grosse conne", "fdp", "ntm", "nique ta mere", "nique ta race",
  "fils de pute", "sale pute", "sale con", "sale connard", "tarlouze", "tapette",
  "negre", "sale noir", "sale arabe", "sale juif", "bougnoule", "chinetoque",
  "pd", "pede", "pédé", "sale gouine", "gouine",

  // EN — common insults
  "fuck", "fucker", "fucking", "motherfucker", "shit", "bullshit", "asshole",
  "bastard", "bitch", "cunt", "whore", "slut", "dickhead", "dumbass", "retard",
  "retarded", "faggot", "nigger", "nigga", "chink", "spic", "kike",
];
