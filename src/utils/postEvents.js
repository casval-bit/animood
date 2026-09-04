// ─── Post event bus ──────────────────────────────────────────────────────────
// Sync likes/deletes between FeedView and ProfileView (Mes Posts)

export function dispatchPostEvent(type, data) {
  window.dispatchEvent(new CustomEvent("animood:post", { detail: { type, ...data } }));
}

export function usePostEvents(handler) {
  // Call in a useEffect — handler receives { type, id, likes? }
// type: "like" | "delete"
  return handler; // consumers call addPostEventListener themselves
}

export function addPostEventListener(handler) {
  const fn = (e) => handler(e.detail);
  window.addEventListener("animood:post", fn);
  return () => window.removeEventListener("animood:post", fn);
}
