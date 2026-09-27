import { normalizeVideoUrl } from './video-url.mjs';
const dialog = document.getElementById('new-member-dialog');
const open = document.getElementById('new-member-open');
const close = document.getElementById('new-member-close');
const gate = document.getElementById('member-code-form');
const codeInput = document.getElementById('member-code');
const form = document.getElementById('new-member-form');
const status = document.getElementById('member-status');
const unlock = document.getElementById('member-unlock');
const submit = document.getElementById('member-submit');
const photo = document.getElementById('member-photo');
const preview = document.getElementById('member-photo-preview');
const year = document.getElementById('member-year');
const video = document.getElementById('member-video');
const api = window.BAP_CORRECTIONS_ENDPOINT ? new URL(window.BAP_CORRECTIONS_ENDPOINT).origin : '';
let code = '';
let photoData = null;
let photoSequence = 0;
let controller;

function reset() {
  controller?.abort();
  code = '';
  gate.reset();
  form.reset();
  gate.hidden = false;
  form.hidden = true;
  year.max = String(new Date().getFullYear());
  year.value = year.max;
  photoData = null;
  photoSequence++;
  preview.hidden = true;
  preview.removeAttribute('src');
  photo.setCustomValidity('');
  video.setCustomValidity('');
  unlock.disabled = false;
  submit.disabled = false;
  status.textContent = '';
}
open.addEventListener('click', () => {
  reset();
  dialog.showModal();
  if (!api) { status.textContent = 'New member submissions are not available yet.'; unlock.disabled = true; }
  codeInput.focus();
});
close.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { reset(); open.focus(); });

async function post(path, data) {
  controller?.abort();
  const current = new AbortController();
  controller = current;
  const timer = setTimeout(() => current.abort('timeout'), 90000);
  try {
    const response = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: current.signal });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'Unable to submit right now.');
      error.status = response.status;
      throw error;
    }
    return result;
  } catch (error) {
    if (current.signal.aborted && current.signal.reason !== 'timeout') return null;
    if (current.signal.aborted || error instanceof TypeError) throw new Error('Could not confirm the request. Please try again; duplicate submissions reuse the same review request.');
    throw error;
  } finally { clearTimeout(timer); }
}

gate.addEventListener('submit', async event => {
  event.preventDefault();
  if (!gate.reportValidity() || !api) return;
  unlock.disabled = true;
  status.textContent = 'Checking code…';
  const entered = codeInput.value;
  try {
    const result = await post('/members/unlock', { code: entered });
    if (!result || !dialog.open) return;
    code = entered;
    codeInput.value = '';
    gate.hidden = true;
    form.hidden = false;
    status.textContent = '';
    document.getElementById('member-name').focus();
  } catch (error) { status.textContent = error.message; }
  finally { unlock.disabled = false; }
});

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP photo under 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Re-encoding also removes original metadata and gives the server one format.
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < 1000000) return data;
    }
    throw new Error('This photo is still too large. Please choose a smaller image.');
  } finally { bitmap.close(); }
}
photo.addEventListener('change', async () => {
  const sequence = ++photoSequence;
  photoData = null;
  photo.setCustomValidity('');
  preview.hidden = true;
  preview.removeAttribute('src');
  if (!photo.files[0]) { submit.disabled = false; status.textContent = ''; return; }
  submit.disabled = true;
  status.textContent = 'Preparing photo…';
  try {
    const data = await preparePhoto(photo.files[0]);
    if (sequence !== photoSequence) return;
    photo.setCustomValidity('');
    photoData = data.split(',')[1];
    preview.src = data;
    preview.hidden = false;
    status.textContent = 'Photo ready.';
  } catch (error) {
    if (sequence !== photoSequence) return;
    const message = error.message || 'Unable to read this photo.';
    photo.setCustomValidity(message);
    status.textContent = message;
  } finally { if (sequence === photoSequence) submit.disabled = false; }
});
video.addEventListener('input', () => video.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const normalized = video.value ? normalizeVideoUrl(video.value) : null;
  video.setCustomValidity(video.value && !normalized ? 'Enter a valid HTTP or HTTPS video link.' : '');
  if (photo.files.length && !photoData) photo.setCustomValidity('Please wait for the photo to finish preparing, or choose it again.');
  if (!form.reportValidity() || submit.disabled) return;
  submit.disabled = true;
  status.textContent = 'Submitting the new member for review…';
  try {
    const result = await post('/members', {
      code, name: document.getElementById('member-name').value,
      nickname: document.getElementById('member-nickname').value,
      year: Number(year.value), photo: photoData, video: normalized || '',
      note: document.getElementById('member-note').value,
      website: document.getElementById('member-website').value
    });
    if (!result || !dialog.open) return;
    const url = new URL(result.url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/allankenneth/bigaddposse.com/pull/')) throw new Error('Unexpected response. Please try again.');
    code = '';
    form.hidden = true;
    status.textContent = result.closed ? 'This member submission was already reviewed. ' : result.duplicate ? 'This member already has a submission awaiting review. ' : 'Thanks! The new member has been submitted for review. ';
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View the request';
    status.append(link);
    link.focus();
  } catch (error) {
    if (error.status === 403) { code = ''; gate.hidden = false; form.hidden = true; codeInput.focus(); }
    status.textContent = error.message;
  } finally { submit.disabled = false; }
});
