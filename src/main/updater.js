'use strict';

const { spawn } = require('child_process');

function checkUpdate(ytDlpPath, { timeoutMs = 90000 } = {}) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(ytDlpPath, ['-U'], { windowsHide: true });
    } catch {
      return resolve({ ok: false, message: 'No se pudo ejecutar yt-dlp.' });
    }
    let out = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch {}
    }, timeoutMs);
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => { clearTimeout(timer); resolve({ ok: false, message: 'No se pudo ejecutar yt-dlp.' }); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const msg = out.trim() || (code === 0 ? 'yt-dlp está actualizado.' : `Código de salida ${code}`);
      resolve({ ok: code === 0, message: msg });
    });
  });
}

const APP_REPO = 'eliascces/mora-downloader';
const RELEASES_URL = `https://github.com/${APP_REPO}/releases`;

async function checkAppUpdate(currentVersion, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'mora-downloader' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      if (res.status === 404) return { ok: true, hasUpdate: false, message: 'Sin releases todavía' };
      return { ok: false, message: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    const current = String(currentVersion || '').replace(/^v/, '');
    const hasUpdate = !!latest && latest !== current;
    return {
      ok: true,
      hasUpdate,
      latest,
      current,
      url: data.html_url || RELEASES_URL,
      message: hasUpdate ? `Nueva versión ${latest}` : 'Estás al día',
    };
  } catch {
    clearTimeout(timer);
    return { ok: false, message: 'Sin conexión a GitHub' };
  }
}

module.exports = { checkUpdate, checkAppUpdate };
