import { useState, useEffect, useCallback } from "react";
import { onAuthChange, loadProfile, saveProfile, signOut, dm, posts, sb, blocks } from "../api/supabase.js";
import { DEFAULT_PROFILE } from "../constants/profile.js";
import { AppContext } from "./appContextObject.js";

function usernameFromEmail(email) {
  return email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
}

const lastReadKey = (username, peer) => `animood_dm_read_${username}_${peer}`;
const postReadKey = (username, postId) => `animood_post_read_${username}_${postId}`;
const threadReadKey = (username, threadId) => `animood_forum_read_${username}_${threadId}`;
const postMentionReadKey = (username, postId) => `animood_mention_post_read_${username}_${postId}`;
const threadMentionReadKey = (username, threadId) => `animood_mention_thread_read_${username}_${threadId}`;
const activityReadKeyFns = {
  post: postReadKey, thread: threadReadKey,
  "post-mention": postMentionReadKey, "thread-mention": threadMentionReadKey,
};

export function AppProvider({ children }) {
  const [session, setSession]         = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [me, setMe]                   = useState(DEFAULT_PROFILE);

  useEffect(() => {
    const { data: { subscription } } = onAuthChange(async (sess) => {
      setSession(sess);
      if(sess) {
        const email    = sess.user.email;
        const username = usernameFromEmail(email);
        const name     = sess.user.user_metadata?.full_name || username;
        const avatar   = sess.user.user_metadata?.avatar_url || "🎮";
        const profile  = await loadProfile(username) || { ...DEFAULT_PROFILE, id: username, name, avatar };
        setMe(profile);
        setProfileReady(true);
      } else {
        setProfileReady(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const myUsername = session ? usernameFromEmail(session.user.email) : "";

  // Persist profile on change
  useEffect(() => {
    if(session && profileReady) saveProfile(myUsername, me);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unread DM tracking — no read_at column server-side, so "read" is just a
  // per-peer timestamp kept in localStorage; a conversation is unread when its
  // last message is newer than that timestamp and wasn't sent by me.
  const [unreadPeers, setUnreadPeers] = useState(new Set());

  useEffect(() => {
    if(!myUsername) return;
    let cancelled = false;
    const check = async () => {
      const convos = await dm.listConversations(myUsername);
      if(cancelled) return;
      const unread = new Set();
      convos.forEach(c => {
        if(c.lastMessage.sender === myUsername) return;
        const lastRead = localStorage.getItem(lastReadKey(myUsername, c.peer));
        if(!lastRead || new Date(c.lastMessage.created_at) > new Date(lastRead)) unread.add(c.peer);
      });
      setUnreadPeers(unread);
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [myUsername]);

  // Blocked users — one-directional, enforced at the UI level only (this app
  // has no per-user RLS: every request already uses the shared anon key).
  const [blockedUsers, setBlockedUsers] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = myUsername ? await blocks.getBlockedByMe(myUsername).catch(()=>[]) : [];
      if(!cancelled) setBlockedUsers(new Set(list));
    })();
    return () => { cancelled = true; };
  }, [myUsername]);

  const blockUser = useCallback(async (username) => {
    if(!myUsername || username === myUsername) return;
    setBlockedUsers(prev => new Set(prev).add(username));
    try { await blocks.block(myUsername, username); }
    catch(e) { console.error(e); setBlockedUsers(prev => { const n = new Set(prev); n.delete(username); return n; }); }
  }, [myUsername]);

  const unblockUser = useCallback(async (username) => {
    if(!myUsername) return;
    setBlockedUsers(prev => { const n = new Set(prev); n.delete(username); return n; });
    try { await blocks.unblock(myUsername, username); }
    catch(e) { console.error(e); setBlockedUsers(prev => new Set(prev).add(username)); }
  }, [myUsername]);

  const markRead = useCallback((peer) => {
    if(!myUsername) return;
    localStorage.setItem(lastReadKey(myUsername, peer), new Date().toISOString());
    setUnreadPeers(prev => {
      if(!prev.has(peer)) return prev;
      const next = new Set(prev);
      next.delete(peer);
      return next;
    });
  }, [myUsername]);

  // Activity notifications — new comments/replies (from someone else) on a Feed
  // post or Forum thread I started or took part in, PLUS any post/comment/
  // thread/reply where someone else typed "@myUsername" (regardless of whether
  // I've ever posted/commented there). All four sources feed the same list so
  // the header bell and any inline per-item badge (e.g. Forum's thread
  // rows) read from one place and never drift out of sync. Same client-side
  // last-read-timestamp approach as DMs above.
  const [activityNotifications, setActivityNotifications] = useState([]);

  useEffect(() => {
    if(!myUsername) return;
    let cancelled = false;
    const check = async () => {
      const [postNotifs, threadNotifs, postMentions, threadMentions] = await Promise.all([
        posts.getActivityNotifications(myUsername),
        sb.getThreadActivityNotifications(myUsername),
        posts.getMentionNotifications(myUsername),
        sb.getThreadMentionNotifications(myUsername),
      ]);
      if(cancelled) return;

      const toEntry = (type, id, title, isMine, items, readKey) => {
        const lastRead = localStorage.getItem(readKey);
        const unseen = items.filter(it => !lastRead || new Date(it.created_at) > new Date(lastRead));
        if(!unseen.length) return null;
        return { type, id, title, isMine, count: unseen.length, lastComment: unseen[0] };
      };

      const posts_ = postNotifs
        .map(n => toEntry("post", n.postId, n.postContent, n.isMine, n.items, postReadKey(myUsername, n.postId)))
        .filter(Boolean);
      const threads_ = threadNotifs
        .map(n => toEntry("thread", n.threadId, n.threadTitle, n.isMine, n.items, threadReadKey(myUsername, n.threadId)))
        .filter(Boolean);
      const postMentions_ = postMentions
        .map(n => toEntry("post-mention", n.postId, n.postContent, n.isMine, n.items, postMentionReadKey(myUsername, n.postId)))
        .filter(Boolean);
      const threadMentions_ = threadMentions
        .map(n => toEntry("thread-mention", n.threadId, n.threadTitle, n.isMine, n.items, threadMentionReadKey(myUsername, n.threadId)))
        .filter(Boolean);

      const merged = [...posts_, ...threads_, ...postMentions_, ...threadMentions_]
        .sort((a, b) => new Date(b.lastComment.created_at) - new Date(a.lastComment.created_at));
      setActivityNotifications(merged);
    };
    check();
    const interval = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [myUsername]);

  const markActivityRead = useCallback((type, id) => {
    if(!myUsername) return;
    const key = (activityReadKeyFns[type] || postReadKey)(myUsername, id);
    localStorage.setItem(key, new Date().toISOString());
    setActivityNotifications(prev => prev.filter(n => !(n.type === type && n.id === id)));
  }, [myUsername]);

  // Update + persist in one call — every write path goes through here so nothing
  // can accidentally save under the wrong (or a hardcoded) username.
  const saveMe = useCallback((updated) => {
    setMe(updated);
    saveProfile(myUsername, updated);
  }, [myUsername]);

  const logout = async () => { await signOut(); setSession(null); setProfileReady(false); };

  const ctx = {
    session, me, setMe, saveMe, myUsername, profileReady, logout,
    unreadPeers, markRead, activityNotifications, markActivityRead,
    blockedUsers, blockUser, unblockUser,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}
