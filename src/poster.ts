/** Grab a 2:3 poster frame from a video blob, Mizwatch-thumb style. */
export async function grabPoster(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("poster timeout")), 8000);
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("poster load")); };
    });
    const duration = video.duration || 0;
    const at = duration > 4 ? Math.min(2, duration / 4) : 0.1;
    await new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done, { once: true });
      video.currentTime = at;
    });
    if (!video.videoWidth) return null;
    const W = 320, H = 480;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // object-cover crop to 2:3
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
