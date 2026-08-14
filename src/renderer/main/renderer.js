'use strict';

const api = window.mora;
const state = {
  settings: null,
  items: [],
  playlists: [],
  history: [],
  lang: 'es',
  activeTab: 'downloads',
  plDetailId: null,
  toasts: {},
  playQueue: [],
  playIndex: -1,
};

const $ = (sel) => document.querySelector(sel);
const els = {
  toggle: $('#toggle'),
  statusText: $('#statusText'),
  formatSeg: $('#formatSeg'),
  qualityRow: $('#qualityRow'),
  quality: $('#quality'),
  playlistMode: $('#playlistMode'),
  folderPath: $('#folderPath'),
  btnPick: $('#btnPick'),
  btnNew: $('#btnNew'),
  btnOpen: $('#btnOpen'),
  spaceInfo: $('#spaceInfo'),
  btnUpdate: $('#btnUpdate'),
  btnCancel: $('#btnCancel'),
  btnManualToggle: $('#btnManualToggle'),
  manualBody: $('#manualBody'),
  historyList: $('#historyList'),
  libSearch: $('#libSearch'),
  favFilter: $('#favFilter'),
  libList: $('#libList'),
  btnRefresh: $('#btnRefresh'),
  btnPlayFavs: $('#btnPlayFavs'),
  plName: $('#plName'),
  btnCreatePl: $('#btnCreatePl'),
  plList: $('#plList'),
  plDetail: $('#plDetail'),
  plDetailName: $('#plDetailName'),
  plDetailList: $('#plDetailList'),
  btnBackPl: $('#btnBackPl'),
  btnPlayPl: $('#btnPlayPl'),
  miniPlayer: $('#miniPlayer'),
  mpName: $('#mpName'),
  mpTime: $('#mpTime'),
  mpToggle: $('#mpToggle'),
  mpPrev: $('#mpPrev'),
  mpNext: $('#mpNext'),
  mpSeek: $('#mpSeek'),
  mpVol: $('#mpVol'),
  audio: $('#audio'),
  toasts: $('#toasts'),
  version: $('#version'),
};

function t(key, params) {
  const dict = window.I18N[state.lang] || window.I18N.es;
  let s = dict[key] || window.I18N.es[key] || key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split(`{${k}}`).join(params[k]);
    }
  }
  return s;
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const btn of document.querySelectorAll('.lang-switch button')) {
    btn.classList.toggle('active', btn.dataset.lang === state.lang);
  }
  renderHistory();
  renderLibrary();
  renderPlaylists();
}

function setStatus(on, extra) {
  const txt = els.statusText;
  txt.classList.toggle('on', !!on);
  if (on) {
    txt.textContent = extra && extra > 0
      ? t('statusOnPlaying', { count: extra })
      : t('statusOn');
  } else {
    txt.textContent = t('statusOff');
  }
}

function fmtBytes(bytes) {
  if (bytes == null) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

async function refreshSettings() {
  state.settings = await api.invoke('settings:get');
  state.lang = state.settings.language || 'es';
  applyI18n();
  els.toggle.checked = !!state.settings.enabled;
  setStatus(state.settings.enabled);
  const fmt = state.settings.downloadFormat === 'video' ? 'video' : 'mp3';
  for (const b of els.formatSeg.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.format === fmt);
  }
  els.qualityRow.classList.toggle('hidden', fmt !== 'video');
  els.quality.value = state.settings.videoQuality || '1080';
  els.playlistMode.checked = !!state.settings.playlistMode;
  await refreshFolder();
}

async function refreshFolder() {
  const folder = await api.invoke('folder:current');
  els.folderPath.textContent = folder;
  els.folderPath.title = folder;
  const free = await api.invoke('space:check');
  if (free != null) {
    els.spaceInfo.textContent = t('spaceFree', { mb: Math.round(free / 1048576) });
    els.spaceInfo.classList.toggle('low', free < 100 * 1048576);
  }
}

// ---- Toasts (popup descarga derecha) ----

const RING_C = 2 * Math.PI * 18;

function ringSVG(pct) {
  const off = RING_C * (1 - Math.max(0, Math.min(100, pct || 0)) / 100);
  return `
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle class="ring-bg" cx="20" cy="20" r="18"></circle>
      <circle class="ring-fg" cx="20" cy="20" r="18" stroke-dasharray="${RING_C}" stroke-dashoffset="${off}"></circle>
    </svg>`;
}

function toastLogo() {
  return `<svg viewBox="0 0 512 512" width="17" height="17"><path d="M256 90 v200" stroke="#fff" stroke-width="48" stroke-linecap="round"/><path d="M196 250 l60 60 60-60" stroke="#fff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M190 392 a60 60 0 0 0 132 0" stroke="#fff" stroke-width="26" stroke-linecap="round" fill="none"/></svg>`;
}

function upsertToast(id, data) {
  let el = state.toasts[id];
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.dataset.id = id;
    el.innerHTML = `
      <div class="toast-ring"></div>
      <div class="toast-body">
        <div class="toast-title"></div>
        <div class="toast-sub"></div>
      </div>
      <button class="toast-close">×</button>`;
    el.querySelector('.toast-close').addEventListener('click', () => dismissToast(id));
    els.toasts.appendChild(el);
    state.toasts[id] = el;
  }
  Object.assign(state.toasts[id].__data || (state.toasts[id].__data = {}), data);
  renderToast(id);
}

function renderToast(id) {
  const el = state.toasts[id];
  if (!el) return;
  const d = el.__data;
  el.classList.remove('toast-info', 'toast-ok', 'toast-err');
  if (d.status === 'ok') el.classList.add('toast-ok');
  else if (d.status === 'error') el.classList.add('toast-err');
  else el.classList.add('toast-info');

  const ring = el.querySelector('.toast-ring');
  const status = d.status;
  if (status === 'done' || status === 'exists' || status === 'error') {
    ring.innerHTML = `<svg viewBox="0 0 512 512" width="24" height="24">${status === 'error' ? '<circle cx="256" cy="256" r="200" fill="rgba(248,113,113,.2)"/><path d="M176 176 L336 336 M336 176 L176 336" stroke="#f87171" stroke-width="44" stroke-linecap="round"/>' : '<circle cx="256" cy="256" r="200" fill="rgba(52,211,153,.18)"/><path d="M170 262 l60 60 120-132" stroke="#34d399" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'}</svg>`;
  } else {
    ring.innerHTML = ringSVG(d.pct || 0) + `<span class="toast-logo">${toastLogo()}</span>`;
  }

  const platform = d.platform || '';
  el.querySelector('.toast-title').textContent = d.title || (platform || '');
  const sub = el.querySelector('.toast-sub');
  let text = '';
  if (status === 'done') text = `${d.format === 'video' ? 'MP4' : 'MP3'} · ${t('tDone')}`;
  else if (status === 'exists') text = t('tExists');
  else if (status === 'error') text = `${t('tError')}: ${d.message || ''}`;
  else if (status === 'queued') text = t('tQueued');
  else if (d.playlist) text = t('tPlaylistModeOn');
  else if (d.format === 'video') text = `${t('tMerging')} ${d.pct != null ? Math.round(d.pct) + '%' : ''}`;
  else if (d.pct != null && d.pct >= 100) text = `${t('tConverting')} …`;
  else text = `${t('tDownloading')} ${d.pct != null ? Math.round(d.pct) + '%' : ''}`;
  sub.textContent = text.trim();
  sub.className = `toast-sub ${status === 'ok' ? 'ok' : status === 'error' ? 'err' : ''}`;
}

function dismissToast(id, instant) {
  const el = state.toasts[id];
  if (!el) return;
  delete state.toasts[id];
  if (instant) { el.remove(); return; }
  el.classList.add('closing');
  setTimeout(() => el.remove(), 250);
}

function showInfoToast(key, params, timeout = 6000) {
  const id = 'info-' + Date.now() + Math.random();
  upsertToast(id, { key, status: 'info' });
  const el = state.toasts[id];
  const sub = el.querySelector('.toast-sub');
  sub.textContent = t(key, params);
  el.querySelector('.toast-ring').innerHTML = `<svg viewBox="0 0 512 512" width="22" height="22"><circle cx="256" cy="256" r="210" fill="rgba(139,92,246,.2)"/><path d="M256 176 v120 M256 336 v8" stroke="#8b5cf6" stroke-width="34" stroke-linecap="round"/></svg>`;
  el.querySelector('.toast-title').textContent = 'Mora Downloader';
  el.classList.add('toast-info');
  if (timeout) setTimeout(() => dismissToast(id), timeout);
}

function handleToast(msg) {
  if (msg.kind) {
    const id = msg.id;
    switch (msg.kind) {
      case 'started':
        upsertToast(id, { title: msg.platform || t('tDownloading'), platform: msg.platform, format: msg.format, playlist: msg.playlist, status: 'started', pct: 0 });
        break;
      case 'title':
        if (state.toasts[id]) { state.toasts[id].__data.title = msg.title; renderToast(id); }
        break;
      case 'progress':
        if (state.toasts[id]) { state.toasts[id].__data.pct = msg.pct; renderToast(id); }
        break;
      case 'done':
        upsertToast(id, { status: 'done', format: msg.format });
        setTimeout(() => dismissToast(id), 8000);
        break;
      case 'exists':
        upsertToast(id, { status: 'exists' });
        setTimeout(() => dismissToast(id), 6000);
        break;
      case 'error':
        upsertToast(id, { status: 'error', message: msg.message });
        break;
      case 'duplicate':
        showInfoToast('tDuplicate');
        break;
    }
    return;
  }
  if (msg.key) {
    if (msg.key === 'updateCheck') {
      showInfoToast('tUpdateResult', { message: (msg.ok ? t('tUpdateOk') : '') + (msg.message || '') }, 9000);
    } else if (msg.key === 'missingBinaries') {
      showInfoToast('tMissingBinaries', { list: (msg.list || []).join(', ') }, 15000);
    } else {
      showInfoToast(msg.key, msg, 7000);
    }
  }
}

// ---- Descargas / toggle ----

els.toggle.addEventListener('change', async () => {
  state.settings = await api.invoke('settings:set', 'enabled', els.toggle.checked);
  setStatus(els.toggle.checked);
});

els.formatSeg.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of els.formatSeg.querySelectorAll('button')) b.classList.remove('active');
  btn.classList.add('active');
  const fmt = btn.dataset.format;
  els.qualityRow.classList.toggle('hidden', fmt !== 'video');
  state.settings = await api.invoke('settings:set', 'downloadFormat', fmt);
});

els.quality.addEventListener('change', async () => {
  state.settings = await api.invoke('settings:set', 'videoQuality', els.quality.value);
});

els.playlistMode.addEventListener('change', async () => {
  state.settings = await api.invoke('settings:set', 'playlistMode', els.playlistMode.checked);
});

els.btnPick.addEventListener('click', async () => {
  const dir = await api.invoke('dialog:pick-folder');
  if (dir) await refreshFolder();
});
els.btnNew.addEventListener('click', async () => {
  const dir = await api.invoke('folder:create-new');
  if (dir) await refreshFolder();
});
els.btnOpen.addEventListener('click', () => api.invoke('folder:open'));

els.btnUpdate.addEventListener('click', async () => {
  els.btnUpdate.disabled = true;
  const r = await api.invoke('updater:check');
  showInfoToast('tUpdateResult', { message: r.message || '' }, 9000);
  els.btnUpdate.disabled = false;
});

els.btnCancel.addEventListener('click', () => api.invoke('download:cancel'));

// ---- Tabs ----

for (const btn of document.querySelectorAll('.tabs button')) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
}
function switchTab(name) {
  state.activeTab = name;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.id === 'tab-' + name);
  if (name === 'library') renderLibrary();
  if (name === 'playlists') renderPlaylists();
}

// ---- Manual ----

els.btnManualToggle.addEventListener('click', () => {
  els.manualBody.classList.toggle('hidden');
});

// ---- Historial ----

async function refreshHistory() {
  state.history = await api.invoke('library:history');
  renderHistory();
}

function renderHistory() {
  els.historyList.innerHTML = '';
  const hist = state.history.slice(0, 50);
  if (!hist.length) {
    els.historyList.innerHTML = `<li class="hist-item"><span class="hist-meta"><div class="hist-sub">${t('emptyHistory')}</div></span></li>`;
    return;
  }
  for (const h of hist) {
    const li = document.createElement('li');
    li.className = 'hist-item';
    const when = new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    li.innerHTML = `
      <span class="hist-badge ${h.status === 'ok' ? 'ok' : h.status === 'exists' ? 'exists' : 'error'}">${h.status === 'ok' ? (h.format === 'video' ? 'MP4' : 'MP3') : h.status === 'exists' ? '↻' : '!'}</span>
      <div class="hist-meta"><div class="hist-title">${esc(h.title || h.url || '')}</div><div class="hist-sub">${esc(h.platform || '')}${h.message ? ' · ' + esc(h.message) : ''}</div></div>
      <span class="hist-time">${when}</span>`;
    els.historyList.appendChild(li);
  }
}

// ---- Biblioteca ----

function filteredItems() {
  const q = els.libSearch.value.trim().toLowerCase();
  const favs = els.favFilter.checked ? new Set(state.items.filter((i) => isFav(i.id)).map((i) => i.id)) : null;
  return state.items.filter((i) => {
    if (favs && !favs.has(i.id)) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function isFav(id) {
  return state.favSet && state.favSet.has(id);
}

async function refreshLibrary() {
  state.items = await api.invoke('library:scan');
  await loadFavs();
  renderLibrary();
}

async function loadFavs() {
  const favs = await getFavs();
  state.favSet = new Set(favs.map((i) => i.id));
}

async function getFavs() {
  return await api.invoke('library:favorites');
}

function renderLibrary() {
  els.libList.innerHTML = '';
  const items = filteredItems();
  if (!items.length) {
    els.libList.innerHTML = `<li><div class="hist-sub">${t('emptyLibrary')}</div></li>`;
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'lib-item';
    li.dataset.id = item.id;
    const fav = state.favSet && state.favSet.has(item.id);
    const sub = item.format === 'audio' ? t('libSubAudio', { size: fmtBytes(item.size), duration: fmtDuration(item.duration) }) : t('libSubVideo', { size: fmtBytes(item.size), duration: fmtDuration(item.duration) });
    li.innerHTML = `
      <span class="icon ${item.format}">${item.format === 'audio' ? '♪' : '🎬'}</span>
      <div class="lib-meta"><div class="lib-name">${esc(item.name)}</div><div class="lib-sub">${esc(item.format === 'audio' ? 'MP3' : 'MP4')} · ${sub}</div></div>
      <button class="icon-btn star ${fav ? 'starred' : ''}" title="⭐">${fav ? '★' : '☆'}</button>
      <button class="icon-btn pl-add" title="+">＋</button>
      <button class="icon-btn play" title="${t('btnPlay')}">▶</button>`;
    li.querySelector('.star').addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = await api.invoke('library:favorite-toggle', item.id);
      loadFavs().then(() => renderLibrary());
      showInfoToast(r.fav ? 'favAdded' : 'favRemoved', null, 2500);
    });
    li.querySelector('.pl-add').addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = await promptPlaylistChoice();
      if (name) {
        const pls = await api.invoke('library:playlists');
        const pl = pls.find((p) => p.name === name);
        await api.invoke('library:add-to-playlist', pl.id, item.id);
        showInfoToast('addedToPlaylist', null, 2500);
      }
    });
    li.querySelector('.play').addEventListener('click', (e) => {
      e.stopPropagation();
      playFrom(items, item.id);
    });
    li.addEventListener('dblclick', () => playFrom(items, item.id));
    els.libList.appendChild(li);
  }
}

async function promptPlaylistChoice() {
  const pls = await api.invoke('library:playlists');
  if (!pls.length) {
    const name = prompt(t('plNewPlaceholder'));
    if (!name || !name.trim()) return null;
    await api.invoke('library:create-playlist', name.trim());
    return name.trim();
  }
  const choice = prompt(`Añadir a playlist:\n${pls.map((p, i) => `${i + 1}. ${p.name}`).join('\n')}\n\n0. Nueva playlist`);
  if (choice == null) return null;
  const n = parseInt(choice, 10);
  if (n === 0) {
    const name = prompt(t('plNewPlaceholder'));
    if (!name || !name.trim()) return null;
    await api.invoke('library:create-playlist', name.trim());
    return name.trim();
  }
  const pl = pls[n - 1];
  return pl ? pl.name : null;
}

els.libSearch.addEventListener('input', renderLibrary);
els.favFilter.addEventListener('change', renderLibrary);
els.btnRefresh.addEventListener('click', refreshLibrary);
els.btnPlayFavs.addEventListener('click', async () => {
  await loadFavs();
  const favs = (state.items || []).filter((i) => state.favSet && state.favSet.has(i.id));
  playFrom(favs, favs.length ? favs[0].id : null);
});

// ---- Playlists ----

async function refreshPlaylists() {
  state.playlists = await api.invoke('library:playlists');
  renderPlaylists();
}

function renderPlaylists() {
  els.plList.innerHTML = '';
  if (state.plDetailId) { renderPlDetail(); }
  else {
    if (!state.playlists.length) {
      els.plList.innerHTML = `<li><div class="hist-sub">${t('emptyPlaylists')}</div></li>`;
      return;
    }
    for (const pl of state.playlists) {
      const li = document.createElement('li');
      li.className = 'pl-item';
      li.innerHTML = `
        <span class="icon audio">🎵</span>
        <div class="lib-meta" style="flex:1"><div class="pl-name">${esc(pl.name)}</div><div class="lib-sub">${t('plCount', { count: pl.items.length })}</div></div>
        <button class="icon-btn play" title="${t('btnPlay')}">▶</button>
        <button class="icon-btn open" title="→">→</button>
        <button class="icon-btn rename" title="${t('btnRename')}">✎</button>
        <button class="icon-btn del" title="${t('btnDelete')}">🗑</button>`;
      li.querySelector('.play').addEventListener('click', async () => {
        const pls = await api.invoke('library:playlists');
        const p = pls.find((x) => x.id === pl.id);
        if (!p) return;
        const plItems = p.items.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
        playFrom(plItems, plItems.length ? plItems[0].id : null);
      });
      li.querySelector('.open').addEventListener('click', () => { state.plDetailId = pl.id; renderPlaylists(); });
      li.querySelector('.rename').addEventListener('click', async () => {
        const name = prompt(t('btnRename'), pl.name);
        if (name && name.trim()) {
          await api.invoke('library:rename-playlist', pl.id, name.trim());
          refreshPlaylists();
        }
      });
      li.querySelector('.del').addEventListener('click', async () => {
        if (!confirm(t('confirmDeletePlaylist', { name: pl.name }))) return;
        await api.invoke('library:delete-playlist', pl.id);
        refreshPlaylists();
      });
      els.plList.appendChild(li);
    }
  }
}

function renderPlDetail() {
  const pl = state.playlists.find((p) => p.id === state.plDetailId);
  if (!pl) { state.plDetailId = null; renderPlaylists(); return; }
  els.plDetail.classList.remove('hidden');
  els.plDetailName.textContent = pl.name;
  const items = pl.items.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
  els.plDetailList.innerHTML = '';
  if (!items.length) {
    els.plDetailList.innerHTML = `<li><div class="hist-sub">${t('emptyPlaylistItems')}</div></li>`;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'lib-item';
    li.innerHTML = `
      <span class="icon ${item.format}">${item.format === 'audio' ? '♪' : '🎬'}</span>
      <div class="lib-meta"><div class="lib-name">${esc(item.name)}</div><div class="lib-sub">${esc(item.format === 'audio' ? 'MP3' : 'MP4')} · ${fmtDuration(item.duration)}</div></div>
      <button class="icon-btn play" title="${t('btnPlay')}">▶</button>
      <button class="icon-btn del" title="${t('btnRemove')}">✕</button>`;
    li.querySelector('.play').addEventListener('click', () => playFrom(items, item.id));
    li.querySelector('.del').addEventListener('click', async () => {
      await api.invoke('library:remove-from-playlist', pl.id, item.id);
      refreshPlaylists();
    });
    els.plDetailList.appendChild(li);
  }
}

els.btnCreatePl.addEventListener('click', async () => {
  const name = els.plName.value.trim();
  if (!name) return;
  await api.invoke('library:create-playlist', name);
  els.plName.value = '';
  refreshPlaylists();
});
els.plName.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.btnCreatePl.click(); });
els.btnBackPl.addEventListener('click', () => { state.plDetailId = null; renderPlaylists(); });
els.btnPlayPl.addEventListener('click', async () => {
  const pl = state.playlists.find((p) => p.id === state.plDetailId);
  if (!pl) return;
  const items = pl.items.map((id) => state.items.find((i) => i.id === id)).filter(Boolean);
  playFrom(items, items.length ? items[0].id : null);
});

// ---- Reproductor (audio inline + video en ventana) ----

function playFrom(items, startId) {
  const list = items || [];
  if (!list.length) return;
  const videos = list.filter((i) => i.format === 'video');
  const audios = list.filter((i) => i.format === 'audio');
  const all = [...audios, ...videos];
  if (!all.length) return;
  const idx = all.findIndex((i) => i.id === startId);
  const start = idx >= 0 ? idx : 0;
  if (all[start].format === 'video') {
    api.invoke('player:open', all, all[start].id);
    return;
  }
  state.playQueue = all;
  state.playIndex = start;
  playAudio();
}

function playAudio() {
  const item = state.playQueue[state.playIndex];
  if (!item) return;
  els.audio.src = 'file:///' + item.path.split('\\').join('/');
  els.audio.play().catch(() => {});
  els.miniPlayer.classList.remove('hidden');
  els.mpName.textContent = item.name;
  els.mpToggle.textContent = '❚❚';
}

els.audio.addEventListener('play', () => { els.mpToggle.textContent = '❚❚'; });
els.audio.addEventListener('pause', () => { els.mpToggle.textContent = '▶'; });
els.audio.addEventListener('ended', () => nextTrack());
els.audio.addEventListener('timeupdate', () => {
  if (!els.audio.duration) return;
  els.mpSeek.value = Math.round((els.audio.currentTime / els.audio.duration) * 1000);
  els.mpTime.textContent = `${fmtDuration(els.audio.currentTime)} / ${fmtDuration(els.audio.duration)}`;
});
els.audio.addEventListener('loadedmetadata', () => {
  els.mpTime.textContent = `0:00 / ${fmtDuration(els.audio.duration)}`;
});
els.mpToggle.addEventListener('click', () => {
  if (els.audio.paused) els.audio.play();
  else els.audio.pause();
});
els.mpPrev.addEventListener('click', () => { state.playIndex = (state.playIndex - 1 + state.playQueue.length) % state.playQueue.length; playAudio(); });
els.mpNext.addEventListener('click', nextTrack);
function nextTrack() {
  if (!state.playQueue.length) return;
  state.playIndex = (state.playIndex + 1) % state.playQueue.length;
  const item = state.playQueue[state.playIndex];
  if (item.format === 'video') {
    api.invoke('player:open', state.playQueue, item.id);
    return;
  }
  playAudio();
}
els.mpSeek.addEventListener('input', () => {
  if (els.audio.duration) els.audio.currentTime = (els.mpSeek.value / 1000) * els.audio.duration;
});
els.mpVol.addEventListener('input', () => { els.audio.volume = els.mpVol.value / 100; });

// ---- Events desde main ----

api.on('toast', handleToast);
api.on('library:updated', async (items) => {
  state.items = items;
  await loadFavs();
  renderLibrary();
  renderPlaylists();
  refreshHistory();
});

// ---- Init ----

(async function init() {
  els.version.textContent = 'v' + (await api.invoke('app:version'));
  await refreshSettings();
  await refreshLibrary();
  await refreshPlaylists();
  await refreshHistory();
  const active = await api.invoke('download:active');
  els.btnCancel.classList.toggle('hidden', !active.running && active.pending === 0);
})();

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
