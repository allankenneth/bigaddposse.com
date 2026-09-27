import { normalizeYouTube } from './youtube.mjs';
const modal = document.getElementById('video-modal');
const details = document.getElementById('video-correction');
const form = document.getElementById('correction-form');
const video = document.getElementById('correction-video');
const note = document.getElementById('correction-note');
const status = document.getElementById('correction-status');
const submit = document.getElementById('correction-submit');
const email = document.getElementById('correction-email');
const endpoint = window.BAP_CORRECTIONS_ENDPOINT;
let player;
let controller;
function updateEmail() {
  const body = 'Update ' + player.name + ' (' + player.year + ') video to ' + (normalizeYouTube(video.value) || video.value || '[paste YouTube link here]') + '\n\nCurrent video: ' + player.current + '\n\n' + note.value;
  email.href = 'mailto:hi@allankenneth.com?subject=' + encodeURIComponent('BAP Video Update: ' + player.name) + '&body=' + encodeURIComponent(body);
}
modal.addEventListener('playerchange', event => {
  controller?.abort();
  const card = event.detail;
  player = { name: card.querySelector('.member-name').textContent, year: Number(card.dataset.memberYear), current: card.dataset.videoUrl };
  form.reset();
  details.open = false;
  document.getElementById('correction-player').textContent = player.name;
  status.textContent = endpoint ? '' : 'Online submissions are being set up. You can send this suggestion by email.';
  submit.hidden = !endpoint;
  submit.disabled = false;
  updateEmail();
});
modal.addEventListener('playerclose', () => controller?.abort());
form.addEventListener('input', () => { video.setCustomValidity(''); updateEmail(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const normalized = normalizeYouTube(video.value);
  video.setCustomValidity(normalized ? '' : 'Please enter a valid YouTube video link.');
  if (!form.reportValidity() || !endpoint) return;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  const timeout = setTimeout(() => requestController.abort('timeout'), 60000);
  submit.disabled = true;
  status.textContent = 'Submitting your suggestion…';
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: requestController.signal,
      body: JSON.stringify({ name: player.name, year: player.year, video: normalized, note: note.value, website: document.getElementById('correction-website').value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to submit.');
    const url = new URL(result.url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/allankenneth/bigaddposse.com/pull/')) throw new Error('Unexpected submission response.');
    status.textContent = result.closed ? 'This suggestion was already reviewed. ' : result.duplicate ? 'This suggestion is already awaiting review. ' : 'Thanks! Your suggestion is awaiting review. ';
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = 'View the request';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    status.append(link);
  } catch (error) {
    if (!requestController.signal.aborted || requestController.signal.reason === 'timeout') {
      status.textContent = (error.name === 'TypeError' || requestController.signal.aborted ? 'Could not confirm submission. Please retry or use email.' : error.message + ' You can also send by email.');
    }
  } finally {
    clearTimeout(timeout);
    if (controller === requestController) submit.disabled = false;
  }
});
// Keep keyboard focus within the open dialog, including the new form controls.
modal.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const focusable = [...modal.querySelectorAll('button, iframe, summary, input, textarea, a[href]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
