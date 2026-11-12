import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Player copied from Mizwatch's VideoPlayer pattern: accent play button,
 * seek-bar thumbnail preview (frames grabbed offscreen + canvas), keyboard
 * shortcuts (Space/F/M/arrows/?), skip-intro/outro buttons, PiP and speed.
 */

interface Thumb { time: number; url: string }

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 135;
const MAX_THUMBS = 24;
const SKIP_SECONDS = 5;
const INTRO_MS = 90;
const OUTRO_SECONDS = 48;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function VideoPlayer({ src, title }: { src: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [pip, setPip] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const skipBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(end, video.currentTime + seconds));
  };

  const toggle = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch {
      setError("This file could not be played by the browser.");
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (typing || event.metaKey || event.ctrlKey) return;
      switch (event.key) {
        case " ": event.preventDefault(); void toggle(); break;
        case "f": case "F":
          event.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else void shellRef.current?.requestFullscreen().catch(() => undefined);
          break;
        case "m": case "M": {
          const video = videoRef.current; if (!video) break;
          const next = !video.muted; video.muted = next; setMuted(next); break;
        }
        case "ArrowRight": event.preventDefault(); skipBy(SKIP_SECONDS); break;
        case "ArrowLeft": event.preventDefault(); skipBy(-SKIP_SECONDS); break;
        case "?": setShowShortcuts((o) => !o); break;
        case "Escape": setShowShortcuts(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Frame extraction for seek preview (same as Mizwatch).
  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    setError(null);
    const grabber = document.createElement("video");
    grabber.src = src;
    grabber.muted = true;
    grabber.preload = "auto";
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH; canvas.height = THUMB_HEIGHT;
    const context = canvas.getContext("2d");
    const seek = (time: number) => new Promise<void>((resolve) => {
      const done = () => { grabber.removeEventListener("seeked", done); resolve(); };
      grabber.addEventListener("seeked", done, { once: true });
      grabber.currentTime = time;
    });
    const run = async () => {
      if (!context) return;
      await new Promise<void>((resolve) => {
        if (grabber.readyState >= 1) resolve();
        else grabber.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
      if (cancelled || !Number.isFinite(grabber.duration) || grabber.duration <= 0) return;
      const total = Math.min(MAX_THUMBS, Math.max(6, Math.round(grabber.duration / 25)));
      const step = grabber.duration / total;
      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        const time = Math.min(grabber.duration - 0.1, step * i + step / 2);
        try {
          await seek(time);
          context.drawImage(grabber, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
          const url = canvas.toDataURL("image/jpeg", 0.62);
          if (cancelled) return;
          setThumbs((c) => [...c, { time, url }]);
        } catch { /* fewer previews */ }
      }
    };
    void run();
    return () => { cancelled = true; grabber.removeAttribute("src"); grabber.load(); };
  }, [src]);

  const seekTo = (fraction: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(1, fraction)) * video.duration;
  };

  const hoverAt = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHover({ x: fraction * rect.width, time: fraction * duration });
  }, [duration]);

  const activeThumb = hover
    ? thumbs.reduce<Thumb | null>((best, t) => !best || Math.abs(t.time - hover.time) < Math.abs(best.time - hover.time) ? t : best, null)
    : null;

  return (
    <div ref={shellRef} className="group relative w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        src={src}
        title={title}
        className="aspect-video w-full"
        playsInline
        muted={muted}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("That video could not be decoded.")}
        onClick={() => void toggle()}
      />

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center text-sm text-white/80">{error}</div>
      )}

      {!playing && !error && (
        <button type="button" onClick={() => void toggle()} className="absolute inset-0 grid place-items-center" aria-label={`Play ${title}`}>
          <span className="grid size-16 place-items-center rounded-full bg-accent text-accentink shadow-2xl transition hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}

      {playing && !error && duration > INTRO_MS + 30 && current >= 8 && current < INTRO_MS && (
        <button type="button" className="absolute bottom-20 right-4 rounded-lg bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-xl hover:bg-black"
          onClick={() => { const v = videoRef.current; if (v) v.currentTime = INTRO_MS; }}>Skip intro »</button>
      )}
      {playing && !error && duration > OUTRO_SECONDS + 60 && duration - current <= OUTRO_SECONDS + 6 && duration - current > 4 && (
        <button type="button" className="absolute bottom-20 right-4 rounded-lg bg-black/80 px-3 py-2 text-xs font-semibold text-white shadow-xl hover:bg-black"
          onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, duration - 2.5); }}>Skip outro »</button>
      )}

      {showShortcuts && (
        <div role="dialog" aria-label="Keyboard shortcuts" className="absolute right-4 top-4 z-20 w-64 rounded-xl border border-white/20 bg-black/90 p-4 text-xs text-white/90 shadow-2xl">
          <p className="mb-2 flex items-center justify-between font-semibold">
            Keyboard shortcuts
            <button type="button" className="text-white/60 hover:text-white" onClick={() => setShowShortcuts(false)}>✕</button>
          </p>
          <ul className="space-y-1 text-[11px]">
            <li><code className="rounded bg-white/10 px-1">Space</code> play / pause</li>
            <li><code className="rounded bg-white/10 px-1">F</code> fullscreen</li>
            <li><code className="rounded bg-white/10 px-1">M</code> mute</li>
            <li><code className="rounded bg-white/10 px-1">← / →</code> skip {SKIP_SECONDS}s</li>
            <li><code className="rounded bg-white/10 px-1">?</code> this panel</li>
          </ul>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8">
        <div ref={barRef} role="slider" tabIndex={0} aria-label="Seek"
          aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(current)}
          className="relative h-1.5 w-full cursor-pointer rounded-full bg-white/25"
          onMouseMove={(e) => hoverAt(e.clientX)}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault(); e.stopPropagation();
            skipBy(e.key === "ArrowRight" ? SKIP_SECONDS : -SKIP_SECONDS);
          }}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${duration ? (current / duration) * 100 : 0}%` }} />
          {hover && (
            <div className="pointer-events-none absolute bottom-5 z-10 -translate-x-1/2" style={{ left: `${hover.x}px` }}>
              <div className="overflow-hidden rounded-lg border border-white/25 bg-black shadow-2xl">
                <div className="grid size-28 place-items-center bg-black text-[10px] text-white/60">
                  {activeThumb ? <img src={activeThumb.url} alt="" className="size-28 object-cover" /> : "…"}
                </div>
                <p className="bg-black/80 px-2 py-1 text-center text-[10px] font-semibold text-white">{formatTime(hover.time)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
          <button type="button" className="rounded px-2 py-1 font-semibold hover:bg-white/15" onClick={() => void toggle()}>{playing ? "Pause" : "Play"}</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" onClick={() => skipBy(-SKIP_SECONDS)}>-{SKIP_SECONDS}s</button>
          <span className="tabular-nums">{formatTime(current)} / {formatTime(duration)}</span>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" onClick={() => skipBy(SKIP_SECONDS)}>+{SKIP_SECONDS}s</button>
          <select aria-label="Playback speed" className="rounded border border-white/25 bg-black/50 px-1 py-0.5 text-[11px] text-white"
            value={speed}
            onChange={(e) => { const next = Number(e.target.value) || 1; setSpeed(next); if (videoRef.current) videoRef.current.playbackRate = next; }}>
            {SPEEDS.map((v) => <option key={v} value={v}>{v}x</option>)}
          </select>
          <button type="button" className="ml-auto rounded px-2 py-1 hover:bg-white/15"
            onClick={() => { const v = videoRef.current; if (!v) return; const next = !muted; v.muted = next; setMuted(next); }}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" title="Keyboard shortcuts (?)" onClick={() => setShowShortcuts((o) => !o)}>?</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" title="Picture in picture" disabled={!document.pictureInPictureEnabled}
            onClick={async () => { const v = videoRef.current; if (!v) return; try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); setPip(Boolean(document.pictureInPictureElement)); } catch { /* unsupported */ } }}>
            {pip ? "Exit PiP" : "PiP"}
          </button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" title="Fullscreen"
            onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void shellRef.current?.requestFullscreen().catch(() => undefined); }}>
            Fullscreen
          </button>
        </div>
      </div>
    </div>
  );
}
