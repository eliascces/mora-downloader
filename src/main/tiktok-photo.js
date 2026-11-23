'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// TikTok sirve la página con los datos del post solo a User-Agents móviles.
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PHOTO_RE = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[^/]+\/photo\/\d+/i;
const TIKTOK_RE = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\//i;
const MAX_IMAGE_WIDTH = 1080;

let abortController = null;
let ffmpegProc = null;

function isTikTokPhotoUrl(url) {
  return PHOTO_RE.test(String(url || ''));
}

function isTikTokUrl(url) {
  return TIKTOK_RE.test(String(url || ''));
}

function sanitizeFilename(name, max = 90) {
  let s = String(name || '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (s.length > max) s = s.slice(0, max).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  return s || 'TikTok';
}

function readCookieHeader(cookiesFile) {
  if (!cookiesFile) return '';
  try {
    const lines = fs.readFileSync(cookiesFile, 'utf8').split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length < 7) continue;
      const domain = parts[0].replace(/^\./, '');
      if (!/(^|\.)tiktok\.com$/i.test(domain)) continue;
      out.push(`${parts[5]}=${parts[6]}`);
    }
    return out.join('; ');
  } catch {
    return '';
  }
}

function parsePhotoPage(html) {
  const m = String(html || '').match(/<script id="api-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const item = data
    && data.videoDetail
    && data.videoDetail.itemInfo
    && data.videoDetail.itemInfo.itemStruct;
  if (!item || !item.imagePost || !Array.isArray(item.imagePost.images)) return null;
  const images = item.imagePost.images
    .map((im) => (im && im.imageURL && Array.isArray(im.imageURL.urlList)
      ? im.imageURL.urlList.filter(Boolean)
      : []))
    .filter((urls) => urls.length);
  if (!images.length) return null;
  const music = item.music || {};
  const musicUrl = music.playUrl
    || (Array.isArray(music.playUrlList) ? music.playUrlList.find(Boolean) : null);
  return {
    id: String(item.id || ''),
    title: String(item.desc || (item.imagePost && item.imagePost.title) || 'TikTok').trim(),
    author: (item.author && item.author.uniqueId) || '',
    images,
    music: musicUrl || null,
    musicDuration: Number(music.duration) > 0 ? Number(music.duration) : 0,
  };
}

async function fetchPhotoPost(url, { cookiesFile, signal } = {}) {
  const headers = {
    'User-Agent': MOBILE_UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
  };
  const cookie = readCookieHeader(cookiesFile);
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, { headers, redirect: 'follow', signal });
  if (!res.ok) {
    const code = res.status === 404 || res.status === 410 ? 'UNSUPPORTED' : 'NETWORK';
    throw Object.assign(new Error(`TikTok respondió HTTP ${res.status}`), { code });
  }
  return parsePhotoPage(await res.text());
}

async function downloadTo(urls, dest, { signal } = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  let lastErr = null;
  for (const url of list) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': MOBILE_UA, Referer: 'https://www.tiktok.com/' },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('respuesta vacía');
      fs.writeFileSync(dest, buf);
      return dest;
    } catch (err) {
      if (signal && signal.aborted) {
        throw Object.assign(new Error('Descarga cancelada'), { code: 'CANCELLED' });
      }
      lastErr = err;
    }
  }
  throw Object.assign(
    new Error(`No se pudo descargar el archivo: ${lastErr ? lastErr.message : 'sin URL'}`),
    { code: 'NETWORK' },
  );
}

function looksLikeMp3(buf) {
  return buf.length > 3
    && ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
      || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

function runFfmpeg(ffmpegPath, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(ffmpegPath, args, { windowsHide: true });
    } catch (err) {
      return reject(Object.assign(new Error(String((err && err.message) || err)), { code: 'SPAWN' }));
    }
    ffmpegProc = proc;
    let err = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
    }, 5 * 60 * 1000);
    const onAbort = () => { try { proc.kill(); } catch {} };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => {
      clearTimeout(timer);
      ffmpegProc = null;
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error(String((e && e.message) || e)), { code: 'SPAWN' }));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      ffmpegProc = null;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code === 0) return resolve();
      if (signal && signal.aborted) {
        return reject(Object.assign(new Error('Descarga cancelada'), { code: 'CANCELLED' }));
      }
      const msg = err.trim().split(/\r?\n/).slice(-3).join(' ').trim();
      reject(Object.assign(
        new Error(msg || `ffmpeg terminó con código ${code}`),
        { code: 'FFMPEG' },
      ));
    });
  });
}

function buildVideoArgs({ images, music, duration, out }) {
  const args = ['-y', '-loglevel', 'error'];
  if (images.length === 1) {
    args.push('-loop', '1', '-i', images[0]);
    if (music) args.push('-i', music);
    args.push(
      '-vf', `scale=${MAX_IMAGE_WIDTH}:-2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
    );
    if (music) {
      args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    } else {
      args.push('-t', String(Math.max(3, Math.min(15, duration || 5))));
    }
    args.push('-movflags', '+faststart', out);
    return args;
  }

  const per = Math.max(1.2, Math.min(10, (duration || images.length * 3) / images.length));
  for (const img of images) args.push('-loop', '1', '-t', per.toFixed(2), '-i', img);
  if (music) args.push('-i', music);
  const filters = images.map((_, i) => (
    `[${i}:v]scale=${MAX_IMAGE_WIDTH}:1920:force_original_aspect_ratio=decrease,`
    + `pad=${MAX_IMAGE_WIDTH}:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
  )).join(';');
  const concat = images.map((_, i) => `[v${i}]`).join('')
    + `concat=n=${images.length}:v=1:a=0[v]`;
  args.push('-filter_complex', `${filters};${concat}`, '-map', '[v]');
  if (music) args.push('-map', `${images.length}:a`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  if (music) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', out);
  return args;
}

async function saveMusic(post, out, { tempDir, signal, ffmpegPath }) {
  if (!post.music) {
    throw Object.assign(new Error('La publicación no tiene audio'), { code: 'NOVIEW' });
  }
  const tmp = path.join(tempDir, 'music.bin');
  await downloadTo([post.music], tmp, { signal });
  if (looksLikeMp3(fs.readFileSync(tmp))) {
    fs.copyFileSync(tmp, out);
    return;
  }
  await runFfmpeg(ffmpegPath, [
    '-y', '-loglevel', 'error', '-i', tmp, '-vn', '-c:a', 'libmp3lame', '-q:a', '0', out,
  ], { signal });
}

async function downloadPhotoPost({
  url, format, outputDir, ffmpegPath, cookiesFile, onTitle, onProgress,
} = {}) {
  abortController = new AbortController();
  const signal = abortController.signal;
  try {
    const post = await fetchPhotoPost(url, { cookiesFile, signal });
    if (!post) return null;
    if (onTitle && post.title) onTitle(post.title);

    fs.mkdirSync(outputDir, { recursive: true });
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const out = path.join(outputDir, `${sanitizeFilename(post.title)} [${post.id}].${ext}`);
    if (fs.existsSync(out)) {
      if (onProgress) onProgress({ pct: 100 });
      return { file: out, title: post.title, skipped: true };
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mora-photo-'));
    try {
      if (format === 'mp3') {
        if (onProgress) onProgress({ pct: 20 });
        await saveMusic(post, out, { tempDir, signal, ffmpegPath });
        if (onProgress) onProgress({ pct: 100 });
        return { file: out, title: post.title, skipped: false };
      }

      const images = [];
      for (let i = 0; i < post.images.length; i += 1) {
        const file = path.join(tempDir, `image-${i}.jpg`);
        await downloadTo(post.images[i], file, { signal });
        images.push(file);
        if (onProgress) {
          onProgress({ pct: 5 + Math.round(((i + 1) / post.images.length) * 50) });
        }
      }

      let music = null;
      if (post.music) {
        music = path.join(tempDir, 'music.bin');
        await downloadTo([post.music], music, { signal });
      }
      if (onProgress) onProgress({ pct: 70 });

      await runFfmpeg(ffmpegPath, buildVideoArgs({
        images, music, duration: post.musicDuration, out,
      }), { signal });
      if (onProgress) onProgress({ pct: 100 });
      return { file: out, title: post.title, skipped: false };
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  } finally {
    abortController = null;
  }
}

function cancel() {
  if (abortController) {
    try { abortController.abort(); } catch {}
  }
  if (ffmpegProc) {
    try { ffmpegProc.kill(); } catch {}
  }
}

module.exports = {
  isTikTokPhotoUrl,
  isTikTokUrl,
  sanitizeFilename,
  readCookieHeader,
  parsePhotoPage,
  fetchPhotoPost,
  buildVideoArgs,
  downloadPhotoPost,
  cancel,
};
