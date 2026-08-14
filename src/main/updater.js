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

module.exports = { checkUpdate };
