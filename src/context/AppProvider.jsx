import { useState, useEffect, useCallback } from "react";
import { onAuthChange, loadProfile, saveProfile, signOut } from "../api/supabase.js";
import { DEFAULT_PROFILE } from "../constants/profile.js";
import { AppContext } from "./appContextObject.js";

function usernameFromEmail(email) {
  return email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
}

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

  // Update + persist in one call — every write path goes through here so nothing
  // can accidentally save under the wrong (or a hardcoded) username.
  const saveMe = useCallback((updated) => {
    setMe(updated);
    saveProfile(myUsername, updated);
  }, [myUsername]);

  const logout = async () => { await signOut(); setSession(null); setProfileReady(false); };

  const ctx = { session, me, setMe, saveMe, myUsername, profileReady, logout };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}
