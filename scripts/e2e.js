'use strict';

const fs = require('fs');
const path = require('path');

const { Downloader, resourcePath } = require('../src/main/downloader');
const DownloadQueue = require('../src/main/queue');
const { LibraryStore } = require('../src/main/library');
const { checkUpdate } = require('../src/main/updater');

const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const ROOT = path.join(__dirname, '..');
const TMP = path.join(__dirname, '..', '.tmp-e2e');
const userData = path.join(TMP, 'userdata');

let failures = 0;
function ok(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

function subOut(dir, format) {
  const sub = format === 'video' ? 'Videos' : 'MP3';
  const p = path.join(dir, sub);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  const dest = path.join(TMP, 'dest');
  const d = new Downloader({ ytDlpPath: resourcePath('yt-dlp.exe'), ffmpegPath: resourcePath('ffmpeg.exe') });
  const lib = new LibraryStore(userData, { ffprobePath: resourcePath('ffprobe.exe') });

  console.log('yt-dlp (dev path):', resourcePath('yt-dlp.exe'));
  ok(fs.existsSync(resourcePath('yt-dlp.exe')), 'binarios presentes (dev path)');

  // 1) getTitle real
  const title = await d.getTitle(TEST_URL, 15000);
  ok(!!title, `getTitle real: "${title}"`);

  // 2) checkUpdate real
  const upd = await checkUpdate(resourcePath('yt-dlp.exe'), { timeoutMs: 120000 });
  ok(upd.ok !== undefined, `checkUpdate: ok=${upd.ok} msg="${upd.message.slice(0, 60)}"`);

  // 3) descarga MP3 real
  await d.download({ url: TEST_URL, format: 'mp3', quality: 'best', playlist: false, outputDir: subOut(dest, 'mp3'), onProgress: (p) => { if (p.pct % 50 === 0) console.log(`   ...mp3 ${p.pct}%`); } });
  const mp3Files = fs.existsSync(path.join(dest, 'MP3')) ? fs.readdirSync(path.join(dest, 'MP3')) : [];
  ok(mp3Files.length > 0, `MP3 descargado: ${mp3Files.length} archivo(s) -> ${mp3Files.join(', ')}`);

  // 3b) descarga video 480p real
  await d.download({ url: TEST_URL, format: 'video', quality: '480p', playlist: false, outputDir: subOut(dest, 'video') });
  const vidFiles = fs.existsSync(path.join(dest, 'Videos')) ? fs.readdirSync(path.join(dest, 'Videos')) : [];
  ok(vidFiles.length > 0, `Video descargado: ${vidFiles.length} archivo(s) -> ${vidFiles.join(', ')}`);

  // 4) cola + library.scan integrados
  const q = new DownloadQueue();
  let done = 0;
  q.onEnd = () => { done++; };
  await q.add({ id: 'e', url: TEST_URL, format: 'mp3', playlist: false, run: () => d.download({ url: TEST_URL, format: 'mp3', quality: 'best', playlist: false, outputDir: subOut(dest, 'mp3') }) });
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