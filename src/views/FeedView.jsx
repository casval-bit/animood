import { EmptyState } from "../components/EmptyState.jsx";

export function FeedView() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-20">
      <EmptyState emoji="🏠" title="Feed — bientôt disponible" subtitle="L'actualité de tes amis et des animés du moment arrivera ici." />
    </div>
  );
}
