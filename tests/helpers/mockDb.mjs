// Fausse base Supabase en mémoire (PostgREST + règles de sécurité de supabase/security_rls_3_integrity.sql), pour tester les jeux
// à plusieurs navigateurs sans réseau. Usage : const db = new MockDb(); db.handle({ method, url, headers, body }) → { status, headers, body }
import crypto from "node:crypto";

const PK = { game_elo: "username", profiles: "username" };
const RESERVED = new Set(["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"]);

const usernameFromEmail = (email) => String(email || "").split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
export const makeJwt = (email, uid = crypto.randomUUID()) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 864000 })}.sig`;
};
const whoFrom = (headers) => {
  const m = /^Bearer\s+(.+)$/i.exec(headers.authorization || headers.Authorization || "");
  if (!m) return null;
  try { const p = JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString()); return p.role === "authenticated" ? usernameFromEmail(p.email) : null; }
  catch { return null; }
};

const num = (v) => (v !== null && v !== "" && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : null);
function cmp(a, b) {
  const na = num(a), nb = num(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
// Filtre sur un champ JSON : « state->result->>ak » (->> = texte). Valeur absente → null.
function pathValue(row, k) {
  if (!k.includes("->")) return row[k];
  const [col, ...rest] = k.split(/->>?/);
  const textual = /->>[^>]*$/.test(k);
  let v = row[col];
  for (const key of rest) { if (v === null || v === undefined || typeof v !== "object") return null; v = v[key]; }
  if (v === undefined || v === null) return null;
  return textual ? (typeof v === "object" ? JSON.stringify(v) : String(v)) : v;
}
const looseEq = (a, b) => (a === null || a === undefined ? b === "null" : String(a) === String(b));

function matchOp(val, spec) {
  let neg = false;
  if (spec.startsWith("not.")) { neg = true; spec = spec.slice(4); }
  const dot = spec.indexOf(".");
  const op = spec.slice(0, dot), arg = spec.slice(dot + 1);
  let r;
  switch (op) {
    case "eq": r = looseEq(val, arg); break;
    case "neq": r = !looseEq(val, arg); break;
    case "gt": r = val !== null && val !== undefined && cmp(val, arg) > 0; break;
    case "gte": r = val !== null && val !== undefined && cmp(val, arg) >= 0; break;
    case "lt": r = val !== null && val !== undefined && cmp(val, arg) < 0; break;
    case "lte": r = val !== null && val !== undefined && cmp(val, arg) <= 0; break;
    case "is": r = arg === "null" ? val === null || val === undefined : arg === "true" ? val === true : arg === "false" ? val === false : false; break;
    case "in": { const list = arg.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")); r = val !== null && val !== undefined && list.includes(String(val)); break; }
    case "like": case "ilike": {
      const re = new RegExp("^" + arg.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", op === "ilike" ? "i" : "");
      r = typeof val === "string" && re.test(val); break;
    }
    default: r = true;
  }
  return neg ? !r : r;
}

function parseOr(expr) {   // or=(a.eq.1,b.ilike.*x*)
  const inner = expr.replace(/^\(|\)$/g, "");
  const parts = []; let depth = 0, cur = "";
  for (const ch of inner) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => { const i = p.indexOf("."); return [p.slice(0, i), p.slice(i + 1)]; });
}

export class MockDb {
  constructor({ guard = true } = {}) {
    this.guard = guard;
    this.t = { game_rooms: [], game_elo: [], game_invites: [], anime_cache: [], follows: [], profiles: [], blocks: [] };
    this.log = [];               // { who, method, table, status, note }
    this.failures = [];          // [{ match: (req)=>bool, status, body, once }]
    this.violations = [];        // invariants cassés (ex. une carte de Timeline qui disparaît)
    this.latency = () => 0;      // () => ms : latence simulée par requête
  }
  checkTimelineInvariant(room, who) {
    const s = room.state;
    if (room.game_type !== "timeline" || !s || !Array.isArray(s.hand1)) return;
    const ids = [...s.hand1, ...s.hand2, ...s.timeline, ...(s.deck || [])].map((c) => c.mal_id);
    const problems = [];
    if (new Set(ids).size !== ids.length) problems.push("carte en double");
    if (s.timeline.length - 1 !== (s.placed1 || 0) + (s.placed2 || 0)) problems.push("frise ≠ cartes posées");
    if (s.hand1.length > 5 - (s.placed1 || 0) || s.hand2.length > 5 - (s.placed2 || 0)) problems.push("main trop grande");
    if (s.rules === 2 && ids.length + (s.misses1 || 0) + (s.misses2 || 0) !== 27) problems.push(`carte disparue (${ids.length} + ${(s.misses1 || 0) + (s.misses2 || 0)} défaussées ≠ 27)`);
    if (s.rules !== 2 && ids.length !== 11) problems.push(`carte disparue (${ids.length} ≠ 11)`);
    if (problems.length) this.violations.push({ who, problems, h1: s.hand1.length, h2: s.hand2.length, tl: s.timeline.length, placed: `${s.placed1}-${s.placed2}`, at: new Date().toISOString().slice(14, 23) });
  }
  table(name) { return (this.t[name] ||= []); }
  reset() { for (const k of Object.keys(this.t)) this.t[k] = []; this.log = []; }

  select(table, params) {
    let rows = this.table(table).filter((r) => this.rowMatches(r, params));
    const order = params.get("order");
    if (order) {
      const keys = order.split(",").map((s) => { const [c, dir = "asc", nulls] = s.split("."); return { c, desc: dir === "desc", nullsLast: nulls === "nullslast", nullsFirst: nulls === "nullsfirst" }; });
      rows = [...rows].sort((a, b) => {
        for (const k of keys) {
          const x = a[k.c], y = b[k.c];
          const xn = x === null || x === undefined, yn = y === null || y === undefined;
          if (xn || yn) { if (xn && yn) continue; const nullsLast = k.nullsLast || (!k.nullsFirst && !k.desc); return (xn ? 1 : -1) * (nullsLast ? 1 : -1); }
          const c = cmp(x, y); if (c) return k.desc ? -c : c;
        }
        return 0;
      });
    }
    const off = Number(params.get("offset")) || 0, lim = params.get("limit") ? Number(params.get("limit")) : Infinity;
    rows = rows.slice(off, off + lim);
    const sel = params.get("select");
    if (sel && sel !== "*") {
      const cols = sel.split(",").map((s) => s.trim().split(":").pop()).filter((s) => s && !s.includes("("));
      if (cols.length && !cols.includes("*")) rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
    }
    return rows;
  }

  rowMatches(r, params) {
    for (const [k, v] of params.entries()) {
      if (RESERVED.has(k)) {
        if (k === "or") { const alts = parseOr(v); if (!alts.some(([col, spec]) => matchOp(r[col], spec))) return false; }
        continue;
      }
      if (!matchOp(pathValue(r, k), v)) return false;
    }
    return true;
  }

  // ── Règles de sécurité (copie de security_rls_3_integrity.sql) ──
  isPlayer(r, me) { return me && [r.player1, r.player2, r.player3, r.player4].includes(me); }
  guardElo(me, oldRow, newRow, op) {
    if (!this.guard) return null;
    if (!me) return "Connexion requise";
    if (op === "INSERT") return null;
    const mine = me === oldRow.username;
    if (newRow.username !== oldRow.username) return "Le pseudo ne peut pas être modifié";
    const dc = (newRow.elo_chain ?? 400) - (oldRow.elo_chain ?? 400), dt = (newRow.elo_timeline ?? 400) - (oldRow.elo_timeline ?? 400);
    if (Math.abs(dc) > 40 || Math.abs(dt) > 40) return "Variation d'ELO trop grande";
    if (!mine) {
      const free = new Set(["elo_chain", "elo_timeline", "points_total", "updated_at"]);
      for (const k of new Set([...Object.keys(newRow), ...Object.keys(oldRow)])) if (!free.has(k) && JSON.stringify(newRow[k]) !== JSON.stringify(oldRow[k])) return "Seuls l'ELO et les points d'un adversaire peuvent être modifiés";
      const d = (newRow.points_total ?? 0) - (oldRow.points_total ?? 0);
      if (d < 0 || d > 20) return "Points d'un adversaire : +20 au plus";
    } else {
      for (const k of Object.keys(newRow)) if (k === "points_total" || k.startsWith("pts_")) { const d = Number(newRow[k]) - Number(oldRow[k] ?? 0); if (d > 200) return `Trop de points d'un coup pour ${k}`; }
    }
    const recent = (gt) => this.table("game_rooms").some((r) => r.game_type === gt
      && new Date(r.updated_at > r.created_at ? r.updated_at : r.created_at).getTime() > Date.now() - 6 * 3600_000
      && this.isPlayer(r, me) && (mine ? !!r.player2 : this.isPlayer(r, oldRow.username)));
    if ((dc > 0 || (dc !== 0 && !mine)) && !recent("chain")) return "ELO Chain : aucune partie récente";
    if ((dt > 0 || (dt !== 0 && !mine)) && !recent("timeline")) return "ELO Timeline : aucune partie récente";
    return null;
  }

  handle({ method, url, headers = {}, body }) {
    const u = new URL(url);
    const path = u.pathname;
    const me = whoFrom(headers);
    const respond = (status, data, extra = {}) => ({ status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra }, body: data === undefined || data === null ? "" : JSON.stringify(data) });

    if (method === "OPTIONS") return { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: "" };
    if (path.startsWith("/auth/v1/")) {
      if (path.endsWith("/user")) { const p = JSON.parse(Buffer.from((headers.authorization || "").replace(/^Bearer\s+/i, "").split(".")[1] || "e30", "base64url").toString() || "{}"); return respond(200, { id: p.sub, aud: "authenticated", role: "authenticated", email: p.email, user_metadata: {}, app_metadata: {} }); }
      return respond(200, {});
    }
    if (path.startsWith("/storage/") || path.startsWith("/functions/")) return respond(200, {});
    const m = /^\/rest\/v1\/(.+)$/.exec(path);
    if (!m) return respond(404, { message: "not found" });
    const [tableName] = m[1].split("?");
    if (tableName.startsWith("rpc/")) return respond(200, null);
    const table = tableName;
    const rows = this.table(table);
    const prefer = headers.prefer || headers.Prefer || "";
    const wantsRep = /return=representation/.test(prefer);
    const single = /vnd\.pgrst\.object/.test(headers.accept || "");
    const params = u.searchParams;
    const note = (status, extra = "") => this.log.push({ who: me, method, table, status, note: extra, q: u.search.slice(0, 160) });

    for (let i = 0; i < this.failures.length; i++) {
      const f = this.failures[i];
      if (f.match({ method, table, params, body, me })) { if (f.once) this.failures.splice(i, 1); note(f.status, "injected"); return respond(f.status, f.body ?? { message: "injected failure" }); }
    }

    if (method === "GET" || method === "HEAD") {
      const out = this.select(table, params);
      note(200);
      if (single) return out.length === 1 ? respond(200, out[0]) : respond(406, { message: "JSON object requested, multiple (or no) rows returned" });
      return respond(200, out, { "content-range": `0-${Math.max(0, out.length - 1)}/${out.length}` });
    }

    let payload = null;
    try { payload = body ? JSON.parse(body) : null; } catch { return respond(400, { message: "bad json" }); }

    if (method === "POST") {
      const items = Array.isArray(payload) ? payload : [payload];
      const pk = PK[table] || "id";
      const created = [];
      for (const it of items) {
        if (this.guard) {
          if (table === "game_rooms" && it.player1 !== me) { note(403, "rls insert"); return respond(403, { code: "42501", message: "new row violates row-level security policy" }); }
          if (table === "game_invites" && it.from_user !== me) { note(403, "rls insert"); return respond(403, { code: "42501", message: "rls" }); }
        }
        let row = { ...it };
        if (table === "game_rooms") row = { id: crypto.randomUUID(), status: "waiting", state: {}, ranked: true, elo1: 400, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), player2: null, player3: null, player4: null, private_code: null, winner: null, ...row };
        else if (table === "game_elo") row = { elo_chain: 400, elo_timeline: 400, points_total: 0, pts_wordle: 0, pts_poster: 0, pts_opquiz: 0, pts_cluescale: 0, pts_undercover: 0, updated_at: new Date().toISOString(), ...row };
        else if (table === "game_invites") row = { id: crypto.randomUUID(), status: "pending", created_at: new Date().toISOString(), ...row };
        else if (row.id === undefined && table !== "game_elo" && table !== "profiles") row.id = crypto.randomUUID();
        const dup = rows.find((r) => r[pk] !== undefined && r[pk] === row[pk]);
        if (dup) {
          if (/ignore-duplicates/.test(prefer)) continue;
          if (/merge-duplicates/.test(prefer)) { Object.assign(dup, row); created.push(dup); continue; }
          note(409, "duplicate"); return respond(409, { code: "23505", message: "duplicate key" });
        }
        if (table === "game_elo" && this.guard && me && me !== row.username) { for (const k of Object.keys(row)) if (k === "points_total" || k.startsWith("pts_")) row[k] = 0; row.elo_chain = 400; row.elo_timeline = 400; }
        rows.push(row); created.push(row);
      }
      note(201);
      return wantsRep ? respond(201, created) : respond(201, null);
    }

    if (method === "PATCH") {
      const targets = rows.filter((r) => this.rowMatches(r, params));
      const updated = [];
      for (const r of targets) {
        if (this.guard && table === "game_rooms" && !(r.status === "waiting" || this.isPlayer(r, me))) continue;     // using (...) : ligne invisible
        const next = { ...r, ...payload };
        if (this.guard && table === "game_rooms") {
          if (!this.isPlayer(next, me)) { note(403, "rls check"); return respond(403, { code: "42501", message: "new row violates row-level security policy for table \"game_rooms\"" }); }
          if (next.player1 !== r.player1 || (r.player2 && next.player2 !== r.player2 && !(me === r.player1 || me === r.player2))) { note(403, "guard room"); return respond(403, { code: "42501", message: "Cette place est déjà prise" }); }
        }
        if (table === "game_elo") { const err = this.guardElo(me, r, next, "UPDATE"); if (err) { note(403, err); return respond(403, { code: "42501", message: err }); } }
        updated.push([r, next]);
      }
      for (const [r, next] of updated) { Object.assign(r, next); if (table === "game_rooms") this.checkTimelineInvariant(r, me); }
      note(200, `${updated.length} row(s)`);
      return wantsRep ? respond(200, updated.map(([r]) => r)) : respond(204, null);
    }

    if (method === "DELETE") {
      const keep = [], gone = [];
      for (const r of rows) {
        const hit = this.rowMatches(r, params) && (!this.guard || table !== "game_rooms" || r.player1 === me);
        (hit ? gone : keep).push(r);
      }
      this.t[table] = keep;
      note(204, `${gone.length} row(s)`);
      return wantsRep ? respond(200, gone) : respond(204, null);
    }
    return respond(405, { message: "method not allowed" });
  }
}

// ── Catalogue d'animés fictif ───────────────────────────────────────────────────────────────────────────────
const STUDIOS = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"];
const GENRES = ["Action", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Horror", "Sports", "Mystery"];
const svg = (n) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='60' height='84'><rect width='60' height='84' fill='hsl(${(n * 47) % 360},55%,40%)'/><text x='30' y='46' font-size='16' fill='white' text-anchor='middle'>${n}</text></svg>`)}`;
export function seedAnime(db, n = 400, rand = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })()) {
  for (let i = 1; i <= n; i++) {
    const year = 1985 + Math.floor(rand() * 40);
    db.table("anime_cache").push({
      mal_id: i, title: `Anime ${i}`, title_en: `Anime ${i}`, year, type: "TV", score: 6 + Math.round(rand() * 30) / 10, scored_by: 2000 + Math.floor(rand() * 900000),
      members: 10000 + Math.floor(rand() * 2000000), popularity: i,
      image_url: svg(i), large_image: svg(i), status: "Finished Airing", rating: "PG-13", episodes: 12,
      studios: [{ name: STUDIOS[i % STUDIOS.length] }, ...(i % 3 === 0 ? [{ name: STUDIOS[(i + 3) % STUDIOS.length] }] : [])],
      genres: [{ name: GENRES[i % GENRES.length] }, { name: GENRES[(i * 3 + 1) % GENRES.length] }],
      themes: [], mood_pts_v4: null, streaming: [],
    });
  }
}
