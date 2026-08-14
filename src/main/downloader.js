'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROGRESS_RE = /^\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+([\d.]+\s?[A-Za-z]+))?(?:\s+at\s+(\S+?)\s+ETA\s+(\S+))?/;

function exists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resourcePath(filename) {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', filename) : null,
    path.join(__dirname, '..', '..', 'assets', 'resources', filename),
  ].filter(Boolean);
  for (const c of candidates) {
    if (exists(c)) return c;
  }
  return candidates[0] || filename;
}

class Downloader {
  constructor({ ytDlpPath, ffmpegPath, denoPath, cookiesFile }) {
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.denoPath = denoPath && exists(denoPath) ? denoPath : null;
    this.cookiesFile = cookiesFile && exists(cookiesFile) ? cookiesFile : null;
  }

  download(job) {
    const { url, format, quality, playlist, outputDir, onProgress } = job;
    const buildArgs = require('../shared/formatArgs').buildArgs;
    const args = buildArgs({
      url,
      format,
      quality,
      playlist,
      ffmpegPath: this.ffmpegPath,
      outputDir,
      denoPath: this.denoPath,
      cookiesFile: this.cookiesFile,
    });

    return new Promise((resolve, reject) => {
      let proc;
      try {
        proc = spawn(this.ytDlpPath, args, { windowsHide: true });
      } catch (err) {
        return reject({ code: 'SPAWN', message: String((err && err.message) || err) });
      }

      let buffer = '';
      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        parseProgress(buffer, (pct) => onProgress && onProgress(pct));
      });
      proc.stderr.on('data', (chunk) => {
        buffer += chunk.toString();
      });
      proc.on('error', (err) => reject({ code: 'SPAWN', message: String((err && err.message) || err) }));
      proc.on('close', (code) => {
        if (code === 0) {
          const skipped = /has already been downloaded/i.test(buffer);
          resolve({ outputDir, log: buffer, skipped });
        } else {
          reject(mapError(buffer, code));
        }
      });

      this._currentProc = proc;
    }).finally(() => {
      this._currentProc = null;
    });
  }

  getTitle(url, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const baseArgs = ['--print', '%(title)s', '--no-playlist', '--skip-download', '--socket-timeout', '5'];
      if (this.denoPath) {
        baseArgs.push('--js-runtimes', `deno:${this.denoPath}`);
      }
      if (this.cookiesFile) {
        baseArgs.push('--cookies', this.cookiesFile);
      }
      baseArgs.push(url);
      let proc;
      try {
        proc = spawn(this.ytDlpPath, baseArgs, { windowsHide: true });
      } catch {
        return resolve(null);
      }
      let out = '';
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        resolve(null);
      }, timeoutMs);
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('error', () => { clearTimeout(timer); resolve(null); });
      proc.on('close', () => {
        clearTimeout(timer);
        const title = out.trim().split(/\r?\n/)[0];
        resolve(title || null);
      });
    });
  }

  cancel() {
    if (this._currentProc) {
      try { this._currentProc.kill(); } catch {}
    }
  }
}

function parseProgress(buffer, cb) {
  const lines = buffer.split(/\r?\n/);
  for (const line of lines.slice(-3)) {
    const m = line.match(PROGRESS_RE);
    if (m) cb({ pct: parseFloat(m[1]), size: m[2] || null, speed: m[3] || null, eta: m[4] || null });
  }
}

function mapError(buffer, code) {
  const lines = buffer.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines.slice(-8).join('\n');
  const lower = last.toLowerCase();
  let ecode = 'ERROR';
  if (/unsupported url|is not a valid url|unable to extract/i.test(lower)) ecode = 'UNSUPPORTED';
  else if (/private video/i.test(lower)) ecode = 'PRIVATE';
  else if (/age[- ]restricted|confirm your age/i.test(lower)) ecode = 'AGE';
  else if (/login required|sign in/i.test(lower)) ecode = 'LOGIN';
  else if (/no such file|spawn/i.test(lower)) ecode = 'SPAWN';
  else if (/already been downloaded|has already been downloaded/i.test(lower)) ecode = 'EXISTS';
  else if (/requested format is not available|format not available/i.test(lower)) ecode = 'FORMAT';
  else if (/network is unreachable|timed out|connection/i.test(lower)) ecode = 'NETWORK';
  else if (/no video formats/i.test(lower)) ecode = 'NOVIEW';
  return { code: ecode, message: last || `Código de salida ${code}`, exitCode: code };
}

module.exports = { Downloader, parseProgress, mapError, resourcePath };
