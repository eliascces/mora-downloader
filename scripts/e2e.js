'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { Downloader, resourcePath } = require('../src/main/downloader');
const DownloadQueue = require('../src/main/queue');
const { LibraryStore } = require('../src/main/library');
const { checkUpdate } = require('../src/main/updater');

const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const EXTERNAL_CODES = new Set(['LOGIN', 'NETWORK', 'PRIVATE', 'AGE', 'NOVIEW']);
const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, '.tmp-e2e');
const userData = path.join(TMP, 'userdata');

let failures = 0;
function ok(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}
function warn(label) {
  console.log(`WARN  ${label}`);
}

function subOut(dir, format) {
  const sub = format === 'video' ? 'Videos' : 'MP3';
  const p = path.join(dir, sub);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function seedWithFfmpeg(dest) {
  const ffmpeg = resourcePath('ffmpeg.exe');
  const mp3 = path.join(subOut(dest, 'mp3'), 'seed tono.mp3');
  const mp4 = path.join(subOut(dest, 'video'), 'seed video.mp4');
  const mk = (args) => spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { windowsHide: true });
  mk(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', mp3]);
  mk(['-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4]);
  return { mp3, mp4 };
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  const dest = path.join(TMP, 'dest');
  const d = new Downloader({ ytDlpPath: resourcePath('yt-dlp.exe'), ffmpegPath: resourcePath('ffmpeg.exe') });
  const lib = new LibraryStore(userData, { ffprobePath: resourcePath('ffprobe.exe') });

  ok(fs.existsSync(resourcePath('yt-dlp.exe')), 'binarios presentes (dev path)');

  // 1) getTitle real
  const title = await d.getTitle(TEST_URL, 15000);
  if (title) ok(true, `getTitle real: "${title}"`);
  else warn('getTitle no disponible (posible bot-check externo)');

  // 2) checkUpdate real
  const upd = await checkUpdate(resourcePath('yt-dlp.exe'), { timeoutMs: 120000 });
  ok(upd.ok !== undefined, `checkUpdate: ok=${upd.ok}`);

  // 3) descargas reales (tolerantes a bloqueos externos)
  let realMp3 = false;
  let realVideo = false;
  const tryReal = async (format, quality) => {
    try {
      await d.download({
        url: TEST_URL, format, quality, playlist: false,
        outputDir: subOut(dest, format),
        onProgress: (p) => { if (p.pct % 50 === 0) console.log(`   ...${format} ${p.pct}%`); },
      });
      return true;
    } catch (e) {
      const code = (e && e.code) || 'ERROR';
      if (EXTERNAL_CODES.has(code)) {
        warn(`descarga real ${format} bloqueada externamente (${code})`);
        return false;
      }
      throw e;
    }
  };
  realMp3 = await tryReal('mp3', 'best');
  realVideo = await tryReal('video', '480p');

  if (!realMp3 && !realVideo) {
    const seeded = seedWithFfmpeg(dest);
    ok(fs.existsSync(seeded.mp3), `seed mp3 con ffmpeg`);
    ok(fs.existsSync(seeded.mp4), `seed video con ffmpeg`);
  }

  const listDir = (format) => (fs.existsSync(path.join(dest, format === 'video' ? 'Videos' : 'MP3'))
    ? fs.readdirSync(path.join(dest, format === 'video' ? 'Videos' : 'MP3'))
    : []);
  ok(listDir('mp3').length > 0, `MP3: ${listDir('mp3').length} archivo(s)`);
  ok(listDir('video').length > 0, `Video: ${listDir('video').length} archivo(s)`);

  // 4) cola + library.scan integrados
  const q = new DownloadQueue();
  let done = 0;
  q.onEnd = () => { done++; };
  await q.add({
    id: 'e', url: TEST_URL, format: 'mp3', playlist: false,
    run: () => d.download({ url: TEST_URL, format: 'mp3', quality: 'best', playlist: false, outputDir: subOut(dest, 'mp3') }),
  });
  ok(done === 1, `cola procesa 1 trabajo (done=${done})`);
  const items = lib.scan(dest);
  ok(items.length >= 2, `lib.scan encuentra ${items.length} item(s)`);
  ok(items.some((i) => i.format === 'audio') && items.some((i) => i.format === 'video'), 'items incluyen audio y video');

  // 5) libre espacio
  ok(typeof lib.freeSpace(dest) === 'number', 'freeSpace devuelve número');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures === 0 ? '\nE2E TODO OK' : `\nE2E CON ${failures} FALLOS`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('E2E ERROR:', e); process.exit(2); });