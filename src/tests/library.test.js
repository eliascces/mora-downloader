'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { LibraryStore, idOf } = require('../main/library');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mora-lib-'));
}

function seed(dir) {
  const mp3 = path.join(dir, 'MP3');
  const vid = path.join(dir, 'Videos');
  fs.mkdirSync(mp3, { recursive: true });
  fs.mkdirSync(vid, { recursive: true });
  fs.writeFileSync(path.join(mp3, 'Cancion Uno.mp3'), 'x');
  fs.writeFileSync(path.join(mp3, 'Cancion Dos.mp3'), 'yy');
  fs.writeFileSync(path.join(vid, 'Video Clip.mp4'), 'zzz');
  fs.writeFileSync(path.join(vid, 'ignored.txt'), 'no');
}

test('scan encuentra MP3 y videos, ignora otros', () => {
  const root = tmpDir();
  seed(root);
  const store = new LibraryStore(path.join(root, 'data'));
  const items = store.scan(root);
  assert.equal(items.length, 3);
  const mp3s = items.filter((i) => i.format === 'audio');
  const vids = items.filter((i) => i.format === 'video');
  assert.equal(mp3s.length, 2);
  assert.equal(vids.length, 1);
  assert.equal(mp3s[0].ext, 'mp3');
});

test('favoritos: toggle y persistencia', () => {
  const root = tmpDir();
  seed(root);
  const dataDir = path.join(root, 'data');
  const store = new LibraryStore(dataDir);
  const items = store.scan(root);
  const id = items[0].id;

  assert.equal(store.isFavorite(id), false);
  assert.equal(store.toggleFavorite(id), true);
  assert.equal(store.isFavorite(id), true);
  assert.equal(store.toggleFavorite(id), false);

  const store2 = new LibraryStore(dataDir);
  store2.loadAll();
  assert.equal(store2.isFavorite(id), false);
});

test('playlists: crear, añadir, renombrar, eliminar', () => {
  const root = tmpDir();
  seed(root);
  const dataDir = path.join(root, 'data');
  const store = new LibraryStore(dataDir);
  const items = store.scan(root);

  const pl = store.createPlaylist('  Gimnasio  ');
  assert.equal(pl.name, 'Gimnasio');

  store.addToPlaylist(pl.id, items[0].id);
  store.addToPlaylist(pl.id, items[1].id);
  store.addToPlaylist(pl.id, items[1].id); // duplicado ignorado
  assert.equal(store.getPlaylistItems(pl.id).length, 2);

  const renamed = store.renamePlaylist(pl.id, 'Gym');
  assert.equal(renamed.name, 'Gym');

  store.removeFromPlaylist(pl.id, items[0].id);
  assert.equal(store.getPlaylistItems(pl.id).length, 1);

  store.deletePlaylist(pl.id);
  assert.equal(store.playlists.length, 0);
});

test('playlists: no añade si la playlist no existe', () => {
  const store = new LibraryStore(tmpDir());
  const pl = store.addToPlaylist('no-existe', 'abc');
  assert.equal(pl, undefined);
});

test('pruneOrphans: elimina referencias a archivos borrados', () => {
  const root = tmpDir();
  seed(root);
  const store = new LibraryStore(path.join(root, 'data'));
  const items = store.scan(root);
  const id = items[0].id;

  store.toggleFavorite(id);
  const pl = store.createPlaylist('Mi lista');
  store.addToPlaylist(pl.id, id);
  assert.equal(store.favorites.length, 1);

  fs.rmSync(items[0].path);
  const items2 = store.scan(root);
  assert.equal(items2.length, 2);
  assert.equal(store.favorites.length, 0);
  assert.equal(store.getPlaylistItems(pl.id).length, 0);
});

test('historial: add y límite', () => {
  const root = tmpDir();
  const store = new LibraryStore(root);
  for (let i = 0; i < 250; i++) {
    store.addHistory({ url: `https://youtu.be/${i}`, platform: 'YouTube', format: 'mp3', status: 'ok' });
  }
  assert.ok(store.history.length <= 200);
  assert.equal(store.history[0].url, 'https://youtu.be/249');
  store.clearHistory();
  assert.equal(store.history.length, 0);
});

test('freeSpace: devuelve número en disco existente, null si no existe', () => {
  const root = tmpDir();
  const store = new LibraryStore(path.join(root, 'data'));
  assert.ok(typeof store.freeSpace(root) === 'number');
  assert.equal(store.freeSpace(path.join(root, 'no-existe')), null);
});

test('idOf: estable y estable', () => {
  assert.equal(idOf('A'), idOf('a'));
  assert.equal(idOf('A').length, 16);
  assert.notEqual(idOf('A'), idOf('B'));
});
