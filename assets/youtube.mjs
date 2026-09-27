export function normalizeYouTube(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.replace(/^www\./, '');
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? 'https://www.youtube.com/watch?v=' + id : null;
  } catch { return null; }
}
