// ─── SUPABASE CLIENT (SDK officiel) ──────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── GOOGLE AUTH ──────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if(error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// ─── REST HELPERS ─────────────────────────────────────────────────────────────
export const sb = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON,
    "Authorization": `Bearer ${SUPABASE_ANON}`,
  },

  async query(path, opts={}) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this.headers, ...opts });
    if(!r.ok) { const e = await r.text(); throw new Error(e); }
    if(r.status === 204 || r.headers.get("content-length") === "0") return null;
    const text = await r.text();
    if(!text) return null;
    return JSON.parse(text);
  },

  async getProfile(username) {
    const rows = await this.query(`profiles?username=eq.${encodeURIComponent(username)}&limit=1`);
    return rows?.[0] || null;
  },
  async upsertProfile(data) {
    const row = {
      username:         data.username,
      name:             data.name,
      avatar:           data.avatar,
      bio:              data.bio || "",
      watched:          data.watched,
      statuses:         data.statuses,
      ratings:          data.ratings,
      favorites:        data.favorites,
      hidden_completed: data.hiddenCompleted || data.hidden_completed || [],
      posts:            data.posts,
      active_frame:     data.activeFrame || null,
      updated_at:       data.updated_at,
    };
    return this.query("profiles?on_conflict=username", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
  },

  async getMoodPts(mal_id) {
    try {
      const rows = await this.query(`mood_pts_v2?mal_id=eq.${mal_id}&limit=1`);
      if(rows?.[0]) return rows[0];
    } catch {}
    return null;
  },

  async getCommunityVotes(mal_id) {
    try {
      const rows = await this.query(`mood_community_votes?mal_id=eq.${mal_id}&limit=1`);
      return rows?.[0] || null;
    } catch { return null; }
  },
  async upsertCommunityVotes(mal_id, pts) {
    return this.query("mood_community_votes?on_conflict=mal_id", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ mal_id, ...pts }),
    });
  },

  async getAnimeFromCache(mal_id) {
    const rows = await this.query(`anime_cache?mal_id=eq.${mal_id}&limit=1`);
    return rows?.[0] || null;
  },
  async searchAnimeCache(q, limit=24) {
    const enc = encodeURIComponent(q);
    return this.query(`anime_cache?title=ilike.*${enc}*&order=score.desc.nullslast&limit=${limit}`);
  },
  async getAnimeCacheByIds(ids) {
    if(!ids.length) return [];
    return this.query(`anime_cache?mal_id=in.(${ids.join(",")})&limit=${ids.length}`);
  },
  async upsertAnimeCache(row) {
    return this.query("anime_cache?on_conflict=mal_id", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
  },

  async upsertUserVote(username, mal_id, moods, ptsAdded) {
    return this.query("user_votes?on_conflict=username,mal_id", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ username, mal_id, moods, pts_added: ptsAdded, voted_at: new Date().toISOString() }),
    });
  },
};

// ─── PROFILE HELPERS ──────────────────────────────────────────────────────────
export async function loadProfile(username) {
  try {
    const remote = await sb.getProfile(username);
    if(remote) {
      const profile = {
        ...remote,
        hiddenCompleted: remote.hidden_completed || remote.hiddenCompleted || [],
        activeFrame: remote.active_frame || remote.activeFrame || null,
      };
      localStorage.setItem(`animood_profile_${username}`, JSON.stringify(profile));
      return profile;
    }
  } catch {}
  try { return JSON.parse(localStorage.getItem(`animood_profile_${username}`)); } catch { return null; }
}

export async function saveProfile(username, data) {
  try { localStorage.setItem(`animood_profile_${username}`, JSON.stringify(data)); } catch {}
  try {
    await sb.upsertProfile({ username, ...data, updated_at: new Date().toISOString() });
  } catch(e) { console.warn("Profile sync failed:", e); }
}

// ─── FOLLOWS ──────────────────────────────────────────────────────────────────
export const follows = {
  async getFollowers(username) {
    const rows = await sb.query(`follows?following=eq.${encodeURIComponent(username)}&select=follower`);
    return (rows||[]).map(r=>r.follower);
  },
  async getFollowing(username) {
    const rows = await sb.query(`follows?follower=eq.${encodeURIComponent(username)}&select=following`);
    return (rows||[]).map(r=>r.following);
  },
  async isFollowing(follower, following) {
    const rows = await sb.query(`follows?follower=eq.${encodeURIComponent(follower)}&following=eq.${encodeURIComponent(following)}&limit=1`);
    return (rows||[]).length > 0;
  },
  async follow(follower, following) {
    await sb.query("follows", {
      method:"POST",
      headers:{...sb.headers,"Prefer":"resolution=ignore-duplicates"},
      body: JSON.stringify({ follower, following }),
    });
  },
  async unfollow(follower, following) {
    await sb.query(`follows?follower=eq.${encodeURIComponent(follower)}&following=eq.${encodeURIComponent(following)}`, {
      method:"DELETE",
    });
  },
};
