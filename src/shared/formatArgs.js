'use strict';

const QUALITY_FILTERS = {
  best: 'bv*+ba/b',
  '1080': 'bv*[height<=1080]+ba/b',
  '720': 'bv*[height<=720]+ba/b',
  '480': 'bv*[height<=480]+ba/b',
};

function outputSubdir(format) {
  return format === 'video' ? 'Videos' : 'MP3';
}

function buildArgs({ url, format, quality, ffmpegPath, outputDir, playlist }) {
  const args = [];
  if (format === 'video') {
    const filter = QUALITY_FILTERS[quality] || QUALITY_FILTERS.best;
    args.push('-f', filter);
    args.push('--merge-output-format', 'mp4', '--remux-video', 'mp4');
  } else {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  }
  args.push(playlist ? '--yes-playlist' : '--no-playlist');
  args.push(
    '--no-overwrites',
    '--no-mtime',
    '--windows-filenames',
    '--ffmpeg-location',
    ffmpegPath,
    '-o',
    `${outputDir}/%(title)s.%(ext)s`,
    '--newline',
    url,
  );
  return args;
}

module.exports = { buildArgs, outputSubdir, QUALITY_FILTERS };
