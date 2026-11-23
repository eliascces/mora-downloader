'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  isTikTokPhotoUrl,
  isTikTokUrl,
  sanitizeFilename,
  readCookieHeader,
  parsePhotoPage,
  buildVideoArgs,
} = require('../main/tiktok-photo');

function photoPage(itemStruct) {
  return `<html><body><script id="api-data" type="application/json">${
    JSON.stringify({ videoDetail: { itemInfo: { itemStruct } } })
  }</script></body></html>`;
}

test('isTikTokPhotoUrl: detecta publicaciones de imagen', () => {
  assert.equal(
    isTikTokPhotoUrl('https://www.tiktok.com/@user/photo/7704482874849840391'),
    true,
  );
  assert.equal(
    isTikTokPhotoUrl('https://m.tiktok.com/@user/photo/7704482874849840391?is_from_webapp=1'),
    true,
  );
  assert.equal(
    isTikTokPhotoUrl('https://www.tiktok.com/@user/video/7704482874849840391'),
    false,
  );
  assert.equal(isTikTokPhotoUrl('https://example.com/@user/photo/1'), false);
});

test('isTikTokUrl: reconoce dominios de TikTok', () => {
  assert.equal(isTikTokUrl('https://www.tiktok.com/@user/video/1'), true);
  assert.equal(isTikTokUrl('https://tiktok.com/@user/video/1'), true);
  assert.equal(isTikTokUrl('https://notiktok.com/@user/video/1'), false);
});

test('sanitizeFilename: quita caracteres inválidos y espacios sobrantes', () => {
  assert.equal(sanitizeFilename('  hola/mundo: "x"  '), 'hola mundo x');
  assert.equal(sanitizeFilename('fin...  '), 'fin');
  assert.equal(sanitizeFilename(''), 'TikTok');
});

test('sanitizeFilename: evita nombres reservados de Windows', () => {
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('lpt1'), '_lpt1');
});

test('sanitizeFilename: recorta nombres largos', () => {
  const out = sanitizeFilename('a'.repeat(300));
  assert.equal(out.length, 90);
});

test('readCookieHeader: extrae solo cookies de tiktok.com', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mora-cookies-')), 'cookies.txt');
  fs.writeFileSync(file, [
    '# Netscape HTTP Cookie File',
    '.tiktok.com\tTRUE\t/\tTRUE\t0\tsessionid\tabc123',
    '.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tzzz',
    '.tiktok.com\tTRUE\t/\tFALSE\t0\tttwid\tdef456',
    '',
  ].join('\n'));
  assert.equal(readCookieHeader(file), 'sessionid=abc123; ttwid=def456');
  assert.equal(readCookieHeader(''), '');
});

test('parsePhotoPage: extrae imágenes, música y título', () => {
  const html = photoPage({
    id: '7704482874849840391',
    desc: '  mi publicación #fyp  ',
    author: { uniqueId: 'koneko' },
    imagePost: {
      images: [
        { imageURL: { urlList: ['https://cdn.example/a.jpg', 'https://cdn.example/a2.jpg'] } },
        { imageURL: { urlList: ['https://cdn.example/b.jpg'] } },
      ],
    },
    music: { playUrl: 'https://cdn.example/music.mp3', duration: 17 },
  });
  const post = parsePhotoPage(html);
  assert.equal(post.id, '7704482874849840391');
  assert.equal(post.title, 'mi publicación #fyp');
  assert.equal(post.author, 'koneko');
  assert.deepEqual(post.images, [
    ['https://cdn.example/a.jpg', 'https://cdn.example/a2.jpg'],
    ['https://cdn.example/b.jpg'],
  ]);
  assert.equal(post.music, 'https://cdn.example/music.mp3');
  assert.equal(post.musicDuration, 17);
});

test('parsePhotoPage: sin imagenPost devuelve null', () => {
  const html = photoPage({ id: '1', desc: 'video', video: { playAddr: 'https://x/v.mp4' } });
  assert.equal(parsePhotoPage(html), null);
});

test('parsePhotoPage: html sin api-data o JSON inválido devuelve null', () => {
  assert.equal(parsePhotoPage('<html></html>'), null);
  assert.equal(parsePhotoPage('<script id="api-data">{nope</script>'), null);
});

test('buildVideoArgs: una imagen con música', () => {
  const args = buildVideoArgs({
    images: ['C:/tmp/a.jpg'],
    music: 'C:/tmp/m.mp3',
    duration: 17,
    out: 'C:/out/video.mp4',
  });
  assert.ok(args.includes('-loop'));
  assert.ok(args.includes('-shortest'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.equal(args[args.length - 1], 'C:/out/video.mp4');
  assert.equal(args.filter((a) => a === '-i').length, 2);
});

test('buildVideoArgs: una imagen sin música usa duración por defecto', () => {
  const args = buildVideoArgs({
    images: ['C:/tmp/a.jpg'],
    music: null,
    duration: 0,
    out: 'C:/out/video.mp4',
  });
  const t = args.indexOf('-t');
  assert.ok(t >= 0);
  assert.equal(args[t + 1], '5');
  assert.ok(!args.includes('-shortest'));
});

test('buildVideoArgs: carrusel concatena y mapea el audio', () => {
  const images = ['C:/tmp/1.jpg', 'C:/tmp/2.jpg', 'C:/tmp/3.jpg'];
  const args = buildVideoArgs({
    images,
    music: 'C:/tmp/m.mp3',
    duration: 9,
    out: 'C:/out/video.mp4',
  });
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.match(fc, /concat=n=3:v=1:a=0\[v\]/);
  assert.ok(fc.includes('[v0]') && fc.includes('[v2]'));
  assert.ok(args.includes('3:a'));
  assert.equal(args.filter((a) => a === '-loop').length, 3);
});
