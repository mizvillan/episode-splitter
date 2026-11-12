import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { EpisodeList, prettyName, type Episode } from "./EpisodeList";
import { VideoPlayer } from "./VideoPlayer";
import { deleteEpisode, listEpisodes, saveEpisodes, type Stored } from "./library";
import { grabPoster } from "./poster";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const ACCEPTED = [".mp4", ".mkv"];

async function probeDuration(ffmpeg: FFmpeg, input: string): Promise<number> {
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => lines.push(message);
  ffmpeg.on("log", onLog);
  try { await ffmpeg.exec(["-i", input]); } catch { /* -i alone exits non-zero; logs still arrive */ }
  ffmpeg.off("log", onLog);
  const line = lines.find((l) => /Duration:\s*\d/.test(l));
  const match = line?.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error("Could not read the video's length.");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function showTitle(sourceName: string) {
  return sourceName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+episode\s*\d+\s*$/i, "").replace(/\s{2,}/g, " ").trim() || sourceName;
}

/** Mizwatch AnimeCard-style card: 2/3 poster, chips, title + meta below. */
function ShowCard({ show, items, onOpen }: { show: string; items: Stored[]; onOpen: () => void }) {
  const [poster, setPoster] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void grabPoster(items[0].blob).then((p) => { if (live) setPoster(p); });
    return () => { live = false; };
  }, [items]);

  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} aria-label={`Watch ${showTitle(show)}`}
        className="block w-full rounded-xl text-left outline-offset-4">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface2 transition duration-300 group-hover:-translate-y-1 group-hover:border-accent/40 group-hover:shadow-[0_18px_38px_-18px_rgb(0_0_0/0.7)]">
          <div className="aspect-[2/3] w-full">
            {poster ? (
              <img src={poster} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />
            ) : (
              <div className="grid size-full place-items-center bg-gradient-to-br from-accent/25 to-surface2 p-4 text-center">
                <span className="line-clamp-4 text-base font-bold text-ink">{showTitle(show)}</span>
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/0 opacity-0 transition group-hover:opacity-100" />
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur">
            {items.length} EP
          </span>
          <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accentink shadow-2xl">▶</span>
          </span>
        </div>
      </button>
      <button type="button" onClick={onOpen} className="mt-2 block w-full text-left">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{showTitle(show)}</h3>
        <p className="mt-0.5 truncate text-[11px] text-muted">{items.length} episodes · Split</p>
      </button>
    </div>
  );
}

type View = "split" | "home" | "watch";

export default function App() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [minutes, setMinutes] = useState("20");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [status, setStatus] = useState("Drop a video to begin.");
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const active = episodes.find((ep) => ep.name === activeName) ?? episodes[0] ?? null;
  const [library, setLibrary] = useState<Stored[]>([]);
  const [view, setView] = useState<View>("split");
  const [openShow, setOpenShow] = useState<string | null>(null);

  const shows = Object.entries(
    library.reduce<Record<string, Stored[]>>((acc, item) => { (acc[item.sourceName] ??= []).push(item); return acc; }, {}),
  ).map(([show, items]) => [show, [...items].sort((a, b) => a.name.localeCompare(b.name))] as [string, Stored[]]);

  // Watch view: all episodes of the opened show, object URLs kept for the view.
  const [watchEpisodes, setWatchEpisodes] = useState<Episode[]>([]);
  const [watchActive, setWatchActive] = useState<string | null>(null);
  useEffect(() => {
    if (view !== "watch" || !openShow) { setWatchEpisodes([]); return; }
    const items = shows.find(([s]) => s === openShow)?.[1] ?? [];
    const eps: Episode[] = items.map((it) => ({ name: it.name, url: URL.createObjectURL(it.blob), size: it.blob.size, blob: it.blob }));
    setWatchEpisodes(eps);
    setWatchActive(eps[0]?.name ?? null);
    return () => eps.forEach((ep) => URL.revokeObjectURL(ep.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, openShow, library.length]);
  const watchCurrent = watchEpisodes.find((ep) => ep.name === watchActive) ?? watchEpisodes[0] ?? null;

  useEffect(() => {
    void listEpisodes().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  // Monotonic progress: never let the bar go backwards.
  const bump = (value: number) => {
    progressRef.current = Math.max(progressRef.current, Math.min(100, Math.round(value)));
    setProgress(progressRef.current);
  };

  function pickFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!ACCEPTED.some((ext) => candidate.name.toLowerCase().endsWith(ext))) {
      setError("Only .mp4 or .mkv files are supported."); return;
    }
    setError(null); setFile(candidate); setStatus(`Ready: ${candidate.name}`);
  }

  async function loadFfmpeg(): Promise<FFmpeg> {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    const ffmpeg = ffmpegRef.current ?? new FFmpeg();
    ffmpegRef.current = ffmpeg;
    setStatus("Loading FFmpeg (about 30 MB, first time only)…");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ffmpeg;
  }

  async function split() {
    if (!file) return;
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) { setError("Enter a segment length above 0 minutes."); return; }
    setError(null); setBusy(true); progressRef.current = 0; setProgress(0); setEpisodes([]);
    let mounted = false;
    try {
      const ffmpeg = await loadFfmpeg();
      let partIndex = 0, partCount = 0;
      const onProgress = ({ progress: p }: { progress: number }) => {
        if (partCount === 0) return;
        bump(((partIndex + Math.min(1, Math.max(0, p))) / partCount) * 100);
      };
      ffmpeg.on("progress", onProgress);

      setStatus("Mounting file…");
      try { await ffmpeg.createDir("/work"); } catch { /* already exists on a re-run */ }
      await ffmpeg.mount("WORKERFS" as never, { files: [file] } as never, "/work");
      mounted = true;
      const input = `/work/${file.name}`;

      const seconds = Math.max(1, Math.round(mins * 60));
      const total = await probeDuration(ffmpeg, input);
      partCount = Math.max(1, Math.ceil(total / seconds));
      const built: Episode[] = [];
      for (let i = 0, start = 0; start < total; i++, start += seconds) {
        const name = `Episode_${String(i + 1).padStart(2, "0")}.mp4`;
        partIndex = i;
        setStatus(`Cutting ${name} (${i + 1}/${partCount}, stream copy)…`);
        await ffmpeg.exec(["-ss", String(start), "-i", input, "-t", String(seconds), "-c", "copy", "-avoid_negative_ts", "make_zero", name]);
        const data = (await ffmpeg.readFile(name)) as Uint8Array;
        const blob = new Blob([data.slice().buffer], { type: "video/mp4" });
        built.push({ name, url: URL.createObjectURL(blob), size: blob.size, blob });
        await ffmpeg.deleteFile(name);
        bump(((i + 1) / partCount) * 100);
      }
      ffmpeg.off("progress", onProgress);

      setEpisodes(built);
      setActiveName(built[0]?.name ?? null);
      const createdAt = Date.now();
      const stored: Stored[] = built.map((ep, i) => ({
        id: `${createdAt}-${ep.name}`, name: ep.name, sourceName: file.name, createdAt: createdAt + i,
        blob: ep.blob,
      }));
      try {
        await saveEpisodes(stored);
      } catch {
        setError("Episodes were cut but could not be saved to the browser library (storage full?). They are still playable and downloadable from this page.");
      }
      setLibrary(await listEpisodes());
      bump(100);
      setStatus(built.length ? `Done: ${built.length} episode${built.length === 1 ? "" : "s"}.` : "No episodes were produced. Check the file.");
    } catch (e) {
      setError(`Split failed: ${(e as Error).message || String(e)}`); setStatus("Failed.");
    } finally {
      if (mounted) { try { await ffmpegRef.current?.unmount("/work"); } catch { /* already gone */ } }
      setBusy(false);
    }
  }

  const playerBlock = (eps: Episode[], current: Episode | null, onSelect: (n: string) => void, showName?: string) => current && (
    <section className="space-y-4">
      <div className="card space-y-3 p-3">
        <VideoPlayer key={current.url} src={current.url} title={current.name} />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted">
          <span className="font-semibold text-ink">{showName ? `${showTitle(showName)} — ` : ""}{prettyName(current.name)}</span>
          <a href={current.url} download={current.name} className="text-accent hover:underline">Download</a>
        </div>
      </div>
      <EpisodeList episodes={eps} activeName={current.name} onSelect={onSelect}
        onDelete={view === "watch" ? async (name) => {
          const item = library.find((l) => l.name === name && l.sourceName === openShow);
          if (item) { await deleteEpisode(item.id); setLibrary(await listEpisodes()); }
        } : undefined} />
    </section>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={() => setView("home")} className="text-left">
          <h1 className="text-3xl font-bold text-ink">Episode Splitter</h1>
          <p className="text-sm text-muted">Runs entirely in your browser. Your video never leaves your computer.</p>
        </button>
        <nav className="flex gap-2">
          <button type="button" onClick={() => setView("split")} className={`btn ${view === "split" ? "btn-primary" : ""}`}>Split</button>
          <button type="button" onClick={() => setView("home")} className={`btn ${view === "home" ? "btn-primary" : ""}`}>Home ({shows.length})</button>
        </nav>
      </header>

      {view === "home" && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-ink">Shows</h2>
          {shows.length === 0 && <p className="text-muted">Nothing saved yet. Split a video and it shows up here.</p>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {shows.map(([show, items]) => (
              <ShowCard key={show} show={show} items={items} onOpen={() => { setOpenShow(show); setView("watch"); }} />
            ))}
          </div>
        </section>
      )}

      {view === "watch" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setView("home")} className="btn">← All shows</button>
            <h2 className="text-xl font-semibold text-ink">{openShow ? showTitle(openShow) : ""}</h2>
            <span className="chip">{watchEpisodes.length} episodes</span>
          </div>
          {watchCurrent ? playerBlock(watchEpisodes, watchCurrent, setWatchActive, openShow ?? undefined)
            : <p className="text-muted">No episodes left for this show.</p>}
        </section>
      )}

      {view === "split" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
            className={`card cursor-pointer border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-accent bg-accent/5" : ""}`}
            onClick={() => document.getElementById("file-input")?.click()}>
            <input id="file-input" type="file" accept=".mp4,.mkv,video/mp4,video/x-matroska" className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])} />
            <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>
            <p className="mt-2 truncate text-base font-semibold text-ink sm:text-lg">{file ? file.name : "Drag & drop an .mp4 or .mkv here"}</p>
            <p className="mt-1 text-sm text-muted">{file ? "Click to choose a different file" : "or click to choose a file · up to ~2 hours, never uploaded"}</p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col text-sm text-muted">
              Segment length (minutes, decimals ok e.g. 0.1 for short clips)
              <input type="number" min="0.05" step="0.05" value={minutes}
                onChange={(e) => setMinutes(e.target.value)} className="input mt-1 w-48" />
            </label>
            <button onClick={split} disabled={!file || busy} className="btn btn-primary px-5 py-2.5 disabled:opacity-50">
              {busy ? "Splitting…" : "Split into Episodes"}
            </button>
          </div>

          {(busy || progress > 0) && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full border border-line bg-surface2">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-muted">{status} {progress}%</p>
            </div>
          )}

          {error && <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-2 text-red-300">{error}</p>}

          {active && playerBlock(episodes, active, setActiveName)}
        </>
      )}
    </main>
  );
}
