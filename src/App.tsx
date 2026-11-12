import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { EpisodeList, prettyName, type Episode } from "./EpisodeList";
import { VideoPlayer } from "./VideoPlayer";
import { deleteEpisode, listEpisodes, saveEpisodes, type Stored } from "./library";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const ACCEPTED = [".mp4", ".mkv"];

// Reads the input's total duration in seconds from FFmpeg's stderr report.
async function probeDuration(ffmpeg: FFmpeg, input: string): Promise<number> {
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => lines.push(message);
  ffmpeg.on("log", onLog);
  await ffmpeg.exec(["-i", input]);
  ffmpeg.off("log", onLog);
  const line = lines.find((l) => /Duration:\s*\d/.test(l));
  const match = line?.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error("Could not read the video's length.");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** One card per source show; clicking opens its episode list. */
function ShowCard({ show, count, onOpen }: { show: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="card group block w-full overflow-hidden text-left">
      <div className="grid aspect-[2/3] place-items-center bg-gradient-to-br from-accent/30 to-surface2 p-4 text-center">
        <span className="text-lg font-bold text-ink line-clamp-4">{show}</span>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-sm font-semibold text-ink">{show}</span>
        <span className="tile-chip shrink-0">{count} EP</span>
      </div>
    </button>
  );
}

export default function App() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [minutes, setMinutes] = useState("20");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Drop a video to begin.");
  const [error, setError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const active = episodes.find((ep) => ep.name === activeName) ?? episodes[0] ?? null;
  const [library, setLibrary] = useState<Stored[]>([]);
  const [view, setView] = useState<"split" | "home">("split");
  const [openShow, setOpenShow] = useState<string | null>(null);
  // Group saved parts by source file, so each show is one card.
  const shows = Object.entries(
    library.reduce<Record<string, Stored[]>>((acc, item) => {
      (acc[item.sourceName] ??= []).push(item);
      return acc;
    }, {}),
  ).map(([show, items]) => [show, [...items].sort((a, b) => a.name.localeCompare(b.name))] as [string, Stored[]]);

  useEffect(() => {
    void listEpisodes().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    return () => episodes.forEach((ep) => URL.revokeObjectURL(ep.url));
    // Revoke object URLs only when the list is replaced or the page unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes]);

  function pickFile(candidate: File | undefined) {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
      setError("Only .mp4 or .mkv files are supported.");
      return;
    }
    setError(null);
    setFile(candidate);
    setStatus(`Ready: ${candidate.name}`);
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
    if (!Number.isFinite(mins) || mins <= 0) {
      setError("Enter a segment length above 0 minutes.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress(0);
    setEpisodes((old) => {
      old.forEach((ep) => URL.revokeObjectURL(ep.url));
      return [];
    });

    try {
      const ffmpeg = await loadFfmpeg();
      // FFmpeg reports progress per cut (0-100% each), so map it onto the whole job.
      let partIndex = 0;
      let partCount = 0;
      const onProgress = ({ progress: p }: { progress: number }) => {
        if (partCount === 0) return;
        const within = Math.min(1, Math.max(0, p));
        setProgress(Math.round(((partIndex + within) / partCount) * 100));
      };
      ffmpeg.on("progress", onProgress);

      // WORKERFS reads the picked file in place, so a 1–2 GB video is never copied into memory.
      setStatus("Mounting file…");
      await ffmpeg.createDir("/work");
      await ffmpeg.mount("WORKERFS" as never, { files: [file] } as never, "/work");
      const input = `/work/${file.name}`;

      // One part at a time: a single segment run would hold the whole video in WASM memory.
      const seconds = Math.round(mins * 60);
      const total = await probeDuration(ffmpeg, input);
      partCount = Math.max(1, Math.ceil(total / seconds));
      const built: Episode[] = [];
      for (let i = 0, start = 0; start < total; i++, start += seconds) {
        const name = `Episode_${String(i + 1).padStart(2, "0")}.mp4`;
        partIndex = i;
        setStatus(`Cutting ${name} (stream copy, no re-encode)…`);
        await ffmpeg.exec([
          "-ss", String(start),
          "-i", input,
          "-t", String(seconds),
          "-c", "copy",
          "-avoid_negative_ts", "make_zero",
          name,
        ]);
        const data = (await ffmpeg.readFile(name)) as Uint8Array;
        const blob = new Blob([data.slice().buffer], { type: "video/mp4" });
        built.push({ name, url: URL.createObjectURL(blob), size: blob.size });
        await ffmpeg.deleteFile(name);
        setProgress(Math.round(((i + 1) / partCount) * 100));
      }
      ffmpeg.off("progress", onProgress);

      await ffmpeg.unmount("/work");

      setEpisodes(built);
      setActiveName(built[0]?.name ?? null);
      // Auto-save every part to the library so it stays after a refresh.
      const createdAt = Date.now();
      const stored: Stored[] = await Promise.all(
        built.map(async (ep, i) => ({
          id: `${createdAt}-${ep.name}`,
          name: ep.name,
          sourceName: file.name,
          createdAt: createdAt + i,
          blob: await fetch(ep.url).then((r) => r.blob()),
        })),
      );
      await saveEpisodes(stored);
      setLibrary(await listEpisodes());
      setProgress(100);
      setStatus(
        built.length
          ? `Done: ${built.length} episode${built.length === 1 ? "" : "s"}.`
          : "No episodes were produced. Check the file.",
      );
    } catch (e) {
      const message = (e as Error).message || String(e);
      setError(`Split failed: ${message}`);
      setStatus("Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">Episode Splitter</h1>
          <p className="text-sm text-muted">
            Runs entirely in your browser. Your video never leaves your computer.
          </p>
        </div>
        <nav className="flex gap-2">
          {(["split", "home"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setView(tab)}
              className={`btn ${view === tab ? "btn-primary" : ""}`}
            >
              {tab === "home" ? `Home (${shows.length})` : "Split"}
            </button>
          ))}
        </nav>
      </header>

      {view === "home" && (
        <section className="space-y-4">
          {!openShow && (
            <>
              <h2 className="text-xl font-semibold text-ink">Shows</h2>
              {shows.length === 0 && (
                <p className="text-muted">Nothing saved yet. Split a video and it shows up here.</p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {shows.map(([show, items]) => (
                  <ShowCard key={show} show={show} count={items.length} onOpen={() => setOpenShow(show)} />
                ))}
              </div>
            </>
          )}
          {openShow && (
            <>
              <button type="button" onClick={() => setOpenShow(null)} className="btn">
                ← All shows
              </button>
              <h2 className="text-xl font-semibold text-ink">{openShow}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {(shows.find(([s]) => s === openShow)?.[1] ?? []).map((item) => (
                  <div key={item.id} className="card flex flex-col gap-2 p-3">
                    <button
                      type="button"
                      className="grid aspect-[2/3] place-items-center rounded-lg bg-surface2 text-center text-lg font-bold text-ink hover:text-accent"
                      onClick={() => {
                        setEpisodes([{ name: item.name, url: URL.createObjectURL(item.blob), size: item.blob.size }]);
                        setActiveName(item.name);
                        setView("split");
                      }}
                    >
                      {prettyName(item.name)}
                    </button>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={async () => {
                        await deleteEpisode(item.id);
                        setLibrary(await listEpisodes());
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {view === "split" && (<>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files[0]);
        }}
        className={`card cursor-pointer border-2 border-dashed p-10 text-center ${
          dragging ? "border-accent" : ""
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".mp4,.mkv,video/mp4,video/x-matroska"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <p className="text-lg text-ink">
          {file ? file.name : "Drag & drop an .mp4 or .mkv here"}
        </p>
        <p className="mt-1 text-sm text-muted">or click to choose a file</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm text-muted">
          Segment length (minutes)
          <input
            type="number"
            min="1"
            step="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="input mt-1 w-40"
          />
        </label>
        <button
          onClick={split}
          disabled={!file || busy}
          className="btn btn-primary px-5 py-2.5 disabled:opacity-50"
        >
          {busy ? "Splitting…" : "Split into Episodes"}
        </button>
      </div>

      {(busy || progress > 0) && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted">
            {status} {progress}%
          </p>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-2 text-red-300">{error}</p>}

      {active && (
        <section className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="card space-y-3 overflow-hidden p-3">
            <VideoPlayer key={active.url} src={active.url} title={active.name} />
            <div className="flex items-center justify-between px-1 text-sm text-muted">
              <span className="font-semibold text-ink">{prettyName(active.name)}</span>
              <a href={active.url} download={active.name} className="text-accent hover:underline">
                Download
              </a>
            </div>
          </div>
          <EpisodeList episodes={episodes} activeName={active.name} onSelect={setActiveName} />
        </section>
      )}
      </>)}
    </main>
  );
}
