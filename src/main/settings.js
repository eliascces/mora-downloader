'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  language: 'es',
  enabled: false,
  downloadFormat: 'mp3',
  videoQuality: '1080',
  destination: '',
  playlistMode: false,
  askFormatWhenHidden: true,
  checkUpdatesOnStart: true,
  cookieFile: '',
};

class Settings {
  constructor(file, { defaultDestination } = {}) {
    this.file = file;
    this.defaultDestinationFn = defaultDestination || (() => '');
    this.data = { ...DEFAULTS };
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...DEFAULTS, ...parsed };
    } catch {
      this.save();
    }
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {
      /* ignore write errors */
    }
  }

  destination() {
    return this.data.destination || this.defaultDestinationFn();
  }

  static validateFormat(fmt) {
    return fmt === 'mp3' || fmt === 'video' ? fmt : 'mp3';
  }
}

module.exports = { Settings, DEFAULTS };
