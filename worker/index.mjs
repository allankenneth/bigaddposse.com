import { normalizeVideoUrl } from '../assets/video-url.mjs';

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// A CAPTCHA provider can be added here without changing the GitHub submission flow.
async function checkSubmission(request, env) {
  if (env.SUBMISSIONS_ENABLED !== 'true') throw new RequestError(503, 'Submissions are paused. Please use email.');
  if (!env.GITHUB_TOKEN || !env.SUBMISSION_LIMIT || !env.TOTAL_LIMIT) throw new Error('Missing configuration');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const perVisitor = await env.SUBMISSION_LIMIT.limit({ key: ip });
  const overall = await env.TOTAL_LIMIT.limit({ key: 'submissions' });
  if (!perVisitor.success || !overall.success) throw new RequestError(429, 'Too many requests. Please wait a minute and try again.');
}

async function readInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new RequestError(415, 'Use JSON.');
  // Bound the actual stream, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Missing form data.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new RequestError(413, 'Submission is too long.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RequestError(400, 'Invalid form data.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestError(400, 'Invalid form data.');
  if (data.website) throw new RequestError(400, 'Unable to accept this submission.');
  const video = typeof data.video === 'string' && normalizeVideoUrl(data.video);
  if (!video) throw new RequestError(400, 'Enter a valid HTTP or HTTPS video link.');
  if (typeof data.name !== 'string' || data.name.length > 150 || !Number.isInteger(data.year)) throw new RequestError(400, 'Invalid player.');
  if (data.note !== undefined && (typeof data.note !== 'string' || data.note.length > 500)) throw new RequestError(400, 'Keep the explanation under 500 characters.');
  return { name: data.name, year: data.year, video, note: data.note || '' };
}

function decodeContent(content) {
  return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
function encodeContent(content) {
  return btoa(Array.from(new TextEncoder().encode(content), byte => String.fromCharCode(byte)).join(''));
}

export async function createCorrection(data, env, fetcher = fetch) {
  const repo = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  async function github(path, method = 'GET', body) {
    const response = await fetcher('https://api.github.com' + repo + path, {
      method,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'bap-video-corrections', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const error = new Error('GitHub request failed');
      error.githubStatus = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  const base = env.GITHUB_BRANCH;
  const ref = await github('/git/ref/heads/' + encodeURIComponent(base));
  // Read at the exact commit the new branch will start from.
  const file = await github('/contents/members.json?ref=' + ref.object.sha);
  const source = decodeContent(file.content);
  const members = JSON.parse(source);
  const matches = members.filter(member => member.name === data.name && member.year === data.year);
  if (matches.length !== 1) throw new RequestError(400, 'Player not found. Refresh the page and try again.');
  const member = matches[0];
  if (normalizeVideoUrl(member.video) === data.video) throw new RequestError(409, 'That video is already assigned to this player.');
  const previous = member.video;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([data.name, data.year, previous, data.video])));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const branch = 'video-correction/' + hash.slice(0, 32);
  const findPR = async () => (await github('/pulls?state=all&head=' + encodeURIComponent(env.GITHUB_OWNER + ':' + branch) + '&base=' + encodeURIComponent(base)))[0];
  const existing = await findPR();
  if (existing) return { url: existing.html_url, duplicate: true, closed: existing.state === 'closed' };
  let newBranch = true;
  try { await github('/git/refs', 'POST', { ref: 'refs/heads/' + branch, sha: ref.object.sha }); }
  catch (error) { if (error.githubStatus !== 422) throw error; newBranch = false; }
  member.video = data.video;
  // Preserve original formatting; members.json uses two-space indentation.
  const content = JSON.stringify(members, null, 2) + (source.endsWith('\n') ? '\n' : '');
  if (newBranch) {
    await github('/contents/members.json', 'PUT', { message: `Suggest video for ${data.name}`, content: encodeContent(content), sha: file.sha, branch });
  } else {
    // A retry may find a branch whose commit or PR creation failed.
    const pending = await github('/contents/members.json?ref=' + encodeURIComponent(branch));
    const pendingSource = decodeContent(pending.content);
    if (pendingSource !== content) {
      if (pendingSource !== source) throw new RequestError(409, 'This correction is being processed. Please try again shortly.');
      await github('/contents/members.json', 'PUT', { message: `Suggest video for ${data.name}`, content: encodeContent(content), sha: pending.sha, branch });
    }
  }
  // Quote visitor text as plain text; neutralize mentions and HTML/Markdown formatting.
  const plain = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '@\u200b');
  const body = `Anonymous video correction for **${data.name}** (${data.year}).\n\nCurrent video: ${previous || '(none)'}\n\nSuggested video: ${data.video}\n\nVisitor explanation:\n<pre>${plain(data.note || '(none)')}</pre>\n\nSubmitted without a visitor account. Please verify the video before merging. Only members.json is changed.`;
  try {
    const pr = await github('/pulls', 'POST', { title: `Video correction: ${data.name}`, head: branch, base, body });
    return { url: pr.html_url, duplicate: false };
  } catch (error) {
    if (error.githubStatus === 422) { const pr = await findPR(); if (pr) return { url: pr.html_url, duplicate: true, closed: pr.state === 'closed' }; }
    throw error;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (!origin || !allowed.includes(origin)) return reply(403, { error: 'Origin not allowed.' });
    headers['Access-Control-Allow-Origin'] = origin;
    if (new URL(request.url).pathname !== '/corrections') return reply(404, { error: 'Not found.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' });
    try {
      const data = await readInput(request);
      await checkSubmission(request, env);
      return reply(200, await createCorrection(data, env));
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { error: error.message });
      // Never log visitor data or credentials, or expose upstream error bodies.
      console.error('Correction failed', error.githubStatus || 'internal');
      return reply(503, { error: 'Unable to submit right now. Please try again or use email.' });
    }
  }
};
