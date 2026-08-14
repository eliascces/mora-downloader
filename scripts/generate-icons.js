'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'assets', 'logo.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const pngs = [];
  for (const size of sizes) {
    const file = path.join(root, 'assets', `icon-${size}.png`);
    await sharp(svgPath).resize(size, size).png().toFile(file);
    pngs.push(file);
  }
  const icoBuffer = await pngToIco(pngs);
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), icoBuffer);
  await sharp(svgPath).resize(512, 512).png().toFile(path.join(root, 'assets', 'icon.png'));
  for (const f of pngs) { try { fs.unlinkSync(f); } catch {} }
  console.log('Iconos generados: assets/icon.ico y assets/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
