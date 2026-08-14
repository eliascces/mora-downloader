'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectVideoUrl,
  makeKey,
  isPlaylistUrl,
  getPlatform,
  normalizeUrl,
  extractCandidate,
} = require('../shared/links');

test('detectVideoUrl: YouTube largo', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.equal(detectVideoUrl(url), url);
});

test('detectVideoUrl: youtu.be corto', () => {
  assert.equal(detectVideoUrl('Mira esto: https://youtu.be/dQw4w9WgXcQ'), 'https://youtu.be/dQw4w9WgXcQ');
});

test('detectVideoUrl: fb.watch', () => {
  assert.equal(detectVideoUrl('https://fb.watch/abc123/'), 'https://fb.watch/abc123/');
});

test('detectVideoUrl: Facebook', () => {
  assert.equal(
    detectVideoUrl('https://www.facebook.com/watch?v=123456'),
    'https://www.facebook.com/watch?v=123456',
  );
});

test('detectVideoUrl: TikTok', () => {
  assert.equal(detectVideoUrl('https://www.tiktok.com/@user/video/7123456789012345678'), 'https://www.tiktok.com/@user/video/7123456789012345678');
});

test('detectVideoUrl: Instagram', () => {
  assert.equal(detectVideoUrl('https://www.instagram.com/reel/CxYzAbCdEf/'), 'https://www.instagram.com/reel/CxYzAbCdEf/');
});

test('detectVideoUrl: texto plano sin link → null', () => {
  assert.equal(detectVideoUrl('hola como estas'), null);
});

test('detectVideoUrl: texto vacío → null', () => {
  assert.equal(detectVideoUrl(''), null);
  assert.equal(detectVideoUrl(null), null);
  assert.equal(detectVideoUrl(undefined), null);
});

test('detectVideoUrl: dominio no soportado → null', () => {
  assert.equal(detectVideoUrl('https://example.com/foo'), null);
});

test('detectVideoUrl: URL con puntuación final', () => {
  assert.equal(detectVideoUrl('Descarga: https://youtu.be/abcXYZ. ¡ya!'), 'https://youtu.be/abcXYZ');
});

test('detectVideoUrl: URL con parámetros de seguimiento', () => {
  const url = 'https://www.youtube.com/watch?v=abc123&t=42s&utm_source=test';
  assert.equal(detectVideoUrl(url), url);
});

test('detectVideoUrl: URL sin esquema pero host conocido', () => {
  assert.equal(detectVideoUrl('www.youtube.com/watch?v=abc123'), 'https://www.youtube.com/watch?v=abc123');
});

test('normalizeUrl: añade esquema', () => {
  assert.equal(normalizeUrl('youtu.be/abc'), 'https://youtu.be/abc');
});

test('extractCandidate: múltiples links toma el primero', () => {
  assert.equal(extractCandidate('https://a.com/1 https://b.com/2'), 'https://a.com/1');
});

test('makeKey: ignora query y fragment', () => {
  const a = makeKey('https://www.youtube.com/watch?v=abc&t=42');
  const b = makeKey('https://youtube.com/watch?v=abc&t=999');
  assert.equal(a, b);
});

test('makeKey: videos distintos → claves distintas', () => {
  assert.notEqual(makeKey('https://youtube.com/watch?v=abc'), makeKey('https://youtube.com/watch?v=def'));
});

test('isPlaylistUrl: watch con list → true', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=abc&list=PL123'), true);
});

test('isPlaylistUrl: playlist ruta → true', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/playlist?list=PL123'), true);
});

test('isPlaylistUrl: mix youtu.be → true', () => {
  assert.equal(isPlaylistUrl('https://youtu.be/abc?list=PL123'), true);
});

test('isPlaylistUrl: video normal → false', () => {
  assert.equal(isPlaylistUrl('https://www.youtube.com/watch?v=abc'), false);
  assert.equal(isPlaylistUrl('https://www.facebook.com/watch?v=1'), false);
});

test('getPlatform: youtube', () => {
  assert.equal(getPlatform('https://youtu.be/abc'), 'YouTube');
});

test('getPlatform: facebook', () => {
  assert.equal(getPlatform('https://fb.watch/abc'), 'Facebook');
});

test('getPlatform: x.com', () => {
  assert.equal(getPlatform('https://x.com/user/status/123'), 'X / Twitter');
});

test('getPlatform: host desconocido', () => {
  assert.equal(getPlatform('https://example.com/x'), 'example.com');
});
