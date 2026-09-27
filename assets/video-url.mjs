import { normalizeYouTube } from './youtube.mjs';

// Validate links without fetching them. Playback availability is checked during review.
export function normalizeVideoUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    // Keep the existing YouTube duplicate handling; preserve other hosts' paths,
    // query strings (including signed URLs), ports, and fragments.
    return normalizeYouTube(url.href) || url.href;
  } catch { return null; }
}

export function isDirectVideo(value) {
  try { return /\.(mp4|webm|ogv|ogg|m4v|mov)$/i.test(new URL(value).pathname); }
  catch { return false; }
}
