// ─── Données de l'espace AniMood 2026 : votes de la communauté, mes amis, mon vote enregistré, fiches des animés classés ───────────────
// Une seule lecture à l'ouverture de la fenêtre (et après chaque vote) alimente la bande « favori de la communauté » ET l'onglet Top 3.
// Les amis = les membres que je suis, sans moi. Si la table des votes n'existe pas encore : `missing` (aucune erreur à l'écran).
import { useState, useEffect, useCallback, useRef } from "react";
import { follows } from "../../api/supabase.js";
import { fetchBallots, fetchMyBallot, fetchAnimeByIds } from "../../api/awards2026.js";
import { buildAllRankings, rankingIds, visibleRanking, SCOPES, RANK_MODES } from "../../utils/awards2026.js";

const EMPTY = { loading: true, error: false, missing: false, truncated: false, rankings: null, friends: [], details: new Map(), myPicks: null, voters: 0 };

export function useAwardsData(myUsername) {
  const [state, setState] = useState(EMPTY);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // premier chargement : écran « chargement » ; ensuite (après un vote) on garde l'affichage et on remplace les chiffres
      const isFirst = first.current;
      first.current = false;
      setState(s => (isFirst ? { ...EMPTY } : { ...s, error: false }));
      try {
        const [bal, following, mine] = await Promise.all([
          fetchBallots(),
          myUsername ? follows.getFollowing(myUsername).catch(() => []) : [],
          myUsername ? fetchMyBallot(myUsername).catch(() => ({ picks: null, missing: false })) : { picks: null, missing: false },
        ]);
        const friends = [...new Set(following)].filter(u => u && u !== myUsername);
        let ballots = bal.ballots;
        if(bal.truncated && friends.length) {            // plus de 10 000 votes : on relit les amis à part pour ne pas les perdre
          const f = await fetchBallots({ usernames: friends });
          const byUser = new Map(ballots.map(b => [b.username, b]));
          f.ballots.forEach(b => byUser.set(b.username, b));
          ballots = [...byUser.values()];
        }
        const friendSet = new Set(friends);
        // 1re passe : quels animés faut-il retrouver dans le catalogue ? 2e passe : classements définitifs (égalités départagées par la popularité)
        const draft = buildAllRankings(ballots, { friends: friendSet, limit: 15 });
        const ids = [...new Set([...rankingIds(draft), ...(mine.picks || [])])];
        const rows = await fetchAnimeByIds(ids).catch(() => []);
        const details = new Map(rows.map(r => [r.mal_id, r]));
        const all = buildAllRankings(ballots, { friends: friendSet, popularity: (id) => details.get(id)?.popularity, limit: 15 });
        const rankings = {};
        for(const scope of SCOPES) { rankings[scope] = {}; for(const mode of RANK_MODES) rankings[scope][mode] = visibleRanking(all[scope][mode], details, 10); }
        if(cancelled) return;
        setState({ loading: false, error: false, missing: bal.missing || mine.missing, truncated: bal.truncated, rankings, friends, details, myPicks: mine.picks, voters: all.community.points.voters });
      } catch {
        if(!cancelled) setState(s => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [myUsername, tick]);

  return { ...state, refresh };
}
