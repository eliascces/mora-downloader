'use strict';

const api = window.mora;

const els = {
  video: document.getElementById('video'),
  empty: document.getElementById('empty'),
  queueList: document.getElementById('queueList'),
  nowName: document.getElementById('nowName'),
  queueTitle: document.getElementById('queueTitle'),
};

const state = {
  items: [],
  index: -1,
};

function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return '';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fileUrl(p) {
  return 'file:///' + String(p).split('\\').join('/');
}

function play() {
  const item = state.items[state.index];
  if (!item) return;
  els.empty.style.display = 'none';
  els.video.src = fileUrl(item.path);
  els.video.play().catch(() => {});
  els.nowName.textContent = item.name;
  renderQueue();
}

function renderQueue() {
  els.queueList.innerHTML = '';
  state.items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = i === state.index ? 'active' : '';
    li.innerHTML = `
      <span class="q-icon">${item.format === 'audio' ? '♪' : '🎬'}</span>
      <span class="q-name">${esc(item.name)}</span>
      <span class="q-time">${fmtDuration(item.duration)}</span>`;
    li.addEventListener('click', () => {
      state.index = i;
      play();
    });
    els.queueList.appendChild(li);
  });
  const active = els.queueList.querySelector('.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

els.video.addEventListener('ended', () => {
  if (state.index < state.items.length - 1) {
    state.index += 1;
    play();
  }
});

api.on('player:list', ({ items, startId }) => {
  state.items = items || [];
  const idx = state.items.findIndex((i) => i.id === startId);
  state.index = idx >= 0 ? idx : 0;
  play();
});

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
