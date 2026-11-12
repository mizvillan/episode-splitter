# Episode Splitter

Split a long `.mp4` / `.mkv` into episode-sized parts **entirely in your browser**.
Nothing is uploaded — FFmpeg (WASM) runs locally and the source file is read
in place via WORKERFS, so 1–2 GB files are never copied into memory.

## Live site

Hosted on GitHub Pages: <https://mizvillan.github.io/episode-splitter/>

The site is just the app — your videos and library stay in your own browser's
IndexedDB. Nothing you split is ever sent to GitHub or anywhere else.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL (default <http://127.0.0.1:5173/>).

## Use

1. **Split** — drop a video (or click to pick one), set segment length in
   minutes (decimals work, e.g. `0.1` for a short test clip), hit
   **Split into Episodes**. Each part is cut with stream copy (`-c copy`,
   no re-encode), so it is fast and lossless. Parts are named
   `Episode_01.mp4`, `Episode_02.mp4`, … and the progress bar moves steadily
   across all parts. Right after a split you can also **lock the show with a
   code** (optional).
2. **Home** — one card per source show (poster grabbed from the first part).
   Click a show to open its watch page: the full player on top and the
   episode list below it.
3. Episodes are saved in browser IndexedDB, so they survive a refresh.
   Use the ✕ on an episode to delete it, or Download to save the file.

## Access codes (per-show locks)

Any show can be locked with an access code — from **Home → Access codes**, or
right after a split. A locked show shows a `LOCKED` badge and asks for the
code before it opens; only people you share the code with can get in.

- Codes are stored as SHA-256 hashes in the same IndexedDB as your library,
  on the device only. Unlocks are kept in memory, so refreshing the page
  re-locks everything.
- Because videos are never uploaded, a code unlocks a show on a device that
  already has its episodes. To give someone access on their own device, send
  them the episode files (Download) plus the code; they add the files to
  their library and enter the code.
- This is client-side UI gating, not server security — anyone with the code
  gets in, and it's meant for personal sharing, not DRM.

## Player

Mizwatch-style player: accent play button, seek bar with thumbnail previews,
keyboard shortcuts (`Space` play/pause, `F` fullscreen, `M` mute,
`←`/`→` ±5s, `?` help), ±5s skips, speed 0.75–2x, mute, PiP, fullscreen,
and Skip intro / Skip outro buttons on long episodes.

## Tech

- Vite + React + TypeScript + Tailwind CSS v4
- `@ffmpeg/ffmpeg` / `@ffmpeg/util` (core from unpkg, single-thread — no
  SharedArrayBuffer needed)
- UI tokens and card/chip/button styles copied from Mizwatch
- Hosted via GitHub Pages (`gh-pages` branch, relative asset base)

## Notes

- First split downloads ~30 MB of FFmpeg core, then it works offline.
- Delete browser site data to clear the saved library (episodes and codes).
