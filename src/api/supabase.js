// ─── SUPABASE CLIENT (SDK officiel) ──────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "https://pjkvhhxwjzpmxmhdhwcp.supabase.co";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqa3ZoaHh3anpwbXhtaGRod2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDA5ODgsImV4cCI6MjA5NjAxNjk4OH0.fj3pEDLYZqHmugfWfJvVX008He7lwUDx6-avmqJl8kI";

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
      anilist_sub_lists: data.anilistSubLists || data.anilist_sub_lists || {},
      active_frame:     data.activeFrame || null,
      avatar_base64:    data.avatar_base64 || null,
      highlights:        data.highlights || [],
      custom_lists:     data.customLists || [],
      pinned_list:      data.pinnedList || null,
      updated_at:       data.updated_at,
    };
    return this.query("profiles?on_conflict=username", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
  },

  async getRecentMoodVotes(sinceISO) {
    try { return await this.query(`user_votes?select=moods,voted_at&voted_at=gte.${encodeURIComponent(sinceISO)}&limit=1000`) || []; }
    catch { return []; }
  },

  async getMoodPtsBatch(ids) {
    if(!ids.length) return {};
    try {
      const rows = await this.query(`mood_pts_v2?mal_id=in.(${ids.join(",")})&limit=${ids.length}`);
      const out = {};
      (rows||[]).forEach(r => { out[r.mal_id] = r; });
      return out;
    } catch { return {}; }
  },

  async getAllFavorites() {
    try { return await this.query(`profiles?select=favorites&limit=1000`) || []; }
    catch { return []; }
  },

  // ─── Forum threads/replies — skeleton, no reactions, no pagination ──────────
  async listThreads(limit = 20) {
    try { return await this.query(`forum_threads?select=*&order=created_at.desc&limit=${limit}`) || []; }
    catch { return []; }
  },
  async getReplyCounts(threadIds) {
    if(!threadIds.length) return {};
    try {
      const rows = await this.query(`forum_replies?select=thread_id&thread_id=in.(${threadIds.join(",")})`) || [];
      const out = {};
      rows.forEach(r => { out[r.thread_id] = (out[r.thread_id] || 0) + 1; });
      return out;
    } catch { return {}; }
  },
  async getThreadReplies(threadId) {
    try { return await this.query(`forum_replies?thread_id=eq.${threadId}&order=created_at.asc`) || []; }
    catch { return []; }
  },
  async createThread(username, title, body, tags = []) {
    return this.query("forum_threads", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify([{ username, title, body, tags }]),
    });
  },
  async createReply(threadId, username, body) {
    return this.query("forum_replies", {
      method: "POST",
      headers: { ...this.headers, "Prefer": "return=representation" },
      body: JSON.stringify([{ thread_id: threadId, username, body }]),
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

  async getUserVote(username, mal_id) {
    try {
      const rows = await this.query(`user_votes?username=eq.${encodeURIComponent(username)}&mal_id=eq.${mal_id}&limit=1`);
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
        anilistSubLists: remote.anilist_sub_lists || remote.anilistSubLists || {},
        activeFrame: remote.active_frame || remote.activeFrame || null,
        avatar_base64: remote.avatar_base64 || null,
        highlights: remote.highlights || [],
        customLists: remote.custom_lists || remote.customLists || [],
        pinnedList: remote.pinned_list || remote.pinnedList || null,
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

// ─── DIRECT MESSAGES — 1:1 chat, no group threads/attachments ─────────────────
export const dm = {
  // Distinct conversations involving `username`, each with its last message —
  // most recently active first.
  async listConversations(username) {
    const u = encodeURIComponent(username);
    let rows;
    try { rows = await sb.query(`direct_messages?or=(sender.eq.${u},recipient.eq.${u})&order=created_at.desc&limit=200`); }
    catch { return []; }
    const byPeer = new Map();
    (rows||[]).forEach(m => {
      const peer = m.sender === username ? m.recipient : m.sender;
      if(!byPeer.has(peer)) byPeer.set(peer, m); // first hit per peer = most recent (desc order)
    });
    return [...byPeer.entries()].map(([peer, lastMessage]) => ({ peer, lastMessage }));
  },
  async getThread(username, peer) {
    const u = encodeURIComponent(username), p = encodeURIComponent(peer);
    try {
      return await sb.query(`direct_messages?or=(and(sender.eq.${u},recipient.eq.${p}),and(sender.eq.${p},recipient.eq.${u}))&order=created_at.asc&limit=500`) || [];
    } catch { return []; }
  },
  async sendMessage(sender, recipient, body) {
    return sb.query("direct_messages", {
      method: "POST",
      headers: { ...sb.headers, "Prefer": "return=representation" },
      body: JSON.stringify([{ sender, recipient, body }]),
    });
  },
};

// ─── POSTS ────────────────────────────────────────────────────────────────────
export const posts = {
  async getFeed({ limit=20, offset=0, username=null, animeId=null, genre=null, season=null, following=[] }) {
    let url = `posts?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if(username) url = `posts?select=*&username=eq.${encodeURIComponent(username)}&order=created_at.desc&limit=${limit}&offset=${offset}`;
    else if(animeId) url += `&anime_id=eq.${animeId}`;
    else if(following.length) url += `&username=in.(${following.map(u=>encodeURIComponent(u)).join(",")})`;
    return sb.query(url);
  },
  async create(post) {
    return sb.query("posts", {
      method:"POST",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body: JSON.stringify(post),
    });
  },
  async delete(id) {
    return sb.query(`posts?id=eq.${id}`, { method:"DELETE" });
  },
  async toggleLike(id, username) {
    const rows = await sb.query(`posts?id=eq.${id}&select=likes&limit=1`);
    const likes = rows?.[0]?.likes || [];
    const newLikes = likes.includes(username) ? likes.filter(u=>u!==username) : [...likes, username];
    return sb.query(`posts?id=eq.${id}`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body: JSON.stringify({ likes: newLikes }),
    });
  },
};

// ─── COMMENTS ─────────────────────────────────────────────────────────────────
export const comments = {
  async getForPost(postId) {
    return sb.query(`comments?post_id=eq.${postId}&order=created_at.asc&limit=50`);
  },
  async create(comment) {
    return sb.query("comments", {
      method:"POST",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body: JSON.stringify(comment),
    });
  },
  async delete(id) {
    return sb.query(`comments?id=eq.${id}`, { method:"DELETE" });
  },
  async toggleLike(id, username) {
    const rows = await sb.query(`comments?id=eq.${id}&select=likes&limit=1`);
    const likes = rows?.[0]?.likes || [];
    const newLikes = likes.includes(username) ? likes.filter(u=>u!==username) : [...likes, username];
    return sb.query(`comments?id=eq.${id}`, {
      method:"PATCH",
      headers:{...sb.headers,"Prefer":"return=representation"},
      body: JSON.stringify({ likes: newLikes }),
    });
  },
};
