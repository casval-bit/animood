// ─── Profile visibility — client-side only, same access model as blocking ─────
// (see supabase/profile_privacy_schema.sql: no per-user RLS in this app).
// "friends" means mutual follow: the viewer follows the profile owner AND the
// owner follows the viewer back — callers compute `isFriend` themselves since
// it needs both follow directions, which they usually already have on hand.
export function canViewProfile(profile, { isOwnProfile, isFriend, viewerUsername }) {
  if(isOwnProfile) return true;
  const visibility = profile?.visibility || "everyone";
  if(visibility === "everyone") return true;
  if(visibility === "friends") return !!isFriend;
  if(visibility === "custom") return (profile?.visibilityAllowed || []).includes(viewerUsername);
  return true;
}
