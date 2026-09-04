// Curated pool for the "Quiz OP" mini-game — YouTube uploads of anime opening
// themes, tagged by how recognizable the OP is. mal_id lets the game reuse
// anime_cache for the guess autocomplete + reveal.
//
// youtubeId picks matter more than they look: most "official" label/streamer
// uploads (VIZ, Funimation, Crunchyroll compilations, music labels) turn out
// to be region-locked or content-ID blocked in large parts of the world once
// actually embedded — verified by loading each one as a real iframe. Smaller
// fan-reupload channels survive far more often, so that's deliberately what
// most of these point to. If a pick ever goes dead, re-verify the replacement
// the same way (a bare page navigation to the /embed/ URL is NOT a valid
// check — it always errors regardless of real availability).
export const ANIME_OPENINGS = [
  // ─── Easy — mega-mainstream, very recognizable OPs ───
  { mal_id: 20,    title: "Naruto",                       difficulty: "easy",   youtubeId: "OjbQklYkdIk" },
  { mal_id: 16498, title: "Attack on Titan",               difficulty: "easy",   youtubeId: "Pn7dCgtwX2c" },
  { mal_id: 38000, title: "Demon Slayer",                  difficulty: "easy",   youtubeId: "pmanD_s7G3U" },
  { mal_id: 21,    title: "One Piece",                     difficulty: "easy",   youtubeId: "YoeP9w5UIlg" },
  { mal_id: 1535,  title: "Death Note",                    difficulty: "easy",   youtubeId: "lnVDIA0QIvY" },
  { mal_id: 31964, title: "My Hero Academia",               difficulty: "easy",   youtubeId: "-77UEct0cZM" },
  { mal_id: 5114,  title: "Fullmetal Alchemist: Brotherhood", difficulty: "easy", youtubeId: "a-Jr5JW-EMQ" },
  { mal_id: 40748, title: "Jujutsu Kaisen",                 difficulty: "easy",   youtubeId: "i1P-9IspBus" },

  // ─── Medium — popular but need real anime knowledge ───
  { mal_id: 1,     title: "Cowboy Bebop",                  difficulty: "medium", youtubeId: "0hfOyOBHIq4" },
  { mal_id: 1575,  title: "Code Geass",                     difficulty: "medium", youtubeId: "Qe5e9eevwiU" },
  { mal_id: 9253,  title: "Steins;Gate",                    difficulty: "medium", youtubeId: "bc3dQIWd1ak" },
  { mal_id: 22319, title: "Tokyo Ghoul",                    difficulty: "medium", youtubeId: "JYZlyLvjkAQ" },
  { mal_id: 20583, title: "Haikyuu!!",                      difficulty: "medium", youtubeId: "t9gKKFh-5QU" },
  { mal_id: 31240, title: "Re:Zero",                        difficulty: "medium", youtubeId: "pCN59hv-fIY" },
  { mal_id: 269,   title: "Bleach",                         difficulty: "medium", youtubeId: "qdY33ZMf4z4" },
  { mal_id: 6702,  title: "Fairy Tail",                     difficulty: "medium", youtubeId: "9jvVBVcZ0-Y" },

  // ─── Hard — deep cuts, older or niche titles ───
  { mal_id: 32182, title: "Mob Psycho 100",                 difficulty: "hard",   youtubeId: "F5OJPUXJvHk" },
  { mal_id: 5081,  title: "Bakemonogatari",                 difficulty: "hard",   youtubeId: "a5UMwmtked4" },
  { mal_id: 339,   title: "Serial Experiments Lain",        difficulty: "hard",   youtubeId: "MM8RufZr5lw" },
  { mal_id: 30,    title: "Neon Genesis Evangelion",        difficulty: "hard",   youtubeId: "nU21rCWkuJw" },
  { mal_id: 440,   title: "Revolutionary Girl Utena",       difficulty: "hard",   youtubeId: "PTc52teL4dc" },
  { mal_id: 22135, title: "Ping Pong the Animation",        difficulty: "hard",   youtubeId: "b5qNi7EUg3g" },
  { mal_id: 245,   title: "Great Teacher Onizuka",          difficulty: "hard",   youtubeId: "2JGl6UzfPkE" },
  { mal_id: 820,   title: "Legend of the Galactic Heroes",  difficulty: "hard",   youtubeId: "l-wGRXGZzWM" },
];

export const OPQUIZ_DIFFICULTY_PLAN = ["easy", "easy", "medium", "medium", "hard"];
