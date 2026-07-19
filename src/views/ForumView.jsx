import { EmptyState } from "../components/EmptyState.jsx";

export function ForumView() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-20">
      <EmptyState emoji="💬" title="Forum — bientôt disponible" subtitle="Discute avec d'autres fans d'anime, bientôt sur AniMood." />
    </div>
  );
}
