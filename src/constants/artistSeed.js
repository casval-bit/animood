// Last-resort Artist tab data, used only when both artist_cache and the live
// AnimeThemes API come back empty. Same shape as artist_cache rows.
const th = (malId, animeTitle, year, type, slug, songTitle) =>
  ({ animeId: malId, animeSlug: null, animeTitle, malId, year, type, slug, songTitle });

export const ARTIST_SEED = [
  { slug: "lisa", name: "LiSA", themes: [
    th(38000, "Kimetsu no Yaiba", 2019, "OP", "OP1", "Gurenge"),
    th(11757, "Sword Art Online", 2012, "OP", "OP1", "crossing field"),
    th(10087, "Fate/Zero", 2011, "OP", "OP1", "oath sign"),
  ]},
  { slug: "yoasobi", name: "YOASOBI", themes: [
    th(52991, "Sousou no Frieren", 2023, "OP", "OP1", "Yuusha"),
    th(52034, "Oshi no Ko", 2023, "OP", "OP1", "Idol"),
  ]},
  { slug: "aimer", name: "Aimer", themes: [
    th(47778, "Kimetsu no Yaiba: Yuukaku-hen", 2021, "OP", "OP1", "Zankyou Sanka"),
    th(28701, "Fate/stay night: Unlimited Blade Works 2nd Season", 2015, "OP", "OP1", "Brave Shine"),
    th(34494, "Koi wa Ameagari no You ni", 2018, "ED", "ED1", "Ref:rain"),
  ]},
  { slug: "claris", name: "ClariS", themes: [
    th(18897, "Nisekoi", 2014, "OP", "OP1", "CLICK"),
    th(9756, "Mahou Shoujo Madoka★Magica", 2011, "OP", "OP1", "Connect"),
    th(8769, "Ore no Imouto ga Konnani Kawaii Wake ga Nai", 2010, "OP", "OP1", "irony"),
  ]},
  { slug: "linked_horizon", name: "Linked Horizon", themes: [
    th(25777, "Shingeki no Kyojin Season 2", 2017, "OP", "OP1", "Shinzou wo Sasageyo!"),
    th(16498, "Shingeki no Kyojin", 2013, "OP", "OP1", "Guren no Yumiya"),
    th(16498, "Shingeki no Kyojin", 2013, "OP", "OP2", "Jiyuu no Tsubasa"),
  ]},
  { slug: "flow", name: "FLOW", themes: [
    th(1735, "Naruto: Shippuuden", 2007, "OP", "OP6", "Sign"),
    th(1575, "Code Geass: Hangyaku no Lelouch", 2006, "OP", "OP1", "COLORS"),
    th(20, "Naruto", 2002, "OP", "OP4", "GO!!!"),
  ]},
  { slug: "kenshi_yonezu", name: "Kenshi Yonezu", themes: [
    th(44511, "Chainsaw Man", 2022, "OP", "OP1", "KICK BACK"),
    th(33486, "Boku no Hero Academia 2nd Season", 2017, "OP", "OP1", "Peace Sign"),
  ]},
  { slug: "uverworld", name: "UVERworld", themes: [
    th(9919, "Ao no Exorcist", 2011, "OP", "OP1", "CORE PRIDE"),
    th(269, "Bleach", 2004, "OP", "OP2", "D-tecnoLife"),
  ]},
  { slug: "man_with_a_mission", name: "MAN WITH A MISSION", themes: [
    th(51019, "Kimetsu no Yaiba: Katanakaji no Sato-hen", 2023, "OP", "OP1", "Kizuna no Kiseki"),
    th(17265, "Log Horizon", 2013, "OP", "OP1", "database"),
  ]},
  { slug: "asian_kung_fu_generation", name: "Asian Kung-Fu Generation", themes: [
    th(121, "Fullmetal Alchemist", 2003, "OP", "OP4", "Rewrite"),
    th(20, "Naruto", 2002, "OP", "OP2", "Haruka Kanata"),
  ]},
  { slug: "radwimps", name: "RADWIMPS", themes: [
    th(32281, "Kimi no Na wa.", 2016, "OP", "OP1", "Yumetourou"),
    th(32281, "Kimi no Na wa.", 2016, "ED", "ED1", "Nandemonaiya"),
  ]},
  { slug: "kalafina", name: "Kalafina", themes: [
    th(10087, "Fate/Zero", 2011, "OP", "OP2", "to the beginning"),
    th(9756, "Mahou Shoujo Madoka★Magica", 2011, "ED", "ED2", "Magia"),
  ]},
  { slug: "fripside", name: "fripSide", themes: [
    th(16049, "Toaru Kagaku no Railgun S", 2013, "OP", "OP1", "sister's noise"),
    th(6213, "Toaru Kagaku no Railgun", 2009, "OP", "OP1", "only my railgun"),
  ]},
  { slug: "konomi_suzuki", name: "Konomi Suzuki", themes: [
    th(39587, "Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season", 2020, "OP", "OP1", "Realize"),
    th(19815, "No Game No Life", 2014, "OP", "OP1", "This game"),
  ]},
  { slug: "minami_kuribayashi", name: "Minami Kuribayashi", themes: [
    th(null, "Mai-HiME", 2004, "OP", "OP1", "Shining☆Days"),
  ]},
  { slug: "eir_aoi", name: "Eir Aoi", themes: [
    th(21881, "Sword Art Online II", 2014, "OP", "OP1", "IGNITE"),
    th(18679, "Kill la Kill", 2013, "OP", "OP1", "Sirius"),
    th(10087, "Fate/Zero", 2011, "ED", "ED1", "MEMORIA"),
  ]},
];
