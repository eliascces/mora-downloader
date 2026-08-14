'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.opus', '.flac']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv', '.m4v']);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    /* ignore */
  }
}

function idOf(text) {
  return crypto.createHash('sha1').update(String(text).toLowerCase()).digest('hex').slice(0, 16);
}

class LibraryStore {
  constructor(dir, { ffprobePath = null, ffmpegPath = null } = {}) {
    this.dir = dir;
    this.ffprobePath = ffprobePath;
    this.ffmpegPath = ffmpegPath;
    this.thumbsDir = path.join(dir, 'thumbs');
    this.libraryFile = path.join(dir, 'library.json');
    this.favoritesFile = path.join(dir, 'favorites.json');
    this.playlistsFile = path.join(dir, 'playlists.json');
    this.historyFile = path.join(dir, 'history.json');
    this.items = [];
    this.favorites = [];
    this.playlists = [];
    this.history = [];
    this.loadAll();
  }

  loadAll() {
    this.items = readJson(this.libraryFile, []);
    this.favorites = readJson(this.favoritesFile, []);
    this.playlists = readJson(this.playlistsFile, []);
    this.history = readJson(this.historyFile, []);
  }

  saveItems() { writeJson(this.libraryFile, this.items); }
  saveFavorites() { writeJson(this.favoritesFile, this.favorites); }
  savePlaylists() { writeJson(this.playlistsFile, this.playlists); }
  saveHistory() { writeJson(this.historyFile, this.history); }

  scan(destinationRoot) {
    const oldByKey = new Map(this.items.map((i) => [i.id, i]));
    const newItems = [];
    for (const sub of ['MP3', 'Videos']) {
      const dir = path.join(destinationRoot, sub);
      let entries;
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        if (!st.isFile()) continue;
        const ext = path.extname(entry).toLowerCase();
        if (!AUDIO_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;
        const id = idOf(full);
        const prev = oldByKey.get(id);
        newItems.push({
          id,
          path: full,
          name: path.basename(entry, ext),
          ext: ext.slice(1),
          format: AUDIO_EXTS.has(ext) ? 'audio' : 'video',
          size: st.size,
          mtime: st.mtimeMs,
          duration: prev && prev.duration != null ? prev.duration : undefined,
        });
      }
    }
    newItems.sort((a, b) => b.mtime - a.mtime);
    this.items = newItems;
    this.saveItems();
    this.pruneOrphans();
    this.fillDurations().catch(() => {});
    return this.items;
  }

  pruneOrphans() {
    const valid = new Set(this.items.map((i) => i.id));
    if (this.favorites.some((id) => !valid.has(id))) {
      this.favorites = this.favorites.filter((id) => valid.has(id));
      this.saveFavorites();
    }
    let changed = false;
    for (const pl of this.playlists) {
      const clean = pl.items.filter((id) => valid.has(id));
      if (clean.length !== pl.items.length) {
        pl.items = clean;
        changed = true;
      }
    }
    if (changed) this.savePlaylists();
  }

  async fillDurations() {
    const queue = this.items.filter((i) => i.duration == null && this.ffprobePath);
    if (queue.length === 0) return;
    const CONCURRENCY = 3;
    let idx = 0;
    const worker = async () => {
      while (idx < queue.length) {
        const item = queue[idx++];
        item.duration = await this.probeDuration(item.path);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    this.saveItems();
  }

  probeDuration(file) {
    return new Promise((resolve) => {
      let proc;
      try {
        proc = spawn(this.ffprobePath, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          file,
        ], { windowsHide: true });
      } catch {
        return resolve(null);
      }
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('error', () => resolve(null));
      proc.on('close', () => {
        const dur = parseFloat(out.trim());
        resolve(Number.isFinite(dur) ? dur : null);
      });
    });
  }

  ensureThumbnail(item) {
    return new Promise((resolve) => {
      fs.mkdirSync(this.thumbsDir, { recursive: true });
      const thumb = path.join(this.thumbsDir, `${item.id}.jpg`);
      if (fs.existsSync(thumb)) return resolve(thumb);
      if (!item.path || !fs.existsSync(item.path)) return resolve(null);
      if (!this.ffmpegPath) return resolve(null);
      const base = item.format === 'video'
        ? ['-y', '-loglevel', 'error', '-i', item.path, '-frames:v', '1', '-vf', 'scale=160:-2', thumb]
        : ['-y', '-loglevel', 'error', '-i', item.path, '-an', '-map', '0:v?', '-frames:v', '1', thumb];
      const attempts = item.format === 'video'
        ? [['-ss', '1', ...base], base]
        : [base];
      const run = (i) => {
        const args = attempts[i];
        let proc;
        try {
          proc = spawn(this.ffmpegPath, args, { windowsHide: true });
        } catch {
          return resolve(null);
        }
        const timer = setTimeout(() => {
          try { proc.kill(); } catch {}
        }, 15000);
        proc.on('error', () => { clearTimeout(timer); resolve(null); });
        proc.on('close', () => {
          clearTimeout(timer);
          if (fs.existsSync(thumb)) return resolve(thumb);
          if (i + 1 < attempts.length) return run(i + 1);
          resolve(null);
        });
      };
      run(0);
    });
  }

  toggleFavorite(id) {
    const idx = this.favorites.indexOf(id);
    if (idx >= 0) this.favorites.splice(idx, 1);
    else this.favorites.unshift(id);
    this.saveFavorites();
    return this.favorites.includes(id);
  }

  isFavorite(id) {
    return this.favorites.includes(id);
  }

  getFavorites() {
    return this.favorites.map((id) => this.items.find((i) => i.id === id)).filter(Boolean);
  }

  createPlaylist(name) {
    const pl = { id: idOf(name + Date.now() + Math.random()), name: String(name).trim(), createdAt: Date.now(), items: [] };
    this.playlists.unshift(pl);
    this.savePlaylists();
    return pl;
  }

  renamePlaylist(id, name) {
    const pl = this.playlists.find((p) => p.id === id);
    if (pl) {
      pl.name = String(name).trim();
      this.savePlaylists();
    }
    return pl;
  }

  deletePlaylist(id) {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.savePlaylists();
  }

  addToPlaylist(playlistId, itemId) {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (pl && !pl.items.includes(itemId)) {
      pl.items.push(itemId);
      this.savePlaylists();
    }
    return pl;
  }

  removeFromPlaylist(playlistId, itemId) {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (pl) {
      pl.items = pl.items.filter((id) => id !== itemId);
      this.savePlaylists();
    }
    return pl;
  }

  getPlaylistItems(playlistId) {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) return [];
    return pl.items.map((id) => this.items.find((i) => i.id === id)).filter(Boolean);
  }

  addHistory(entry) {
    const item = { id: idOf(JSON.stringify(entry) + Date.now() + Math.random()), at: Date.now(), ...entry };
    this.history.unshift(item);
    if (this.history.length > 200) this.history = this.history.slice(0, 200);
    this.saveHistory();
    return item;
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  freeSpace(dir) {
    try {
      const st = fs.statfsSync(dir);
      return st.bavail * st.bsize;
    } catch {
      return null;
    }
  }
}

module.exports = { LibraryStore, idOf };
