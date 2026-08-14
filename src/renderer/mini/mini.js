'use strict';

const api = window.mora;

const els = {
  title: document.getElementById('miniTitle'),
  platform: document.getElementById('platform'),
  url: document.getElementById('url'),
  vtitle: document.getElementById('vtitle'),
  countdown: document.getElementById('countdown'),
  buttons: document.getElementById('buttons'),
  btnMp3: document.getElementById('btnMp3'),
  btnVideo: document.getElementById('btnVideo'),
  btnIgnore: document.getElementById('btnIgnore'),
  progress: document.getElementById('progress'),
  ringWrap: document.getElementById('ringWrap'),
  pstatus: document.getElementById('pstatus'),
};

let lang = 'es';
let data = null;
let myId = null;
let countdownTimer = null;
let countdownValue = 5;
let chose = false;

function t(key, params) {
  const dict = window.I18N[lang] || window.I18N.es;
  let s = dict[key] || window.I18N.es[key] || key;
  if (params) for (const k of Object.keys(params)) s = s.split(`{${k}}`).join(params[k]);
  return s;
}

function platformName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('youtube') || host === 'youtu.be') return 'YouTube';
    if (host.includes('facebook') || host.startsWith('fb.')) return 'Facebook';
    if (host.includes('instagram')) return 'Instagram';
    if (host === 'tiktok.com') return 'TikTok';
    if (host === 'x.com' || host === 'twitter.com') return 'X / Twitter';
    if (host === 'twitch.tv') return 'Twitch';
    if (host === 'vimeo.com') return 'Vimeo';
    if (host === 'dailymotion.com') return 'Dailymotion';
    return host || 'Web';
  } catch {
    return 'Web';
  }
}

function setup(d) {
  data = d;
  lang = d.language || 'es';
  els.title.textContent = d.initial ? t('tInitialLink') : t('tNewLink');
  els.url.textContent = d.url;
  els.url.title = d.url;
  els.platform.textContent = platformName(d.url);
  if (d.lastFormat === 'video') {
    els.btnVideo.classList.add('hl');
  } else {
    els.btnMp3.classList.add('hl');
  }
  if (d.initial) {
    startCountdown();
  }
}

function startCountdown() {
  countdownValue = 5;
  els.countdown.textContent = t('tAutostartCountdown', { s: countdownValue });
  countdownTimer = setInterval(() => {
    countdownValue -= 1;
    if (countdownValue <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      choose(data.lastFormat || 'mp3');
    } else {
      els.countdown.textContent = t('tAutostartCountdown', { s: countdownValue });
    }
  }, 1000);
}

function cancelCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  els.countdown.textContent = '';
}

function choose(format) {
  if (chose) return;
  chose = true;
  cancelCountdown();
  els.buttons.classList.add('hidden');
  els.progress.classList.remove('hidden');
  els.pstatus.textContent = t('tDownloading');
  api.send('mini:choose', format);
}

function ignore() {
  cancelCountdown();
  api.send('mini:ignore');
}

function ringSVG(pct) {
  const c = 2 * Math.PI * 18;
  const off = c * (1 - Math.max(0, Math.min(100, pct || 0)) / 100);
  return `
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle class="ring-bg" cx="20" cy="20" r="18"></circle>
      <circle class="ring-fg" cx="20" cy="20" r="18" stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
    </svg>`;
}

function handleToast(msg) {
  if (!msg || !data) return;
  if (msg.kind === 'started') {
    if (msg.url === data.url) myId = msg.id;
  }
  if (myId == null || msg.id !== myId) return;
  if (msg.kind === 'progress') {
    els.ringWrap.innerHTML = ringSVG(msg.pct);
    els.pstatus.textContent = `${t('tDownloading')} ${Math.round(msg.pct)}%`;
  } else if (msg.kind === 'done' || msg.kind === 'exists') {
    els.pstatus.textContent = t('tDone');
    els.pstatus.className = 'pstatus ok';
    els.ringWrap.innerHTML = ringSVG(100);
    setTimeout(() => window.close(), 800);
  } else if (msg.kind === 'error') {
    els.pstatus.textContent = `${t('tError')}: ${msg.code || ''}`;
    els.pstatus.className = 'pstatus err';
    setTimeout(() => window.close(), 3500);
  }
}

els.btnMp3.addEventListener('click', () => choose('mp3'));
els.btnVideo.addEventListener('click', () => choose('video'));
els.btnIgnore.addEventListener('click', ignore);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'm') choose('mp3');
  else if (k === 'v') choose('video');
  else if (e.key === 'Escape') ignore();
});

api.on('mini:data', setup);
api.on('mini:title', (title) => { if (title) els.vtitle.textContent = title; });
api.on('toast', handleToast);

window.addEventListener('DOMContentLoaded', () => {
  document.title = 'Mora Downloader';
});
