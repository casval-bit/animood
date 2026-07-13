// ─── PROFILE FRAMES SYSTEM ───────────────────────────────────────────────────

// ── Frame definitions ─────────────────────────────────────────────────────────
export const FRAMES = {

  // ── FOLLOWERS ──────────────────────────────────────────────────────────────
  followers_10: {
    id:"followers_10", category:"followers",
    label:"Reconnu", desc:"10 abonnés",
    color:"#C0C0C0",
    css: `border: 3px solid #C0C0C0; box-shadow: 0 0 8px #C0C0C080;`,
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#C0C0C0" stroke-width="3"/>`,
  },
  followers_50: {
    id:"followers_50", category:"followers",
    label:"Populaire", desc:"50 abonnés",
    color:"#FFD700",
    css: `border: 3px solid #FFD700; box-shadow: 0 0 12px #FFD70080;`,
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#FFD700" stroke-width="3" stroke-dasharray="6 3"/>`,
  },
  followers_250: {
    id:"followers_250", category:"followers",
    label:"Cristal", desc:"250 abonnés",
    color:"#A5F3FC", animated:true,
    css: `border: 3px solid #A5F3FC; box-shadow: 0 0 16px #A5F3FC, 0 0 32px #7DD3FC; animation: crystalPulse 2s ease-in-out infinite;`,
    svg: (size) => `
      <defs>
        <linearGradient id="crystalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#A5F3FC"><animate attributeName="stop-color" values="#A5F3FC;#7DD3FC;#BAE6FD;#A5F3FC" dur="3s" repeatCount="indefinite"/></stop>
          <stop offset="100%" stop-color="#7DD3FC"><animate attributeName="stop-color" values="#7DD3FC;#BAE6FD;#A5F3FC;#7DD3FC" dur="3s" repeatCount="indefinite"/></stop>
        </linearGradient>
      </defs>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="url(#crystalGrad)" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-7}" fill="none" stroke="#A5F3FC" stroke-width="1" opacity="0.4" stroke-dasharray="4 8"/>`,
  },

  // ── GENRE FRAMES ───────────────────────────────────────────────────────────
  genre_romance: {
    id:"genre_romance", category:"genre", genre:"Romance",
    label:"Romantique", desc:"100 animés Romance",
    color:"#F9A8D4",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#F9A8D4" stroke-width="3" stroke-dasharray="3 2"/>`,
  },
  genre_scifi: {
    id:"genre_scifi", category:"genre", genre:"Sci-Fi",
    label:"Explorateur", desc:"100 animés Sci-Fi",
    color:"#60A5FA",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#60A5FA" stroke-width="3" stroke-dasharray="8 2 2 2"/>`,
  },
  genre_horror: {
    id:"genre_horror", category:"genre", genre:"Horror",
    label:"Survivant", desc:"100 animés Horror",
    color:"#EF4444",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#EF4444" stroke-width="3"/>`,
  },
  genre_action: {
    id:"genre_action", category:"genre", genre:"Action",
    label:"Combattant", desc:"100 animés Action",
    color:"#F97316",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#F97316" stroke-width="3" stroke-dasharray="10 3"/>`,
  },
  genre_comedy: {
    id:"genre_comedy", category:"genre", genre:"Comedy",
    label:"Comique", desc:"100 animés Comedy",
    color:"#FFD93D",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#FFD93D" stroke-width="3" stroke-dasharray="5 5"/>`,
  },
  genre_drama: {
    id:"genre_drama", category:"genre", genre:"Drama",
    label:"Dramaturge", desc:"100 animés Drama",
    color:"#A78BFA",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#A78BFA" stroke-width="3"/>`,
  },
  genre_fantasy: {
    id:"genre_fantasy", category:"genre", genre:"Fantasy",
    label:"Magicien", desc:"100 animés Fantasy",
    color:"#34D399",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#34D399" stroke-width="3" stroke-dasharray="6 2 1 2"/>`,
  },
  genre_sports: {
    id:"genre_sports", category:"genre", genre:"Sports",
    label:"Athlète", desc:"100 animés Sports",
    color:"#FB923C",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#FB923C" stroke-width="3" stroke-dasharray="12 4"/>`,
  },
  genre_mystery: {
    id:"genre_mystery", category:"genre", genre:"Mystery",
    label:"Détective", desc:"100 animés Mystery",
    color:"#06B6D4",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#06B6D4" stroke-width="3" stroke-dasharray="2 4"/>`,
  },
  genre_sliceoflife: {
    id:"genre_sliceoflife", category:"genre", genre:"Slice of Life",
    label:"Quotidien", desc:"100 animés Slice of Life",
    color:"#86EFAC",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#86EFAC" stroke-width="3" stroke-dasharray="4 2"/>`,
  },
  genre_mecha: {
    id:"genre_mecha", category:"genre", genre:"Mecha",
    label:"Pilote", desc:"100 animés Mecha",
    color:"#94A3B8",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#94A3B8" stroke-width="3"/>`,
  },
  genre_supernatural: {
    id:"genre_supernatural", category:"genre", genre:"Supernatural",
    label:"Spirite", desc:"100 animés Supernatural",
    color:"#C084FC",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#C084FC" stroke-width="3" stroke-dasharray="3 3"/>`,
  },

  // ── CONTRIBUTION (mood votes) ───────────────────────────────────────────────
  contrib_10: {
    id:"contrib_10", category:"contribution",
    label:"Contributeur", desc:"10 pts de mood assignés",
    color:"#6EE7B7",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#6EE7B7" stroke-width="3" stroke-dasharray="8 4"/>`,
  },
  contrib_100: {
    id:"contrib_100", category:"contribution",
    label:"Expert", desc:"100 pts de mood assignés",
    color:"#818CF8",
    svg: (size) => `
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#818CF8" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-7}" fill="none" stroke="#818CF8" stroke-width="1" opacity="0.5" stroke-dasharray="4 6"/>`,
  },
  contrib_1000: {
    id:"contrib_1000", category:"contribution",
    label:"Oracle", desc:"1000 pts de mood assignés",
    color:"#F0ABFC", animated:true,
    svg: (size) => `
      <defs>
        <linearGradient id="oracleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F0ABFC"><animate attributeName="stop-color" values="#F0ABFC;#818CF8;#C084FC;#F0ABFC" dur="2s" repeatCount="indefinite"/></stop>
          <stop offset="100%" stop-color="#818CF8"><animate attributeName="stop-color" values="#818CF8;#C084FC;#F0ABFC;#818CF8" dur="2s" repeatCount="indefinite"/></stop>
        </linearGradient>
      </defs>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="url(#oracleGrad)" stroke-width="3.5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-8}" fill="none" stroke="#C084FC" stroke-width="1" opacity="0.6" stroke-dasharray="3 5">
        <animateTransform attributeName="transform" type="rotate" from="0 ${size/2} ${size/2}" to="360 ${size/2} ${size/2}" dur="8s" repeatCount="indefinite"/>
      </circle>`,
  },

  // ── TOTAL ANIME VUS ────────────────────────────────────────────────────────
  watched_50: {
    id:"watched_50", category:"watched",
    label:"Débutant", desc:"50 animés vus",
    color:"#A3E635",
    svg: (size) => `<circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#A3E635" stroke-width="3" stroke-dasharray="6 4"/>`,
  },
  watched_500: {
    id:"watched_500", category:"watched",
    label:"Sérieux", desc:"500 animés vus",
    color:"#FB923C",
    svg: (size) => `
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#FB923C" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-7}" fill="none" stroke="#FB923C" stroke-width="1" opacity="0.4"/>`,
  },
  watched_1000: {
    id:"watched_1000", category:"watched",
    label:"Vétéran", desc:"1000 animés vus",
    color:"#FBBF24",
    svg: (size) => `
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="#FBBF24" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-6}" fill="none" stroke="#FDE68A" stroke-width="1.5" stroke-dasharray="5 3"/>`,
  },
  watched_5000: {
    id:"watched_5000", category:"watched",
    label:"Légende", desc:"5000 animés vus",
    color:"#FDE68A", animated:true,
    svg: (size) => `
      <defs>
        <linearGradient id="legendGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FDE68A"><animate attributeName="stop-color" values="#FDE68A;#F59E0B;#FBBF24;#FDE68A" dur="2.5s" repeatCount="indefinite"/></stop>
          <stop offset="50%" stop-color="#F59E0B"/>
          <stop offset="100%" stop-color="#FBBF24"><animate attributeName="stop-color" values="#FBBF24;#FDE68A;#F59E0B;#FBBF24" dur="2.5s" repeatCount="indefinite"/></stop>
        </linearGradient>
        <filter id="legendGlow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="none" stroke="url(#legendGrad)" stroke-width="4" filter="url(#legendGlow)"/>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-8}" fill="none" stroke="#FBBF24" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6">
        <animateTransform attributeName="transform" type="rotate" from="0 ${size/2} ${size/2}" to="360 ${size/2} ${size/2}" dur="10s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-12}" fill="none" stroke="#FDE68A" stroke-width="1" stroke-dasharray="2 6" opacity="0.4">
        <animateTransform attributeName="transform" type="rotate" from="360 ${size/2} ${size/2}" to="0 ${size/2} ${size/2}" dur="7s" repeatCount="indefinite"/>
      </circle>`,
  },
};

// ── Compute total mood pts assigned by a user ─────────────────────────────────
function sumPtsAdded(ptsAdded) {
  if(!ptsAdded || typeof ptsAdded !== "object") return 0;
  return Object.values(ptsAdded).reduce((a,b)=>a+(parseInt(b)||0),0);
}

// ── Get all unlocked frames for a user ────────────────────────────────────────
export function getUnlockedFrames({ watchedCount, genreCounts, followerCount, userVotes }) {
  const unlocked = [];

  // Followers
  if(followerCount >= 10)  unlocked.push(FRAMES.followers_10);
  if(followerCount >= 50)  unlocked.push(FRAMES.followers_50);
  if(followerCount >= 250) unlocked.push(FRAMES.followers_250);

  // Genre (100 anime of that genre watched)
  const genreMap = {
    "Romance":"genre_romance","Sci-Fi":"genre_scifi","Horror":"genre_horror",
    "Action":"genre_action","Comedy":"genre_comedy","Drama":"genre_drama",
    "Fantasy":"genre_fantasy","Sports":"genre_sports","Mystery":"genre_mystery",
    "Slice of Life":"genre_sliceoflife","Mecha":"genre_mecha","Supernatural":"genre_supernatural",
  };
  Object.entries(genreMap).forEach(([genre, frameId])=>{
    if((genreCounts[genre]||0) >= 100) unlocked.push(FRAMES[frameId]);
  });

  // Contribution — sum all pts_added across all votes
  const totalPts = (userVotes||[]).reduce((sum, v)=>sum+sumPtsAdded(v.pts_added),0);
  if(totalPts >= 10)   unlocked.push(FRAMES.contrib_10);
  if(totalPts >= 100)  unlocked.push(FRAMES.contrib_100);
  if(totalPts >= 1000) unlocked.push(FRAMES.contrib_1000);

  // Watched count
  if(watchedCount >= 50)   unlocked.push(FRAMES.watched_50);
  if(watchedCount >= 500)  unlocked.push(FRAMES.watched_500);
  if(watchedCount >= 1000) unlocked.push(FRAMES.watched_1000);
  if(watchedCount >= 5000) unlocked.push(FRAMES.watched_5000);

  return unlocked;
}

// ── Get best frame to display by default (highest tier) ───────────────────────
export function getBestFrame(unlocked) {
  if(!unlocked?.length) return null;
  const priority = ["watched","contribution","followers","genre"];
  const sorted = [...unlocked].sort((a,b)=>{
    const pa = priority.indexOf(a.category);
    const pb = priority.indexOf(b.category);
    if(pa !== pb) return pa - pb;
    return Object.keys(FRAMES).indexOf(b.id) - Object.keys(FRAMES).indexOf(a.id);
  });
  return sorted[sorted.length - 1]; // last = highest tier
}

// ── Render frame SVG around avatar ────────────────────────────────────────────
export function FrameSVG({ frame, size = 80, children }) {
  if(!frame) return children;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      {children}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
        viewBox={`0 0 ${size} ${size}`}
        dangerouslySetInnerHTML={{__html: frame.svg(size)}}/>
    </div>
  );
}
