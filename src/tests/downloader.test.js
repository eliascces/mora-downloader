'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseProgress, mapError, resourcePath } = require('../main/downloader');

test('parseProgress: extrae porcentajes', () => {
  const seen = [];
  const buffer = [
    '[download] Destination: D:/x/title.mp4',
    '[download]  12.4% of 3.41MiB at 1.2MiB/s',
    '[download]  45.0% of 3.41MiB at 1.5MiB/s',
    '',
  ].join('\n');
  parseProgress(buffer, (p) => seen.push(p));
  assert.ok(seen.includes(12.4));
  assert.ok(seen.includes(45.0));
});

test('parseProgress: sin progreso no llama callback', () => {
  let called = false;
  parseProgress('[download] Destination: x\nERROR algo', () => { called = true; });
  assert.equal(called, false);
});

test('mapError: URL no soportada', () => {
  const err = mapError('ERROR: Unsupported URL: https://example.com/foo', 1);
  assert.equal(err.code, 'UNSUPPORTED');
});

test('mapError: video privado', () => {
  const err = mapError('ERROR: This video is a private video', 1);
  assert.equal(err.code, 'PRIVATE');
});

test('mapError: age restricted', () => {
  const err = mapError('ERROR: Sign in to confirm your age', 1);
  assert.equal(err.code, 'AGE');
});

test('mapError: login required', () => {
  const err = mapError('ERROR: Sign in to watch this video', 1);
  assert.equal(err.code, 'LOGIN');
});

test('mapError: ya descargado', () => {
  const err = mapError('[download] title.mp4 has already been downloaded', 0);
  assert.equal(err.code, 'EXISTS');
});

test('mapError: genérico', () => {
  const err = mapError('ERROR: algo salió mal', 1);
  assert.equal(err.code, 'ERROR');
  assert.ok(err.message);
});

test('resourcePath: devuelve ruta no vacía', () => {
  const p = resourcePath('yt-dlp.exe');
  assert.ok(typeof p === 'string' && p.length > 0);
});
