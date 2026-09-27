import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { createCorrection } from './index.mjs';
import { normalizeYouTube } from '../assets/youtube.mjs';

const input = { name: 'Allan Haggett', year: 1997, video: 'https://www.youtube.com/watch?v=abcdefghijk', note: 'Better clip @someone <script>' };
const env = {
  GITHUB_OWNER: 'allankenneth', GITHUB_REPO: 'bigaddposse.com', GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'test',
  ALLOWED_ORIGINS: 'https://bigaddposse.com', SUBMISSIONS_ENABLED: 'true',
  SUBMISSION_LIMIT: { limit: async () => ({ success: true }) }, TOTAL_LIMIT: { limit: async () => ({ success: true }) }
};
const members = [{ name: 'Allan Haggett', year: 1997, nickname: 'Ünicode', video: 'https://youtu.be/01234567890' }, { name: 'Other', year: 1992, video: null }];
const content = Buffer.from(JSON.stringify(members, null, 2) + '\n').toString('base64');
const request = (data = input, extra = {}) => new Request('https://worker.example/corrections', { method: 'POST', headers: { Origin: 'https://bigaddposse.com', 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...extra });

test('YouTube normalization accepts known formats and rejects malicious/invalid hosts', () => {
  for (const link of ['https://youtu.be/abcdefghijk?t=3', 'https://m.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://www.youtube.com/live/abcdefghijk']) assert.equal(normalizeYouTube(link), input.video);
  for (const link of ['https://youtube.com.evil.test/watch?v=abcdefghijk', 'javascript:alert(1)', 'https://evil.test/abcdefghijk', 'https://youtube.com/watch?v=x', 'https://user@youtube.com/watch?v=abcdefghijk', 'https://youtube.com:444/watch?v=abcdefghijk']) assert.equal(normalizeYouTube(link), null);
});

test('rejects invalid origin, invalid data, oversized body, disabled submissions and rate limits before GitHub', async () => {
  assert.equal((await worker.fetch(request(input, { headers: { Origin: 'https://evil.test' } }), env)).status, 403);
  assert.equal((await worker.fetch(request({ ...input, video: 'https://evil.test' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...input, website: 'bot' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...input, note: 'x'.repeat(5000) }), env)).status, 413);
  assert.equal((await worker.fetch(request(), { ...env, SUBMISSIONS_ENABLED: 'false' })).status, 503);
  const limited = await worker.fetch(request(), { ...env, SUBMISSION_LIMIT: { limit: async () => ({ success: false }) } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Access-Control-Allow-Origin'), 'https://bigaddposse.com');
});

function mockGithub({ duplicate = false, branchExists = false, failPR = false } = {}) {
  const writes = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body && JSON.parse(init.body);
    if (init.method !== 'GET') writes.push({ path, body });
    let result;
    if (path.endsWith('/git/ref/heads/main')) result = { object: { sha: 'base-sha' } };
    else if (path.endsWith('/contents/members.json') && init.method === 'GET') result = { sha: 'file-sha', content };
    else if (path.endsWith('/pulls') && init.method === 'GET') result = duplicate ? [{ html_url: 'https://github.com/allankenneth/bigaddposse.com/pull/1', state: 'open' }] : [];
    else if (path.endsWith('/git/refs') && branchExists) return new Response('{}', { status: 422 });
    else if (path.endsWith('/pulls') && failPR) return new Response('{}', { status: 500 });
    else result = path.endsWith('/pulls') ? { html_url: 'https://github.com/allankenneth/bigaddposse.com/pull/2' } : {};
    return Response.json(result);
  };
  return { fetcher, writes };
}

test('creates PR changing only selected video, preserves unicode, anchors branch to read commit', async () => {
  const mock = mockGithub();
  const result = await createCorrection(input, env, mock.fetcher);
  assert.equal(result.duplicate, false);
  assert.equal(mock.writes[0].body.sha, 'base-sha');
  const update = mock.writes.find(write => write.path.endsWith('/contents/members.json'));
  const updated = JSON.parse(Buffer.from(update.body.content, 'base64').toString());
  assert.deepEqual(updated, [{ ...members[0], video: input.video }, members[1]]);
  assert.notEqual(update.body.branch, 'main');
  const pr = mock.writes.at(-1).body;
  assert.equal(pr.base, 'main');
  assert.ok(pr.body.includes('&lt;script&gt;'));
  assert.ok(!pr.body.includes('@someone'));
});

test('duplicate requests return existing PR without writing', async () => {
  const mock = mockGithub({ duplicate: true });
  assert.equal((await createCorrection(input, env, mock.fetcher)).duplicate, true);
  assert.equal(mock.writes.length, 0);
});

test('retry recovers a branch left behind by a failed commit', async () => {
  const mock = mockGithub({ branchExists: true });
  assert.equal((await createCorrection(input, env, mock.fetcher)).duplicate, false);
  assert.ok(mock.writes.some(write => write.path.endsWith('/contents/members.json')));
});

test('unknown players and unchanged videos never write; upstream failure is not reported as success', async () => {
  const mock = mockGithub();
  await assert.rejects(createCorrection({ ...input, name: 'Unknown' }, env, mock.fetcher), /Player not found/);
  await assert.rejects(createCorrection({ ...input, video: 'https://www.youtube.com/watch?v=01234567890' }, env, mock.fetcher), /already assigned/);
  assert.equal(mock.writes.length, 0);
  await assert.rejects(createCorrection(input, env, mockGithub({ failPR: true }).fetcher), /GitHub request failed/);
});
