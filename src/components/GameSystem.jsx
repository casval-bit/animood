// ─── JEUX — point d'entrée unique (les noms et les props exportés n'ont pas changé) ───────────────────────────
// Le code est réparti par rôle :
//   gameUi.jsx     kit visuel commun (boutons, bandeau de score, fenêtre « Abandonner ? », écran de fin avec l'ELO)
//   GameLobby.jsx  salons : classé / entre amis (code + invitations) / contre l'IA, salons Cluescale et Imposteur
//   DuelGames.jsx  jeux à deux : Chain (chaîne d'animés) et Timeline
//   PartyGames.jsx jeux à plusieurs : Cluescale et Imposteur (sur le même appareil ou en ligne)
// Les règles (ELO, points, IA, fin de partie) vivent dans src/utils/ et sont testées (npm test).
export { Matchmaking, CluescaleMatchmaking, UndercoverLobby } from "./GameLobby.jsx";
export { ChainGame, TimelineGame } from "./DuelGames.jsx";
export { CluescaleGame, UndercoverGame } from "./PartyGames.jsx";
