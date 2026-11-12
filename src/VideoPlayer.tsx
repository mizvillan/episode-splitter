import { useRef, useState } from "react";

const SKIP_SECONDS = 5;
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const ICON = "h-5 w-5 fill-current";
const PlayIcon = () => <svg viewBox="0 0 24 24" className={ICON}><path d="M8 5v14l11-7z" /></svg>;
const PauseIcon = () => <svg viewBox="0 0 24 24" className={ICON}><path d="M6 19h4V5H6zm8-14v14h4V5z" /></svg>;
const VolIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" className={ICON}>
    <path d="M3 9v6h4l5 5V4L7 9z" />
    {off ? <path d="M16 9l6 6m0-6l-6 6" stroke="currentColor" strokeWidth="2" fill="none" /> : <path d="M16 8a5 5 0 010 8" stroke="currentColor" strokeWidth="2" fill="none" />}
  </svg>
);
const FsIcon = () => <svg viewBox="0 0 24 24" className={ICON}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2" fill="none" /></svg>;

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
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const skipBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.max(0, Math.min(end, video.currentTime + seconds));
  };

  const seekFromClick = (clientX: number, rect: DOMRect) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = fraction * video.duration;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen().catch(() => undefined);
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* PiP unsupported or rejected */
    }
  };

  return (
    <div ref={shellRef} className="group relative w-full bg-black">
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
        onClick={toggle}
      />

      {!playing && (
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-0 grid place-items-center"
          aria-label={`Play ${title}`}
        >
          <span className="grid size-16 place-items-center rounded-full bg-indigo-600 text-white shadow-2xl transition hover:scale-105">
            ▶
          </span>
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          className="group/seek relative h-1.5 w-full cursor-pointer rounded-full bg-white/25 hover:h-2.5 transition-all"
          onClick={(e) => seekFromClick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") skipBy(SKIP_SECONDS);
            if (e.key === "ArrowLeft") skipBy(-SKIP_SECONDS);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-indigo-500 transition-[width] duration-100"
            style={{ width: `${duration ? (current / duration) * 100 : 0}%` }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/90">
          <button type="button" aria-label={playing ? "Pause" : "Play"} className="rounded-full p-1.5 hover:bg-white/15" onClick={toggle}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/15" onClick={() => skipBy(-SKIP_SECONDS)}>
            -{SKIP_SECONDS}s
          </button>
          <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/15" onClick={() => skipBy(SKIP_SECONDS)}>
            +{SKIP_SECONDS}s
          </button>
          <span className="tabular-nums text-xs text-white/70">
            {formatTime(current)} / {formatTime(duration)}
          </span>
          <select
            aria-label="Playback speed"
            className="rounded-md border border-white/20 bg-black/60 px-1.5 py-1 text-xs text-white"
            value={speed}
            onChange={(e) => {
              const next = Number(e.target.value) || 1;
              setSpeed(next);
              if (videoRef.current) videoRef.current.playbackRate = next;
            }}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            className="ml-auto rounded-full p-1.5 hover:bg-white/15"
            onClick={() => {
              const next = !muted;
              if (videoRef.current) videoRef.current.muted = next;
              setMuted(next);
            }}
          >
            <VolIcon off={muted} />
          </button>
          <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/15" onClick={() => void togglePip()}>
            PiP
          </button>
          <button type="button" aria-label="Fullscreen" className="rounded-full p-1.5 hover:bg-white/15" onClick={toggleFullscreen}>
            <FsIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
