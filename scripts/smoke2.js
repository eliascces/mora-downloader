'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const root = path.join(__dirname, '..');
const preload = path.join(root, 'src', 'main', 'preload.js');

function errsOf(w) {
  const errors = [];
  w.webContents.on('console-message', (e) => {
    if (e.level >= 2 || /error/i.test(String(e.message))) {
      errors.push(`L${e.level}: ${e.message}`);
    }
  });
  w.webContents.on('preload-error', (_e, _p, err) => errors.push(`PRELOAD: ${err.message}`));
  w.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`FAIL ${code} ${desc} ${url}`));
  return errors;
}

app.on('window-all-closed', () => {});

ipcMain.handle('app:version', () => '1.0.0');
ipcMain.handle('settings:get', () => ({}));
ipcMain.handle('folder:current', () => 'C:/tmp');
ipcMain.handle('space:check', () => 1000);
ipcMain.handle('library:history', () => []);
ipcMain.handle('library:scan', () => []);
ipcMain.handle('library:favorites', () => []);
ipcMain.handle('library:playlists', () => []);
ipcMain.handle('download:active', () => []);

app.whenReady().then(async () => {
  const win = () => new BrowserWindow({
    width: 540, height: 780, show: false,
    webPreferences: { contextIsolation: true, preload },
  });

  // main
  const m = win();
  const me = errsOf(m);
  await m.loadFile(path.join(root, 'src', 'renderer', 'main', 'index.html'));
  await new Promise((r) => setTimeout(r, 500));
  m.destroy();

  // mini
  const mi = win();
  const mie = errsOf(mi);
  await mi.loadFile(path.join(root, 'src', 'renderer', 'mini', 'mini.html'));
  mi.webContents.send('mini:data', {
    url: 'https://www.youtube.com/watch?v=abc123', playlist: false, initial: false,
    lastFormat: 'mp3', language: 'es',
  });
  mi.webContents.send('mini:title', 'Video de prueba');
  await new Promise((r) => setTimeout(r, 400));
  mi.destroy();

  // player
  const p = win();
  const pe = errsOf(p);
  await p.loadFile(path.join(root, 'src', 'renderer', 'player', 'player.html'));
  p.webContents.send('player:list', {
    items: [
      { id: 'a', path: 'C:/x/video.mp4', name: 'Video Uno', format: 'video', duration: 120 },
      { id: 'b', path: 'C:/x/cancion.mp3', name: 'Cancion Uno', format: 'audio', duration: 200 },
    ],
    startId: 'a',
  });
  await new Promise((r) => setTimeout(r, 400));
  p.destroy();

  console.log('main:', JSON.stringify(me));
  console.log('mini:', JSON.stringify(mie));
  console.log('player:', JSON.stringify(pe));
  app.exit(me.length || mie.length || pe.length ? 1 : 0);
});