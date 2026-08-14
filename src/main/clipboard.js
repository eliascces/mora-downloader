'use strict';

const { clipboard } = require('electron');
const { detectVideoUrl, isPlaylistUrl } = require('../shared/links');

class ClipboardWatcher {
  constructor({ interval = 1000, onLink, onChanged } = {}) {
    this.intervalMs = interval;
    this.onLink = onLink;
    this.onChanged = onChanged;
    this.timer = null;
    this.lastText = null;
  }

  start() {
    if (this.timer) return;
    this.lastText = clipboard.readText();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get running() {
    return !!this.timer;
  }

  tick() {
    const text = clipboard.readText();
    if (text === this.lastText) return;
    this.lastText = text;
    if (this.onChanged) this.onChanged(text);
    const url = detectVideoUrl(text);
    if (url && this.onLink) {
      this.onLink({ url, playlist: isPlaylistUrl(url) });
    }
  }

  checkNow() {
    const text = clipboard.readText();
    this.lastText = text;
    const url = detectVideoUrl(text);
    return url ? { url, playlist: isPlaylistUrl(url), text } : null;
  }
}

module.exports = ClipboardWatcher;
