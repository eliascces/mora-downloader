'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Settings, DEFAULTS } = require('../main/settings');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mora-settings-'));
  return path.join(dir, 'settings.json');
}

test('defaults correctos', () => {
  const s = new Settings(tmpFile());
  assert.equal(s.get('language'), 'es');
  assert.equal(s.get('downloadFormat'), 'mp3');
  assert.equal(s.get('videoQuality'), '1080');
  assert.equal(s.get('enabled'), false);
});

test('set/get roundtrip y persistencia', () => {
  const file = tmpFile();
  const s1 = new Settings(file);
  s1.set('language', 'en');
  s1.set('downloadFormat', 'video');
  s1.set('videoQuality', '720');

  const s2 = new Settings(file);
  s2.load();
  assert.equal(s2.get('language'), 'en');
  assert.equal(s2.get('downloadFormat'), 'video');
  assert.equal(s2.get('videoQuality'), '720');
});

test('load con archivo corrupto → defaults y no lanza', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{{{not json');
  const s = new Settings(file);
  s.load();
  assert.equal(s.get('language'), DEFAULTS.language);
});

test('destination usa defaultDestinationFn cuando vacío', () => {
  const s = new Settings(tmpFile(), { defaultDestination: () => 'C:/Mora Musica' });
  assert.equal(s.destination(), 'C:/Mora Musica');
  s.set('destination', 'D:/otra');
  assert.equal(s.destination(), 'D:/otra');
});

test('validateFormat', () => {
  assert.equal(Settings.validateFormat('mp3'), 'mp3');
  assert.equal(Settings.validateFormat('video'), 'video');
  assert.equal(Settings.validateFormat('avi'), 'mp3');
  assert.equal(Settings.validateFormat(undefined), 'mp3');
});
