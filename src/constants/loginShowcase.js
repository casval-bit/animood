// ─── PAGE DE CONNEXION — vitrine ─────────────────────────────────────────────
// Quelques animés cultes par mood, affichés avant la connexion (mur d'affiches + aperçu par mood).
// Liste figée : la page doit s'afficher tout de suite, sans requête Supabase ni compte.
// `img` = chemin MyAnimeList sans extension (version moyenne « .jpg », assez nette pour ces tailles).
const MAL = "https://cdn.myanimelist.net/images/anime/";

const RAW = {
  emotional: [
    [23273, "Your Lie in April",       "1405/143284"],
    [33352, "Violet Evergarden",       "1795/95088"],
    [52991, "Frieren",                 "1015/138006"],
    [4181,  "Clannad: After Story",    "1299/110774"],
    [9989,  "Anohana",                 "5/79697"],
  ],
  happy: [
    [50265, "Spy x Family",            "1441/122795"],
    [47917, "Bocchi the Rock!",        "1448/127956"],
    [37999, "Kaguya-sama",             "1295/106551"],
    [5680,  "K-On!",                   "10/76120"],
    [10165, "Nichijou",                "3/75617"],
  ],
  hype: [
    [40748, "Jujutsu Kaisen",          "1171/109222"],
    [38000, "Demon Slayer",            "1286/99889"],
    [16498, "Attack on Titan",         "10/47347"],
    [20583, "Haikyu!!",                "7/76014"],
    [30276, "One Punch Man",           "12/76049"],
  ],
  dark: [
    [44511, "Chainsaw Man",            "1806/126216"],
    [33,    "Berserk",                 "1384/119988"],
    [34599, "Made in Abyss",           "6/86733"],
    [35120, "Devilman Crybaby",        "2/89973"],
    [22319, "Tokyo Ghoul",             "1498/134443"],
  ],
  chill: [
    [34798, "Laid-Back Camp",          "4/89877"],
    [4081,  "Natsume's Book of Friends","1681/108439"],
    [457,   "Mushishi",                "2/73862"],
    [17549, "Non Non Biyori",          "2/51581"],
    [477,   "Aria the Animation",      "2/77620"],
  ],
  twisted: [
    [9253,  "Steins;Gate",             "1935/127974"],
    [1535,  "Death Note",              "1079/138100"],
    [37779, "The Promised Neverland",  "1830/118780"],
    [19,    "Monster",                 "10/18793"],
    [31043, "Erased",                  "10/77957"],
  ],
  in_love: [
    [42897, "Horimiya",                "1695/111486"],
    [4224,  "Toradora!",               "13/22128"],
    [32281, "Your Name.",              "5/87048"],
    [38680, "Fruits Basket",           "1447/99827"],
    [6045,  "Kimi ni Todoke",          "1502/124384"],
  ],
  thrills: [
    [11061, "Hunter x Hunter",         "1337/99013"],
    [1575,  "Code Geass",              "1032/135088"],
    [37521, "Vinland Saga",            "1500/103005"],
    [32182, "Mob Psycho 100",          "8/80356"],
    [42310, "Cyberpunk: Edgerunners",  "1818/126435"],
  ],
};

export const SHOWCASE_BY_MOOD = Object.fromEntries(
  Object.entries(RAW).map(([mood, list]) => [
    mood,
    list.map(([mal_id, title, img]) => ({ mal_id, title, img: `${MAL}${img}.jpg` })),
  ]),
);

// Mur d'affiches : les moods sont entremêlés (1er de chaque mood, puis 2e…) pour que chaque colonne soit variée.
const moods = Object.keys(SHOWCASE_BY_MOOD);
export const SHOWCASE_WALL = Array.from({ length: 5 }, (_, i) => moods.map(m => SHOWCASE_BY_MOOD[m][i])).flat();
