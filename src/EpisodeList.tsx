export type Episode = { name: string; url: string; size: number };

// "Episode_01.mp4" -> "Episode 1"
export function prettyName(name: string) {
  const match = name.match(/(\d+)/);
  return match ? `Episode ${Number(match[1])}` : name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** Sidebar list of parts; clicking one plays it in the main player. */
export function EpisodeList({
  episodes,
  activeName,
  onSelect,
}: {
  episodes: Episode[];
  activeName: string | null;
  onSelect: (name: string) => void;
}) {
  if (episodes.length === 0) return null;

  return (
    <aside className="space-y-2">
      <h2 className="text-lg font-semibold text-ink">Episodes</h2>
      <ul className="space-y-1">
        {episodes.map((ep) => (
          <li key={ep.name}>
            <button
              type="button"
              onClick={() => onSelect(ep.name)}
              className={`card w-full px-3 py-2 text-left text-sm ${
                activeName === ep.name ? "border-accent text-ink" : "text-muted"
              }`}
            >
              <span className="block font-medium">{prettyName(ep.name)}</span>
              <span className="text-xs opacity-70">{formatSize(ep.size)}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
