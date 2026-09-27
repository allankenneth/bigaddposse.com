export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function githubClient(env, fetcher = fetch) {
  const repo = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  return async function github(path, method = 'GET', body) {
    const response = await fetcher('https://api.github.com' + repo + path, {
      method,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'bap-submissions', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const error = new Error('GitHub request failed');
      error.githubStatus = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  };
}
export function decodeContent(content) {
  return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
export function encodeContent(content) {
  return btoa(Array.from(new TextEncoder().encode(content), byte => String.fromCharCode(byte)).join(''));
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export const plain = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '@\u200b');
