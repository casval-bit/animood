import { useState, useEffect, useCallback } from "react";
import { onAuthChange, loadProfile, saveProfile, signOut, dm, posts } from "../api/supabase.js";
import { DEFAULT_PROFILE } from "../constants/profile.js";
import { AppContext } from "./appContextObject.js";

function usernameFromEmail(email) {
  return email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
}

const lastReadKey = (username, peer) => `animood_dm_read_${username}_${peer}`;
const postReadKey = (username, postId) => `animood_post_read_${username}_${postId}`;

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

  // Activity notifications — new comments (from someone else) on a post I wrote
  // or commented on. Same client-side last-read-timestamp approach as DMs above.
  const [postNotifications, setPostNotifications] = useState([]);

  useEffect(() => {
    if(!myUsername) return;
    let cancelled = false;
    const check = async () => {
      const notifs = await posts.getActivityNotifications(myUsername);
      if(cancelled) return;
      const unread = notifs.filter(n => {
        const lastRead = localStorage.getItem(postReadKey(myUsername, n.postId));
        return !lastRead || new Date(n.lastComment.created_at) > new Date(lastRead);
      });
      setPostNotifications(unread);
    };
    check();
    const interval = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [myUsername]);

  const markPostRead = useCallback((postId) => {
    if(!myUsername) return;
    localStorage.setItem(postReadKey(myUsername, postId), new Date().toISOString());
    setPostNotifications(prev => prev.filter(n => n.postId !== postId));
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
    unreadPeers, markRead, postNotifications, markPostRead,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}
