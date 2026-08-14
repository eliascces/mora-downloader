'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildArgs, outputSubdir, QUALITY_FILTERS } = require('../shared/formatArgs');

const BASE = { url: 'https://youtube.com/watch?v=abc', ffmpegPath: 'C:/ff/ffmpeg.exe', outputDir: 'D:/Musica/MP3', quality: '1080', format: 'mp3', playlist: false };

test('mp3: args de audio', () => {
  const args = buildArgs(BASE);
  assert.ok(args.includes('-x'));
  assert.ok(args.includes('--audio-format'));
  assert.ok(args.includes('mp3'));
  assert.ok(args.includes('--audio-quality'));
  assert.equal(args[args.indexOf('--audio-quality') + 1], '0');
});

test('mp3: no playlist por defecto', () => {
  const args = buildArgs(BASE);
  assert.ok(args.includes('--no-playlist'));
});

test('mp3: ruta de salida y ffmpeg', () => {
  const args = buildArgs(BASE);
  assert.ok(args.includes('D:/Musica/MP3/%(title)s.%(ext)s'));
  assert.ok(args.includes('C:/ff/ffmpeg.exe'));
});

test('video best: filtro sin límite + merge mp4', () => {
  const args = buildArgs({ ...BASE, format: 'video', quality: 'best' });
  assert.equal(args[args.indexOf('-f') + 1], 'bv*+ba/b');
  assert.ok(args.includes('--merge-output-format'));
  assert.ok(args.includes('mp4'));
  assert.ok(args.includes('--remux-video'));
});

test('video 1080: filtro con límite', () => {
  const args = buildArgs({ ...BASE, format: 'video', quality: '1080' });
  assert.equal(args[args.indexOf('-f') + 1], 'bv*[height<=1080]+ba/b');
});

test('video 720: filtro con límite', () => {
  const args = buildArgs({ ...BASE, format: 'video', quality: '720' });
  assert.equal(args[args.indexOf('-f') + 1], 'bv*[height<=720]+ba/b');
});

test('video calidad desconocida → best', () => {
  const args = buildArgs({ ...BASE, format: 'video', quality: '9999' });
  assert.equal(args[args.indexOf('-f') + 1], QUALITY_FILTERS.best);
});

test('playlist: --yes-playlist', () => {
  const args = buildArgs({ ...BASE, playlist: true });
  assert.ok(args.includes('--yes-playlist'));
  assert.ok(!args.includes('--no-playlist'));
});

test('último arg es la URL', () => {
  const args = buildArgs(BASE);
  assert.equal(args[args.length - 1], BASE.url);
});

test('denoPath añade --js-runtimes deno:<path>', () => {
  const args = buildArgs({ ...BASE, denoPath: 'C:/rt/deno.exe' });
  assert.ok(args.includes('--js-runtimes'));
  assert.ok(args.includes('deno:C:/rt/deno.exe'));
});

test('sin denoPath no añade --js-runtimes', () => {
  const args = buildArgs(BASE);
  assert.ok(!args.includes('--js-runtimes'));
});

test('cookiesFile añade --cookies <ruta>', () => {
  const args = buildArgs({ ...BASE, cookiesFile: 'C:/u/cookies.txt' });
  assert.ok(args.includes('--cookies'));
  assert.ok(args.includes('C:/u/cookies.txt'));
});

test('sin cookiesFile no añade --cookies', () => {
  const args = buildArgs(BASE);
  assert.ok(!args.includes('--cookies'));
});

test('outputSubdir', () => {
  assert.equal(outputSubdir('mp3'), 'MP3');
  assert.equal(outputSubdir('video'), 'Videos');
});
