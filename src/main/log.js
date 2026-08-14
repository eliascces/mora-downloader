'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024;

class Logger {
  constructor(dir) {
    this.file = path.join(dir, 'logs', 'app.log');
  }

  _write(level, msg) {
    try {
      const line = `[${new Date().toISOString()}] ${level} ${msg}\n`;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file) && fs.statSync(this.file).size > MAX_BYTES) {
        try { fs.renameSync(this.file, `${this.file}.old`); } catch { /* ignore */ }
      }
      fs.appendFileSync(this.file, line);
    } catch {
      /* nunca fallar por el log */
    }
  }

  info(msg) { this._write('INFO', msg); }
  warn(msg) { this._write('WARN', msg); }
  error(msg) { this._write('ERROR', msg); }
}

module.exports = { Logger };