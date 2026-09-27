import { normalizeVideoUrl } from '../assets/video-url.mjs';
import { RequestError, githubClient, decodeContent, digest, plain } from './common.mjs';

export async function verifyMemberCode(code, request, env) {
  if (!env.MEMBER_AUTH_LIMIT || !env.MEMBER_AUTH_TOTAL) throw new Error('Missing member rate limit configuration');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const visitor = await env.MEMBER_AUTH_LIMIT.limit({ key: ip });
  const overall = await env.MEMBER_AUTH_TOTAL.limit({ key: 'member-auth' });
  if (!visitor.success || !overall.success) throw new RequestError(429, 'Too many code attempts. Please wait a minute and try again.');
  let hashes;
  try { hashes = JSON.parse(env.MEMBER_SUBMITTER_CODE_HASHES || '[]'); } catch { throw new Error('Invalid code configuration'); }
  if (!Array.isArray(hashes) || hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid code configuration');
  if (!hashes.length) throw new RequestError(403, 'New member submissions are paused. Please contact the site owner.');
  if (typeof code !== 'string' || !code.length || code.length > 256) throw new RequestError(403, 'That submitter code is not valid.');
  const actual = await digest(code);
  // Compare all hashes without exiting at the first mismatched character.
  let accepted = 0;
  for (const expected of hashes) {
    let difference = 0;
    for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    accepted |= Number(difference === 0);
  }
  if (!accepted) throw new RequestError(403, 'That submitter code is not valid or has been revoked.');
}

function field(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new RequestError(400, `${label} is invalid or too long.`);
  const text = value.trim().normalize('NFC');
  if (required && !text) throw new RequestError(400, `${label} is required.`);
  return text;
}

export function validatePhoto(base64) {
  if (!base64) return null;
  if (typeof base64 !== 'string' || base64.length > 1000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new RequestError(400, 'Please choose a smaller photo.');
  let data;
  try { data = atob(base64); } catch { throw new RequestError(400, 'Invalid photo.'); }
  const byte = index => data.charCodeAt(index);
  if (byte(0) !== 255 || byte(1) !== 216 || byte(data.length - 2) !== 255 || byte(data.length - 1) !== 217) throw new RequestError(400, 'The photo must be a JPEG image.');
  // Read JPEG frame dimensions without executing a decoder or fetching a URL.
  let offset = 2;
  while (offset + 4 < data.length) {
    if (byte(offset++) !== 255) break;
    while (byte(offset) === 255) offset++;
    const marker = byte(offset++);
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = (byte(offset) << 8) | byte(offset + 1);
    if (length < 2 || offset + length > data.length) break;
    if ([192, 193, 194].includes(marker) && length >= 8) {
      const height = (byte(offset + 3) << 8) | byte(offset + 4);
      const width = (byte(offset + 5) << 8) | byte(offset + 6);
      if (width > 0 && height > 0 && width <= 1200 && height <= 1200) return base64;
      throw new RequestError(400, 'Photo dimensions must not exceed 1200 pixels.');
    }
    offset += length;
  }
  throw new RequestError(400, 'The photo is not a supported JPEG image.');
}

export function validateMember(input) {
  const name = field(input.name, 'Name', 150, true);
  const nickname = field(input.nickname, 'Nickname', 100);
  const year = input.year;
  if (!Number.isInteger(year) || year < 1992 || year > new Date().getUTCFullYear()) throw new RequestError(400, 'Choose an induction year between 1992 and the current year.');
  const rawVideo = field(input.video, 'Video link', 2048);
  const video = rawVideo ? normalizeVideoUrl(rawVideo) : null;
  if (rawVideo && !video) throw new RequestError(400, 'Enter a valid HTTP or HTTPS video link.');
  if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000)) throw new RequestError(400, 'Keep the review note under 1000 characters.');
  return { name, nickname, year, video, photo: validatePhoto(input.photo), note: input.note?.trim() || '' };
}
const identity = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export async function createMember(data, env, fetcher = fetch) {
  const github = githubClient(env, fetcher);
  const base = env.GITHUB_BRANCH;
  const ref = await github('/git/ref/heads/' + encodeURIComponent(base));
  const file = await github('/contents/members.json?ref=' + ref.object.sha);
  const members = JSON.parse(decodeContent(file.content));
  if (members.some(member => identity(member.name) === identity(data.name))) throw new RequestError(409, 'That member is already on the roster.');
  // One review thread per person/year, even if a retry uses a different photo.
  const key = (await digest(JSON.stringify([identity(data.name), data.year]))).slice(0, 32);
  const branch = 'new-member/' + key;
  const findPR = async () => (await github('/pulls?state=all&head=' + encodeURIComponent(env.GITHUB_OWNER + ':' + branch) + '&base=' + encodeURIComponent(base)))[0];
  const existing = await findPR();
  if (existing) return { url: existing.html_url, duplicate: true, closed: existing.state === 'closed' };
  // Upload the photo and members.json as one commit, so no partial member can be merged.
  const photoPath = data.photo ? `img/new-member-${key}.jpg` : 'img/profile.jpg';
  const member = { name: data.name, nickname: data.nickname, year: data.year, photo: photoPath, video: data.video };
  const insertion = members.findIndex(item => item.year > data.year || (item.year === data.year && item.name.localeCompare(data.name, 'en') > 0));
  members.splice(insertion < 0 ? members.length : insertion, 0, member);
  const treeEntries = [{ path: 'members.json', mode: '100644', type: 'blob', content: JSON.stringify(members, null, 2) + '\n' }];
  if (data.photo) {
    const blob = await github('/git/blobs', 'POST', { encoding: 'base64', content: data.photo });
    treeEntries.push({ path: photoPath, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const parent = await github('/git/commits/' + ref.object.sha);
  const tree = await github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: treeEntries });
  const commit = await github('/git/commits', 'POST', { message: `Suggest new BAP member: ${data.name}`, tree: tree.sha, parents: [ref.object.sha] });
  let submittedMember = member;
  let recovered = false;
  try { await github('/git/refs', 'POST', { ref: 'refs/heads/' + branch, sha: commit.sha }); }
  catch (error) {
    if (error.githubStatus !== 422) throw error;
    // A concurrent request or failed PR creation may already have a complete
    // branch. Never overwrite it; open/reuse its original review request.
    const pendingRef = await github('/git/ref/heads/' + encodeURIComponent(branch));
    const pendingFile = await github('/contents/members.json?ref=' + pendingRef.object.sha);
    submittedMember = JSON.parse(decodeContent(pendingFile.content)).find(item => identity(item.name) === identity(data.name) && item.year === data.year);
    if (!submittedMember) throw new RequestError(409, 'A pending submission needs review before retrying.');
    recovered = true;
  }
  const body = `New BAP member submitted with a valid community code.\n\nName: <pre>${plain(submittedMember.name)}</pre>\nInduction year: ${data.year}\nNickname: <pre>${plain(submittedMember.nickname || '(none)')}</pre>\nVideo: <pre>${plain(submittedMember.video || '(none)')}</pre>\nPhoto: ${submittedMember.photo === 'img/profile.jpg' ? 'Default placeholder.' : 'Photo included in this PR.'}\n\nReview note:\n<pre>${plain(recovered ? 'Recovered a previously submitted member. Please review the committed details.' : data.note || '(none)')}</pre>\n\nPlease verify membership, induction year, photo, and video before merging. The submitter code is never included in this PR. Merging publishes the member through GitHub Pages.`;
  try {
    const pr = await github('/pulls', 'POST', { title: `New BAP member: ${data.name}`, head: branch, base, body });
    return { url: pr.html_url, duplicate: false };
  } catch (error) {
    if (error.githubStatus === 422) { const pr = await findPR(); if (pr) return { url: pr.html_url, duplicate: true, closed: pr.state === 'closed' }; }
    throw error;
  }
}
