'use strict';

const {
  app, BrowserWindow, ipcMain, dialog, Notification, shell, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Settings } = require('./settings');
const ClipboardWatcher = require('./clipboard');
const { Downloader, resourcePath } = require('./downloader');
const DownloadQueue = require('./queue');
const { LibraryStore } = require('./library');
const { checkUpdate } = require('./updater');
const { detectVideoUrl, makeKey, getPlatform } = require('../shared/links');

const LOW_SPACE_BYTES = 100 * 1024 * 1024;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  main();
}

function main() {
  let settings;
  let watcher;
  let downloader;
  let queue;
  let library;
  let mainWin = null;
  let miniWin = null;
  let playerWin = null;
  let miniCurrent = null;
  const miniQueue = [];
  const sessionKeys = new Set();
  const notifiedKeys = new Set();

  const iconPath = (() => {
    const p = path.join(__dirname, '..', '..', 'assets', 'icon.png');
    return fs.existsSync(p) ? p : undefined;
  })();

  const preloadPath = path.join(__dirname, 'preload.js');
  const defaultDestination = () => path.join(app.getPath('home'), 'Downloads', 'Mora Música');

  function broadcast(channel, payload) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    }
  }

  function ensureDirs() {
    const dest = settings.destination();
    for (const sub of ['MP3', 'Videos']) {
      fs.mkdirSync(path.join(dest, sub), { recursive: true });
    }
    return dest;
  }

  function notifyNative(title, body) {
    const focused = mainWin && !mainWin.isDestroyed() && mainWin.isFocused();
    if (focused) return;
    try {
      new Notification({ title: `Mora Downloader — ${title}`, body }).show();
    } catch {
      /* ignore */
    }
  }

  function findOutputFile(dest, format) {
    const sub = format === 'video' ? 'Videos' : 'MP3';
    const dir = path.join(dest, sub);
    try {
      const files = fs.readdirSync(dir)
        .map((f) => {
          const full = path.join(dir, f);
          return { full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      return files.length ? files[0].full : null;
    } catch {
      return null;
    }
  }

  async function startDownload({ url, playlist, format, quality }) {
    const key = makeKey(url);
    if (sessionKeys.has(key)) return;
    sessionKeys.add(key);

    const fmt = Settings.validateFormat(format || settings.get('downloadFormat'));
    const q = quality || settings.get('videoQuality');
    const dest = ensureDirs();

    const free = library.freeSpace(dest);
    if (free != null && free < LOW_SPACE_BYTES) {
      broadcast('toast', { key: 'lowSpace' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const platform = getPlatform(url);
    broadcast('toast', { kind: 'started', id, url, format: fmt, platform, playlist: !!playlist });

    const titlePromise = downloader.getTitle(url).then((t) => {
      broadcast('toast', { kind: 'title', id, title: t });
      return t;
    }).catch(() => '');

    const job = {
      id,
      url,
      format: fmt,
      playlist: !!playlist,
      run: () => downloader.download({
        url,
        format: fmt,
        quality: q,
        playlist: !!playlist,
        outputDir: fmt === 'video' ? path.join(dest, 'Videos') : path.join(dest, 'MP3'),
        onProgress: (pct) => broadcast('toast', { kind: 'progress', id, pct }),
      }),
      cancel: () => downloader.cancel(),
    };

    try {
      const res = await queue.add(job);
      const file = findOutputFile(dest, fmt);
      const title = await titlePromise;
      if (res && res.skipped) {
        broadcast('toast', { kind: 'exists', id, url, file });
      } else {
        broadcast('toast', { kind: 'done', id, url, format: fmt, file, playlist: !!playlist });
        notifyNative('Descarga completada', `${title || platform} → ${file || fmt.toUpperCase()}`);
      }
      library.addHistory({ url, platform, format: fmt, path: file, status: res && res.skipped ? 'exists' : 'ok' });
      const items = library.scan(dest);
      broadcast('library:updated', items);
    } catch (err) {
      const code = (err && err.code) || 'ERROR';
      const message = (err && err.message) || 'Error desconocido';
      broadcast('toast', { kind: 'error', id, url, code, message });
      library.addHistory({ url, platform, format: fmt, status: 'error', message });
      notifyNative('Error de descarga', `${code} — ${message}`);
    }
  }

  function handleLink({ url, playlist }) {
    const key = makeKey(url);
    if (sessionKeys.has(key)) {
      if (!notifiedKeys.has(key)) {
        notifiedKeys.add(key);
        broadcast('toast', { kind: 'duplicate', url });
      }
      return;
    }
    const effectivePlaylist = playlist && settings.get('playlistMode');
    if (playlist && !settings.get('playlistMode')) {
      broadcast('toast', { key: 'playlistHint' });
      return;
    }
    const useDirect =
      settings.get('askFormatWhenHidden') === false ||
      (mainWin && !mainWin.isDestroyed() && mainWin.isVisible() && mainWin.isFocused());
    if (useDirect) {
      startDownload({ url, playlist: effectivePlaylist });
    } else {
      showMiniWindow({ url, playlist: effectivePlaylist });
    }
  }

  function handleExistingClipboard() {
    const found = watcher.checkNow();
    if (found) {
      showMiniWindow({ url: found.url, playlist: found.playlist, initial: true });
    }
  }

  function showMiniWindow(data) {
    miniQueue.push(data);
    pumpMini();
  }

  function pumpMini() {
    if (miniWin || miniQueue.length === 0) return;
    const data = miniQueue.shift();
    miniCurrent = data;
    createMiniWindow(data);
  }

  function createMiniWindow(data) {
    miniWin = new BrowserWindow({
      width: 400,
      height: 250,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#12141c',
      icon: iconPath,
      webPreferences: { contextIsolation: true, preload: preloadPath },
    });
    miniWin.setAlwaysOnTop(true, 'screen-saver');
    miniWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    miniWin.loadFile(path.join(__dirname, '..', 'renderer', 'mini', 'mini.html'));
    miniWin.once('ready-to-show', () => {
      miniWin.center();
      miniWin.show();
    });
    miniWin.on('closed', () => {
      miniWin = null;
      pumpMini();
    });
    miniWin.webContents.on('did-finish-load', () => {
      miniWin.webContents.send('mini:data', {
        url: data.url,
        playlist: !!data.playlist,
        initial: !!data.initial,
        lastFormat: settings.get('downloadFormat'),
        language: settings.get('language'),
      });
      downloader.getTitle(data.url).then((t) => {
        if (miniWin && !miniWin.isDestroyed() && miniCurrent === data) {
          miniWin.webContents.send('mini:title', t);
        }
      });
    });
  }

  function closeMini() {
    if (miniWin && !miniWin.isDestroyed()) miniWin.close();
  }

  function openPlayerWindow(items, startId) {
    if (playerWin && !playerWin.isDestroyed()) {
      playerWin.webContents.send('player:list', { items, startId });
      playerWin.show();
      playerWin.focus();
      return;
    }
    playerWin = new BrowserWindow({
      width: 960,
      height: 640,
      minWidth: 720,
      minHeight: 480,
      title: 'Reproductor',
      backgroundColor: '#12141c',
      icon: iconPath,
      webPreferences: { contextIsolation: true, preload: preloadPath },
    });
    playerWin.loadFile(path.join(__dirname, '..', 'renderer', 'player', 'player.html'));
    playerWin.webContents.on('did-finish-load', () => {
      playerWin.webContents.send('player:list', { items, startId });
    });
    playerWin.on('closed', () => { playerWin = null; });
  }

  function createMainWindow() {
    mainWin = new BrowserWindow({
      width: 540,
      height: 780,
      minWidth: 440,
      minHeight: 620,
      backgroundColor: '#12141c',
      title: 'Mora Downloader',
      icon: iconPath,
      webPreferences: { contextIsolation: true, preload: preloadPath },
    });
    mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'main', 'index.html'));
    mainWin.on('closed', () => { mainWin = null; });
  }

  function registerIpc() {
    ipcMain.handle('settings:get', () => settings.data);
    ipcMain.handle('settings:set', (_e, key, value) => {
      settings.set(key, value);
      if (key === 'enabled') {
        if (value) {
          watcher.start();
          handleExistingClipboard();
        } else {
          watcher.stop();
        }
      }
      return settings.data;
    });

    ipcMain.handle('dialog:pick-folder', async () => {
      const res = await dialog.showOpenDialog(mainWin, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (res.canceled || !res.filePaths.length) return null;
      settings.set('destination', res.filePaths[0]);
      ensureDirs();
      return res.filePaths[0];
    });

    ipcMain.handle('folder:create-new', async () => {
      const res = await dialog.showOpenDialog(mainWin, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Selecciona dónde crear la carpeta "Mora Música"',
      });
      if (res.canceled || !res.filePaths.length) return null;
      const folder = path.join(res.filePaths[0], 'Mora Música');
      fs.mkdirSync(folder, { recursive: true });
      settings.set('destination', folder);
      ensureDirs();
      return folder;
    });

    ipcMain.handle('folder:open', () => shell.openPath(settings.destination()));
    ipcMain.handle('folder:current', () => settings.destination());
    ipcMain.handle('space:check', () => library.freeSpace(ensureDirs()));

    ipcMain.handle('library:scan', () => library.scan(settings.destination()));
    ipcMain.handle('library:favorites', () => library.getFavorites());
    ipcMain.handle('library:favorite-toggle', (_e, id) => {
      const fav = library.toggleFavorite(id);
      return { id, fav };
    });
    ipcMain.handle('library:create-playlist', (_e, name) => library.createPlaylist(name));
    ipcMain.handle('library:rename-playlist', (_e, id, name) => library.renamePlaylist(id, name));
    ipcMain.handle('library:delete-playlist', (_e, id) => library.deletePlaylist(id));
    ipcMain.handle('library:add-to-playlist', (_e, pid, iid) => library.addToPlaylist(pid, iid));
    ipcMain.handle('library:remove-from-playlist', (_e, pid, iid) => library.removeFromPlaylist(pid, iid));
    ipcMain.handle('library:history', () => library.history);
    ipcMain.handle('library:clear-history', () => library.clearHistory());
    ipcMain.handle('library:playlists', () => library.playlists);

    ipcMain.handle('updater:check', () => checkUpdate(resourcePath('yt-dlp.exe')));

    ipcMain.handle('download:url', (_e, raw) => {
      const url = detectVideoUrl(String(raw || ''));
      if (!url) return { ok: false, reason: 'invalid' };
      startDownload({ url, playlist: false });
      return { ok: true };
    });
    ipcMain.handle('download:cancel', () => {
      queue.cancelCurrent();
      return true;
    });
    ipcMain.handle('download:active', () => ({
      running: queue.isRunning,
      pending: queue.size,
    }));

    ipcMain.handle('player:open', (_e, items, startId) => {
      openPlayerWindow(items, startId);
      return true;
    });

    ipcMain.handle('app:version', () => app.getVersion());

    ipcMain.on('mini:choose', (_e, format) => {
      const data = miniCurrent;
      miniCurrent = null;
      closeMini();
      if (data) startDownload({ url: data.url, playlist: data.playlist, format });
    });
    ipcMain.on('mini:ignore', () => {
      miniCurrent = null;
      closeMini();
    });

    ipcMain.on('window:minimize', () => mainWin && mainWin.minimize());
    ipcMain.on('window:close', () => mainWin && mainWin.close());
    ipcMain.on('mini:close', () => { miniCurrent = null; closeMini(); });
  }

  app.setAppUserModelId('com.mora.downloader');

  app.on('second-instance', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });

  app.whenReady().then(async () => {
    settings = new Settings(path.join(app.getPath('userData'), 'settings.json'), { defaultDestination });
    settings.load();

    downloader = new Downloader({
      ytDlpPath: resourcePath('yt-dlp.exe'),
      ffmpegPath: resourcePath('ffmpeg.exe'),
    });
    queue = new DownloadQueue();
    library = new LibraryStore(app.getPath('userData'), {
      ffprobePath: resourcePath('ffprobe.exe'),
    });
    watcher = new ClipboardWatcher({ onLink: handleLink });

    registerIpc();
    createMainWindow();

    const missing = ['yt-dlp.exe', 'ffmpeg.exe'].filter((f) => !fs.existsSync(resourcePath(f)));
    if (missing.length) {
      broadcast('toast', { key: 'missingBinaries', list: missing });
    }

    if (settings.get('enabled')) watcher.start();
    if (settings.get('checkUpdatesOnStart')) {
      setTimeout(async () => {
        const r = await checkUpdate(resourcePath('yt-dlp.exe'));
        broadcast('toast', { key: 'updateCheck', ok: r.ok, message: r.message });
      }, 2500);
    }
  });

  app.on('window-all-closed', () => app.quit());
}
