'use strict';

const DOMAINS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'facebook.com', 'fb.watch', 'fb.com', 'fb.gg',
  'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
  'twitch.tv', 'vimeo.com', 'dailymotion.com', 'soundcloud.com',
  'spotify.com', 'open.spotify.com', 'reddit.com', 'streamable.com',
  'rumble.com', 'bilibili.com', 'vk.com', 'odysee.com', 'ok.ru',
  'bandcamp.com', 'mixcloud.com', 'audiomack.com', 'archive.org',
  'drive.google.com', 'mega.nz', 'pinterest.com', 'flickr.com',
];

const URL_REGEX = /\b(https?:\/\/[^\s<>"']+)/gi;
const NAKED_URL_REGEX = /\b(?:www\.)?([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']+)?/gi;
const QUERY_KEEP = ['v', 'list', 'post', 'status', 'id', 'p', 'reel', 'video'];

function extractCandidate(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const m = text.match(URL_REGEX);
  return m ? m[0] : null;
}

function normalizeUrl(url) {
  let u = String(url).trim().replace(/[),.;:\u2019\u201d]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isSupported(url) {
  const host = getHostname(url);
  if (!host) return false;
  return DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}

function detectVideoUrl(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const cand = extractCandidate(text);
  if (cand) {
    const url = normalizeUrl(cand);
    return isSupported(url) ? url : null;
  }
  const naked = String(text).match(NAKED_URL_REGEX);
  if (naked) {
    const url = normalizeUrl(naked[0]);
    if (isSupported(url) && url.includes('/')) return url;
  }
  return null;
}

function makeKey(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const kept = [];
    for (const k of QUERY_KEEP) {
      const val = u.searchParams.get(k);
      if (val) kept.push(`${k}=${val}`);
    }
    return host + u.pathname + (kept.length ? '?' + kept.join('&') : '');
  } catch {
    return String(url);
  }
}

function isPlaylistUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
      if (u.searchParams.get('list')) return true;
      if (u.pathname.startsWith('/playlist')) return true;
      if (u.pathname.startsWith('/mix')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getPlatform(url) {
  const host = getHostname(url);
  if (!host) return 'Web';
  if (host.includes('youtube') || host === 'youtu.be') return 'YouTube';
  if (host.includes('facebook') || host.startsWith('fb.')) return 'Facebook';
  if (host.includes('instagram')) return 'Instagram';
  if (host === 'tiktok.com') return 'TikTok';
  if (host === 'x.com' || host === 'twitter.com') return 'X / Twitter';
  if (host === 'twitch.tv') return 'Twitch';
  if (host === 'vimeo.com') return 'Vimeo';
  if (host === 'dailymotion.com') return 'Dailymotion';
  if (host.includes('soundcloud')) return 'SoundCloud';
  if (host.includes('spotify')) return 'Spotify';
  return host;
}

module.exports = {
  DOMAINS,
  extractCandidate,
  normalizeUrl,
  getHostname,
  isSupported,
  detectVideoUrl,
  makeKey,
  isPlaylistUrl,
  getPlatform,
};
