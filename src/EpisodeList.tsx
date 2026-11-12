export type Episode = { name: string; url: string; size: number };

export function prettyName(name: string) {
  const match = name.match(/(\d+)/);
  return match ? `Episode ${Number(match[1])}` : name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Episodes shown BELOW the player (Mizwatch watch-page style). */
export function EpisodeList({
  episodes,
  activeName,
  onSelect,
  onDelete,
}: {
  episodes: Episode[];
  activeName: string | null;
  onSelect: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  if (episodes.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">Episodes <span className="tile-chip ml-1">{episodes.length}</span></h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {episodes.map((ep) => {
          const active = activeName === ep.name;
          return (
            <div key={ep.name} className={`card group overflow-hidden ${active ? "!border-accent" : ""}`}>
              <button type="button" onClick={() => onSelect(ep.name)}
                className="grid aspect-video w-full place-items-center bg-surface2 text-center">
                {active
                  ? <span className="text-xs font-bold uppercase tracking-wide text-accent">▶ Now playing</span>
                  : <span className="px-2 text-sm font-bold text-ink">{prettyName(ep.name)}</span>}
              </button>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink">{prettyName(ep.name)}</p>
                  <p className="text-[11px] text-muted">{formatSize(ep.size)}</p>
                </div>
                {onDelete && (
                  <button type="button" aria-label={`Delete ${prettyName(ep.name)}`}
                    className="shrink-0 rounded px-1 text-[11px] text-muted hover:text-red-400"
                    onClick={() => onDelete(ep.name)}>✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
