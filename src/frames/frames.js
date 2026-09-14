// ─── PROFILE FRAMES SYSTEM ────────────────────────────────────────────────────
// Chaque cadre définit un SVG injecté autour de l'avatar via FrameSVG.jsx
// Les animations CSS sont déclarées dans le SVG via <style> et <animate>

export const FRAMES = {

  // ══════════════════════════════════════════════════════════════════════
  // FOLLOWERS
  // ══════════════════════════════════════════════════════════════════════

  followers_10: {
    id:"followers_10", category:"followers",
    label:"Reconnu", desc:"10 abonnés",
    color:"#94a3b8",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#94a3b8" stroke-width="2.5"/>
        <circle cx="${c}" cy="${c}" r="${r-5}" fill="none" stroke="#94a3b8" stroke-width="0.8" opacity="0.3" stroke-dasharray="3 6"/>
      `;
    },
  },

  followers_50: {
    id:"followers_50", category:"followers",
    label:"Populaire", desc:"50 abonnés",
    color:"#f59e0b", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="popGrad_${size}" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#fbbf24"/>
            <stop offset="50%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#fde68a"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#popGrad_${size})" stroke-width="3"
          stroke-dasharray="${2*Math.PI*r}" stroke-dashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="6s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-5}" fill="none" stroke="#fbbf24" stroke-width="1" opacity="0.4" stroke-dasharray="4 4">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="10s" repeatCount="indefinite"/>
        </circle>
        <!-- Corner stars -->
        <circle cx="${c}" cy="3" r="2" fill="#fbbf24" opacity="0.8">
          <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${size-3}" cy="${c}" r="1.5" fill="#fde68a" opacity="0.6">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite"/>
        </circle>
      `;
    },
  },

  followers_250: {
    id:"followers_250", category:"followers",
    label:"Cristal", desc:"250 abonnés",
    color:"#67e8f9", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3, r2=c-8, r3=c-13;
      const pts = (radius, count) => Array.from({length:count},(_,i)=>{
        const a = (i/count)*2*Math.PI - Math.PI/2;
        return `${c+radius*Math.cos(a)},${c+radius*Math.sin(a)}`;
      }).join(' ');
      return `
        <defs>
          <linearGradient id="crystalG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#a5f3fc"><animate attributeName="stop-color" values="#a5f3fc;#7dd3fc;#bae6fd;#a5f3fc" dur="3s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#38bdf8"><animate attributeName="stop-color" values="#38bdf8;#a5f3fc;#7dd3fc;#38bdf8" dur="3s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="crystalGlow_${size}">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>
        <!-- Outer ring -->
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#crystalG_${size})" stroke-width="3" filter="url(#crystalGlow_${size})">
          <animate attributeName="stroke-width" values="3;4;3" dur="2s" repeatCount="indefinite"/>
        </circle>
        <!-- Mid ring rotating -->
        <circle cx="${c}" cy="${c}" r="${r2}" fill="none" stroke="#67e8f9" stroke-width="1" stroke-dasharray="3 9" opacity="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="8s" repeatCount="indefinite"/>
        </circle>
        <!-- Inner ring counter-rotating -->
        <circle cx="${c}" cy="${c}" r="${r3}" fill="none" stroke="#a5f3fc" stroke-width="0.8" stroke-dasharray="2 6" opacity="0.3">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="12s" repeatCount="indefinite"/>
        </circle>
        <!-- 6 orbiting dots -->
        ${[0,1,2,3,4,5].map(i=>{
          const delay=i*(3/6);
          const angle=(i/6)*360;
          return `<circle cx="${c}" cy="${3}" r="2" fill="#67e8f9" opacity="0.9">
            <animateTransform attributeName="transform" type="rotate" from="${angle} ${c} ${c}" to="${angle+360} ${c} ${c}" dur="3s" begin="${delay}s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.9;0.3;0.9" dur="3s" begin="${delay}s" repeatCount="indefinite"/>
          </circle>`;
        }).join('')}
      `;
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GENRE
  // ══════════════════════════════════════════════════════════════════════

  genre_romance: {
    id:"genre_romance", category:"genre", genre:"Romance",
    label:"Romantique", desc:"100 animés Romance",
    color:"#f9a8d4",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#f9a8d4" stroke-width="2.5" stroke-dasharray="5 3"/>
        <!-- Hearts at cardinal points -->
        ${[[c,4],[size-4,c],[c,size-4],[4,c]].map(([x,y])=>`
          <path d="M${x},${y+1.5} C${x},${y-0.5} ${x-2.5},${y-2} ${x-2.5},${y} C${x-2.5},${y+2} ${x},${y+4} ${x},${y+4} C${x},${y+4} ${x+2.5},${y+2} ${x+2.5},${y} C${x+2.5},${y-2} ${x},${y-0.5} ${x},${y+1.5}Z"
            fill="#f9a8d4" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite"/>
          </path>`).join('')}
      `;
    },
  },

  genre_scifi: {
    id:"genre_scifi", category:"genre", genre:"Sci-Fi",
    label:"Explorateur", desc:"100 animés Sci-Fi",
    color:"#60a5fa", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="scifiG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#60a5fa"/>
            <stop offset="100%" stop-color="#818cf8"/>
          </linearGradient>
        </defs>
        <!-- Hexagon-ish ring -->
        <polygon points="${[0,1,2,3,4,5].map(i=>{
          const a=(i/6)*2*Math.PI - Math.PI/2;
          return `${c+r*Math.cos(a)},${c+r*Math.sin(a)}`;
        }).join(' ')}" fill="none" stroke="url(#scifiG_${size})" stroke-width="2.5">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="60 ${c} ${c}" dur="20s" repeatCount="indefinite"/>
        </polygon>
        <circle cx="${c}" cy="${c}" r="${r-7}" fill="none" stroke="#60a5fa" stroke-width="1" stroke-dasharray="6 3" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="8s" repeatCount="indefinite"/>
        </circle>
        <!-- Scanning line -->
        <line x1="${3}" y1="${c}" x2="${size-3}" y2="${c}" stroke="#60a5fa" stroke-width="0.8" opacity="0.4">
          <animate attributeName="y1" values="${c};${3};${size-3};${c}" dur="4s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="${c};${3};${size-3};${c}" dur="4s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="4s" repeatCount="indefinite"/>
        </line>
      `;
    },
  },

  genre_horror: {
    id:"genre_horror", category:"genre", genre:"Horror",
    label:"Survivant", desc:"100 animés Horror",
    color:"#ef4444", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ef4444" stroke-width="3">
          <animate attributeName="stroke-width" values="3;5;3" dur="1.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.5;1" dur="1.2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#7f1d1d" stroke-width="1.5" opacity="0.5" stroke-dasharray="4 4"/>
        <!-- Drips -->
        ${[c-15, c, c+15].map((x,i)=>`
          <ellipse cx="${x}" cy="${size-2}" rx="1.5" ry="${2+i}" fill="#ef4444" opacity="0.7">
            <animate attributeName="ry" values="${2+i};${4+i};${2+i}" dur="${1.5+i*0.3}s" repeatCount="indefinite"/>
          </ellipse>
        `).join('')}
      `;
    },
  },

  genre_action: {
    id:"genre_action", category:"genre", genre:"Action",
    label:"Combattant", desc:"100 animés Action",
    color:"#f97316", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      // Flame-like spikes
      const spikes = Array.from({length:8},(_,i)=>{
        const a = (i/8)*2*Math.PI;
        const ir = r-6, or = r+2;
        const x1=c+ir*Math.cos(a), y1=c+ir*Math.sin(a);
        const x2=c+or*Math.cos(a), y2=c+or*Math.sin(a);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f97316" stroke-width="2" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0.2;0.7" dur="${0.8+i*0.1}s" repeatCount="indefinite"/>
        </line>`;
      }).join('');
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#f97316" stroke-width="2.5"/>
        ${spikes}
        <circle cx="${c}" cy="${c}" r="${r-8}" fill="none" stroke="#fb923c" stroke-width="1" opacity="0.4" stroke-dasharray="8 4">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="4s" repeatCount="indefinite"/>
        </circle>
      `;
    },
  },

  genre_fantasy: {
    id:"genre_fantasy", category:"genre", genre:"Fantasy",
    label:"Magicien", desc:"100 animés Fantasy",
    color:"#34d399", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      const star = (cx,cy,r1,r2,pts,rotation=0) => {
        const coords = Array.from({length:pts*2},(_,i)=>{
          const a = (i/pts)*Math.PI + rotation*Math.PI/180;
          const rad = i%2===0?r1:r2;
          return `${cx+rad*Math.cos(a)},${cy+rad*Math.sin(a)}`;
        }).join(' ');
        return `<polygon points="${coords}" fill="none" stroke="#34d399" stroke-width="1.5" opacity="0.7"/>`;
      };
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#34d399" stroke-width="2.5" stroke-dasharray="6 2 1 2"/>
        <!-- Rotating star -->
        <g>
          ${star(c,c,r-8,r-14,6,0)}
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="12s" repeatCount="indefinite"/>
        </g>
        <!-- Orbiting sparkles -->
        ${[0,120,240].map((deg,i)=>`
          <circle cx="${c}" cy="${c-(r-6)}" r="2" fill="#a7f3d0" opacity="0.9">
            <animateTransform attributeName="transform" type="rotate" from="${deg} ${c} ${c}" to="${deg+360} ${c} ${c}" dur="${6+i}s" repeatCount="indefinite"/>
          </circle>
        `).join('')}
      `;
    },
  },

  genre_comedy: {
    id:"genre_comedy", category:"genre", genre:"Comedy",
    label:"Comique", desc:"100 animés Comedy",
    color:"#fde047",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#fde047" stroke-width="2.5" stroke-dasharray="6 3"/>
        <!-- Bouncing stars -->
        ${[45,135,225,315].map(deg=>{
          const a=deg*Math.PI/180;
          const x=c+(r-4)*Math.cos(a), y=c+(r-4)*Math.sin(a);
          return `<circle cx="${x}" cy="${y}" r="2.5" fill="#fde047" opacity="0.8">
            <animate attributeName="r" values="2.5;3.5;2.5" dur="${0.8+Math.random()*0.5}s" repeatCount="indefinite"/>
          </circle>`;
        }).join('')}
      `;
    },
  },

  genre_drama: {
    id:"genre_drama", category:"genre", genre:"Drama",
    label:"Dramaturge", desc:"100 animés Drama",
    color:"#a78bfa",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#a78bfa" stroke-width="2.5"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#7c3aed" stroke-width="1" opacity="0.4" stroke-dasharray="2 8"/>
        <!-- Tear drops at top -->
        <path d="M${c},${4} C${c-2},${8} ${c-3},${10} ${c},${12} C${c+3},${10} ${c+2},${8} ${c},${4}Z" fill="#a78bfa" opacity="0.7"/>
      `;
    },
  },

  genre_sports: {
    id:"genre_sports", category:"genre", genre:"Sports",
    label:"Athlète", desc:"100 animés Sports",
    color:"#4ade80",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-dasharray="10 3"/>
        <circle cx="${c}" cy="${c}" r="${r-7}" fill="none" stroke="#22c55e" stroke-width="1" opacity="0.3"/>
      `;
    },
  },

  genre_mystery: {
    id:"genre_mystery", category:"genre", genre:"Mystery",
    label:"Détective", desc:"100 animés Mystery",
    color:"#94a3b8",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="1 4"/>
        <!-- Question mark circle in corner -->
        <circle cx="${size-8}" cy="8" r="5" fill="#0f0a1e" stroke="#94a3b8" stroke-width="1"/>
        <text x="${size-8}" y="11" text-anchor="middle" fill="#94a3b8" font-size="6" font-weight="bold">?</text>
      `;
    },
  },

  genre_sliceoflife: {
    id:"genre_sliceoflife", category:"genre", genre:"Slice of Life",
    label:"Quotidien", desc:"100 animés Slice of Life",
    color:"#86efac",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#86efac" stroke-width="2"/>
        <!-- Leaf shapes -->
        <ellipse cx="${c}" cy="${4}" rx="3" ry="5" fill="none" stroke="#86efac" stroke-width="1.2" opacity="0.7" transform="rotate(-20 ${c} ${4})"/>
        <ellipse cx="${size-5}" cy="${c}" rx="3" ry="5" fill="none" stroke="#86efac" stroke-width="1.2" opacity="0.5" transform="rotate(70 ${size-5} ${c})"/>
      `;
    },
  },

  genre_mecha: {
    id:"genre_mecha", category:"genre", genre:"Mecha",
    label:"Pilote", desc:"100 animés Mecha",
    color:"#38bdf8", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      // Segmented tech ring
      const segments = Array.from({length:12},(_,i)=>{
        const a1=(i/12)*2*Math.PI - Math.PI/2;
        const a2=((i+0.7)/12)*2*Math.PI - Math.PI/2;
        const x1=c+r*Math.cos(a1), y1=c+r*Math.sin(a1);
        const x2=c+r*Math.cos(a2), y2=c+r*Math.sin(a2);
        const opacity = i%3===0 ? 1 : 0.4;
        return `<path d="M${c},${c} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}Z" fill="none" stroke="#38bdf8" stroke-width="2.5" opacity="${opacity}"/>`;
      }).join('');
      return `
        ${segments}
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#0ea5e9" stroke-width="1" opacity="0.4">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="10s" repeatCount="indefinite"/>
        </circle>
        <!-- Corner bolts -->
        ${[[-1,-1],[1,-1],[1,1],[-1,1]].map(([dx,dy])=>`
          <circle cx="${c+dx*(r-4)}" cy="${c+dy*(r-4)}" r="2.5" fill="#38bdf8" opacity="0.8"/>
        `).join('')}
      `;
    },
  },

  genre_supernatural: {
    id:"genre_supernatural", category:"genre", genre:"Supernatural",
    label:"Spirite", desc:"100 animés Supernatural",
    color:"#c084fc", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <filter id="supGlow_${size}">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#c084fc" stroke-width="2.5" filter="url(#supGlow_${size})">
          <animate attributeName="stroke-width" values="2.5;4;2.5" dur="3s" repeatCount="indefinite"/>
        </circle>
        <!-- Wavy inner ring -->
        <circle cx="${c}" cy="${c}" r="${r-7}" fill="none" stroke="#7c3aed" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="15s" repeatCount="indefinite"/>
        </circle>
        <!-- Floating orbs -->
        ${[0,90,180,270].map((deg,i)=>{
          const a=deg*Math.PI/180;
          return `<circle cx="${c+(r-5)*Math.cos(a)}" cy="${c+(r-5)*Math.sin(a)}" r="2.5" fill="#c084fc" opacity="0.7" filter="url(#supGlow_${size})">
            <animate attributeName="opacity" values="0.7;0.2;0.7" dur="${2+i*0.4}s" repeatCount="indefinite"/>
          </circle>`;
        }).join('')}
      `;
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // CONTRIBUTION
  // ══════════════════════════════════════════════════════════════════════

  contrib_10: {
    id:"contrib_10", category:"contribution",
    label:"Contributeur", desc:"10 pts de mood assignés",
    color:"#a3e635",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#a3e635" stroke-width="2.5" stroke-dasharray="8 3"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#65a30d" stroke-width="1" opacity="0.4"/>
      `;
    },
  },

  contrib_100: {
    id:"contrib_100", category:"contribution",
    label:"Expert", desc:"100 pts de mood assignés",
    color:"#22d3ee", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="expG_${size}" gradientUnits="userSpaceOnUse" x1="${3}" y1="${3}" x2="${size-3}" y2="${size-3}">
            <stop offset="0%" stop-color="#22d3ee"/>
            <stop offset="100%" stop-color="#2dd4bf"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#expG_${size})" stroke-width="3"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#22d3ee" stroke-width="1" stroke-dasharray="4 4" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="6s" repeatCount="indefinite"/>
        </circle>
        <!-- Checkmarks -->
        <path d="M${c-8},${c} L${c-3},${c+5} L${c+8},${c-6}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      `;
    },
  },

  contrib_1000: {
    id:"contrib_1000", category:"contribution",
    label:"Oracle", desc:"1000 pts de mood assignés",
    color:"#e879f9", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="oracleG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#e879f9"><animate attributeName="stop-color" values="#e879f9;#c026d3;#a21caf;#e879f9" dur="4s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#c026d3"><animate attributeName="stop-color" values="#c026d3;#e879f9;#c026d3" dur="4s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="oracleGlow_${size}">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#oracleG_${size})" stroke-width="3.5" filter="url(#oracleGlow_${size})"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#e879f9" stroke-width="1.5" opacity="0.4" stroke-dasharray="3 3">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-12}" fill="none" stroke="#c026d3" stroke-width="1" opacity="0.25" stroke-dasharray="2 6">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="14s" repeatCount="indefinite"/>
        </circle>
        <!-- Eye symbol -->
        <ellipse cx="${c}" cy="${c}" rx="7" ry="4" fill="none" stroke="#e879f9" stroke-width="1" opacity="0.6"/>
        <circle cx="${c}" cy="${c}" r="2" fill="#e879f9" opacity="0.8">
          <animate attributeName="r" values="2;2.8;2" dur="3s" repeatCount="indefinite"/>
        </circle>
      `;
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // GAMES
  // ══════════════════════════════════════════════════════════════════════

  games_rookie: {
    id:"games_rookie", category:"games",
    label:"Rookie", desc:"100 pts de jeu",
    color:"#4ade80",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#4ade80" stroke-width="2.5"/>
        <text x="${c}" y="${c+4}" text-anchor="middle" fill="#4ade80" font-size="10" font-weight="900" opacity="0.8">R</text>
      `;
    },
  },

  games_challenger: {
    id:"games_challenger", category:"games",
    label:"Master", desc:"500 pts de jeu",
    color:"#818cf8", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="masterG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#818cf8"/>
            <stop offset="100%" stop-color="#c084fc"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#masterG_${size})" stroke-width="3"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#6366f1" stroke-width="1" stroke-dasharray="5 5" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="7s" repeatCount="indefinite"/>
        </circle>
        <!-- M symbol -->
        <text x="${c}" y="${c+4}" text-anchor="middle" fill="#818cf8" font-size="11" font-weight="900" opacity="0.7">M</text>
      `;
    },
  },

  games_master: {
    id:"games_master", category:"games",
    label:"GrandMaster", desc:"2000 pts de jeu",
    color:"#fbbf24", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="gmG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24"><animate attributeName="stop-color" values="#fbbf24;#f59e0b;#fde68a;#fbbf24" dur="3s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#f97316"><animate attributeName="stop-color" values="#f97316;#fbbf24;#f97316" dur="3s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="gmGlow_${size}">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#gmG_${size})" stroke-width="3.5" filter="url(#gmGlow_${size})"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.5" stroke-dasharray="4 4">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-12}" fill="none" stroke="#f59e0b" stroke-width="1" opacity="0.3">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="9s" repeatCount="indefinite"/>
        </circle>
        <!-- Crown points -->
        ${[[-1,0],[0,-1],[1,0]].map(([dx,dy],i)=>`
          <polygon points="${c+dx*8},${c+dy*8} ${c+dx*8-3},${c+dy*8+4} ${c+dx*8+3},${c+dy*8+4}" fill="#fbbf24" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="${1.5+i*0.3}s" repeatCount="indefinite"/>
          </polygon>
        `).join('')}
        <!-- Orbiting particles -->
        ${[0,1,2].map(i=>`
          <circle cx="${c}" cy="${c-(r-4)}" r="2.5" fill="#fbbf24" opacity="0.9" filter="url(#gmGlow_${size})">
            <animateTransform attributeName="transform" type="rotate" from="${i*120} ${c} ${c}" to="${i*120+360} ${c} ${c}" dur="3s" repeatCount="indefinite"/>
          </circle>
        `).join('')}
      `;
    },
  },

  games_grandmaster: {
    id:"games_grandmaster", category:"games",
    label:"Radiant", desc:"5000 pts de jeu",
    color:"#f0abfc", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="radiantG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f0abfc"><animate attributeName="stop-color" values="#f0abfc;#818cf8;#34d399;#fbbf24;#f0abfc" dur="5s" repeatCount="indefinite"/></stop>
            <stop offset="33%" stop-color="#818cf8"><animate attributeName="stop-color" values="#818cf8;#34d399;#fbbf24;#f0abfc;#818cf8" dur="5s" repeatCount="indefinite"/></stop>
            <stop offset="66%" stop-color="#34d399"><animate attributeName="stop-color" values="#34d399;#fbbf24;#f0abfc;#818cf8;#34d399" dur="5s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#fbbf24"><animate attributeName="stop-color" values="#fbbf24;#f0abfc;#818cf8;#34d399;#fbbf24" dur="5s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="radGlow_${size}">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <!-- Rainbow outer ring -->
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#radiantG_${size})" stroke-width="4" filter="url(#radGlow_${size})"/>
        <!-- Rotating dashes -->
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#f0abfc" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="4s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-11}" fill="none" stroke="#818cf8" stroke-width="1" stroke-dasharray="2 5" opacity="0.4">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="7s" repeatCount="indefinite"/>
        </circle>
        <!-- 6 orbiting rainbow particles -->
        ${[0,1,2,3,4,5].map((i)=>{
          const colors=['#f0abfc','#818cf8','#34d399','#fbbf24','#f87171','#38bdf8'];
          return `<circle cx="${c}" cy="${c-(r-5)}" r="2.5" fill="${colors[i]}" opacity="1" filter="url(#radGlow_${size})">
            <animateTransform attributeName="transform" type="rotate" from="${i*60} ${c} ${c}" to="${i*60+360} ${c} ${c}" dur="3.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="1;0.4;1" dur="${1.5+i*0.2}s" repeatCount="indefinite"/>
          </circle>`;
        }).join('')}
      `;
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // WATCHED
  // ══════════════════════════════════════════════════════════════════════

  watched_50: {
    id:"watched_50", category:"watched",
    label:"Débutant", desc:"50 animés vus",
    color:"#7dd3fc",
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#7dd3fc" stroke-width="2.5" stroke-dasharray="6 3"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#38bdf8" stroke-width="0.8" opacity="0.3"/>
      `;
    },
  },

  watched_500: {
    id:"watched_500", category:"watched",
    label:"Sérieux", desc:"500 animés vus",
    color:"#818cf8", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="serG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#818cf8"/>
            <stop offset="100%" stop-color="#4f46e5"/>
          </linearGradient>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#serG_${size})" stroke-width="3"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#6366f1" stroke-width="1.2" opacity="0.4" stroke-dasharray="4 4">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="8s" repeatCount="indefinite"/>
        </circle>
        <!-- Film strip effect -->
        ${[-12,-4,4,12].map(x=>`
          <rect x="${c+x-2}" y="3" width="4" height="4" rx="1" fill="#818cf8" opacity="0.6"/>
          <rect x="${c+x-2}" y="${size-7}" width="4" height="4" rx="1" fill="#818cf8" opacity="0.6"/>
        `).join('')}
      `;
    },
  },

  watched_1000: {
    id:"watched_1000", category:"watched",
    label:"Vétéran", desc:"1000 animés vus",
    color:"#c084fc", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="vetG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#c084fc"><animate attributeName="stop-color" values="#c084fc;#a78bfa;#ddd6fe;#c084fc" dur="4s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#7c3aed"><animate attributeName="stop-color" values="#7c3aed;#c084fc;#7c3aed" dur="4s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="vetGlow_${size}">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#vetG_${size})" stroke-width="3.5" filter="url(#vetGlow_${size})"/>
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5">
          <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="6s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c}" cy="${c}" r="${r-12}" fill="none" stroke="#a78bfa" stroke-width="1" opacity="0.3" stroke-dasharray="2 6">
          <animateTransform attributeName="transform" type="rotate" from="360 ${c} ${c}" to="0 ${c} ${c}" dur="10s" repeatCount="indefinite"/>
        </circle>
        <!-- V badge -->
        ${[0,1,2].map(i=>`
          <circle cx="${c}" cy="${c-(r-5)}" r="2.5" fill="#c084fc" opacity="0.9" filter="url(#vetGlow_${size})">
            <animateTransform attributeName="transform" type="rotate" from="${i*120} ${c} ${c}" to="${i*120+360} ${c} ${c}" dur="4s" repeatCount="indefinite"/>
          </circle>
        `).join('')}
      `;
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // SPECIAL
  // ══════════════════════════════════════════════════════════════════════

  special_founder: {
    id:"special_founder", category:"special",
    label:"Fondateur", desc:"Membre fondateur",
    color:"#fbbf24", animated:true,
    svg:(size)=>{
      const c=size/2, r=c-3;
      return `
        <defs>
          <linearGradient id="foundG_${size}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24"><animate attributeName="stop-color" values="#fbbf24;#f59e0b;#fde68a;#fbbf24" dur="2s" repeatCount="indefinite"/></stop>
            <stop offset="100%" stop-color="#b45309"><animate attributeName="stop-color" values="#b45309;#fbbf24;#b45309" dur="2s" repeatCount="indefinite"/></stop>
          </linearGradient>
          <filter id="foundGlow_${size}">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#foundG_${size})" stroke-width="4" filter="url(#foundGlow_${size})"/>
        <!-- Spinning gear-like ring -->
        ${Array.from({length:12},(_,i)=>{
          const a=(i/12)*2*Math.PI;
          const x1=c+(r-1)*Math.cos(a), y1=c+(r-1)*Math.sin(a);
          const x2=c+(r+3)*Math.cos(a), y2=c+(r+3)*Math.sin(a);
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fbbf24" stroke-width="2">
            <animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="15s" repeatCount="indefinite"/>
          </line>`;
        }).join('')}
        <circle cx="${c}" cy="${c}" r="${r-6}" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.4"/>
        <!-- 4 corner diamonds -->
        ${[0,90,180,270].map(deg=>{
          const a=deg*Math.PI/180;
          const x=c+(r-4)*Math.cos(a), y=c+(r-4)*Math.sin(a);
          return `<polygon points="${x},${y-3} ${x+3},${y} ${x},${y+3} ${x-3},${y}" fill="#fbbf24" opacity="0.9" filter="url(#foundGlow_${size})">
            <animate attributeName="opacity" values="0.9;0.3;0.9" dur="${1.5+deg/180}s" repeatCount="indefinite"/>
          </polygon>`;
        }).join('')}
      `;
    },
  },
};

// ─── Helper: get unlocked frames for a user profile ──────────────────────────
export function getUnlockedFrames(profile) {
  const unlocked = [];

  // Support both formats:
  // 1. { watchedCount, genreCounts, followerCount, userVotes } (called from ProfileView)
  // 2. { watched: {}, followers_count, game_pts, contrib_pts } (raw profile)
  const isShorthand = profile && 'watchedCount' in profile;

  const watched    = isShorthand ? (profile.watchedCount || 0) : Object.keys(profile?.watched || {}).length;
  const followers  = isShorthand ? (profile.followerCount || 0) : (profile?.followers_count || 0);
  const pts        = isShorthand ? (profile.gamePts || profile.game_pts || 0) : (profile?.game_pts || 0);
  const contribPts = isShorthand ? (profile.contribPts || 0) : (profile?.contrib_pts || 0);

  // Followers
  if(followers >= 10)  unlocked.push(FRAMES.followers_10);
  if(followers >= 50)  unlocked.push(FRAMES.followers_50);
  if(followers >= 250) unlocked.push(FRAMES.followers_250);

  // Watched
  if(watched >= 50)   unlocked.push(FRAMES.watched_50);
  if(watched >= 500)  unlocked.push(FRAMES.watched_500);
  if(watched >= 1000) unlocked.push(FRAMES.watched_1000);

  // Games
  if(pts >= 100)  unlocked.push(FRAMES.games_rookie);
  if(pts >= 500)  unlocked.push(FRAMES.games_challenger);
  if(pts >= 2000) unlocked.push(FRAMES.games_master);
  if(pts >= 5000) unlocked.push(FRAMES.games_grandmaster);

  // Genre
  const genreCounts = isShorthand
    ? (profile.genreCounts || {})
    : (() => {
        const gc = {};
        Object.values(profile?.watched || {}).forEach(a => {
          (a.genres || []).forEach(g => { const n=g.name||g; gc[n]=(gc[n]||0)+1; });
        });
        return gc;
      })();

  const genreMap = {
    'Romance':FRAMES.genre_romance,'Sci-Fi':FRAMES.genre_scifi,
    'Horror':FRAMES.genre_horror,'Action':FRAMES.genre_action,
    'Comedy':FRAMES.genre_comedy,'Drama':FRAMES.genre_drama,
    'Fantasy':FRAMES.genre_fantasy,'Sports':FRAMES.genre_sports,
    'Mystery':FRAMES.genre_mystery,'Slice of Life':FRAMES.genre_sliceoflife,
    'Mecha':FRAMES.genre_mecha,'Supernatural':FRAMES.genre_supernatural,
  };
  Object.entries(genreMap).forEach(([genre, frame]) => {
    if((genreCounts[genre] || 0) >= 100) unlocked.push(frame);
  });

  // Contribution
  if(contribPts >= 10)   unlocked.push(FRAMES.contrib_10);
  if(contribPts >= 100)  unlocked.push(FRAMES.contrib_100);
  if(contribPts >= 1000) unlocked.push(FRAMES.contrib_1000);

  // Special
  if(profile?.is_founder) unlocked.push(FRAMES.special_founder);

  return unlocked;
}

// ─── getBestFrame ─────────────────────────────────────────────────────────────
export function getBestFrame(unlocked) {
  if(!unlocked?.length) return null;
  const priority = ["special","games","contribution","watched","followers","genre"];
  const sorted = [...unlocked].sort((a,b) => {
    const pa = priority.indexOf(a.category);
    const pb = priority.indexOf(b.category);
    if(pa !== pb) return pa - pb;
    return Object.keys(FRAMES).indexOf(b.id) - Object.keys(FRAMES).indexOf(a.id);
  });
  return sorted[sorted.length - 1];
}

// ─── getFrameSVGHtml ──────────────────────────────────────────────────────────
export function getFrameSVGHtml(frame, size=80) {
  if(!frame) return null;
  return frame.svg(size);
}

// ─── getFrameLabel / getFrameDesc ─────────────────────────────────────────────
const FRAME_LABELS_EN = {
  followers_10:"Recognized", followers_50:"Popular", followers_250:"Crystal",
  genre_romance:"Romantic", genre_scifi:"Explorer", genre_horror:"Survivor",
  genre_action:"Fighter", genre_comedy:"Comic", genre_drama:"Dramatist",
  genre_fantasy:"Mage", genre_sports:"Athlete", genre_mystery:"Detective",
  genre_sliceoflife:"Everyday", genre_mecha:"Pilot", genre_supernatural:"Medium",
  contrib_10:"Contributor", contrib_100:"Expert", contrib_1000:"Oracle",
  games_rookie:"Rookie", games_challenger:"Master", games_master:"GrandMaster", games_grandmaster:"Radiant",
  watched_50:"Beginner", watched_500:"Serious", watched_1000:"Veteran",
  special_founder:"Founder",
};

const FRAME_DESCS_EN = {
  followers_10:"10 followers", followers_50:"50 followers", followers_250:"250 followers",
  genre_romance:"100 Romance anime", genre_scifi:"100 Sci-Fi anime", genre_horror:"100 Horror anime",
  genre_action:"100 Action anime", genre_comedy:"100 Comedy anime", genre_drama:"100 Drama anime",
  genre_fantasy:"100 Fantasy anime", genre_sports:"100 Sports anime", genre_mystery:"100 Mystery anime",
  genre_sliceoflife:"100 Slice of Life anime", genre_mecha:"100 Mecha anime", genre_supernatural:"100 Supernatural anime",
  contrib_10:"10 mood pts assigned", contrib_100:"100 mood pts assigned", contrib_1000:"1000 mood pts assigned",
  games_rookie:"100 game pts", games_challenger:"500 game pts", games_master:"2000 game pts", games_grandmaster:"5000 game pts",
  watched_50:"50 anime watched", watched_500:"500 anime watched", watched_1000:"1000 anime watched",
  special_founder:"Founding member",
};

export function getFrameLabel(frameOrId, lang="fr") {
  const frame = typeof frameOrId === "string" ? FRAMES[frameOrId] : frameOrId;
  if(!frame) return "";
  return lang === "en" ? (FRAME_LABELS_EN[frame.id] || frame.label) : frame.label;
}

export function getFrameDesc(frameOrId, lang="fr") {
  const frame = typeof frameOrId === "string" ? FRAMES[frameOrId] : frameOrId;
  if(!frame) return "";
  return lang === "en" ? (FRAME_DESCS_EN[frame.id] || frame.desc) : frame.desc;
}
