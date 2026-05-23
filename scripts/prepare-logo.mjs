/**
 * Logo kaynağı: images/DPIReaper.png (tercih) veya public/dpireaper-logo.source.png
 * Çıktı: kırpılmış UI PNG + Tauri ikon kaynağı
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const masterPath = path.join(root, 'images', 'DPIReaper.png');
const backupPath = path.join(root, 'public', 'dpireaper-logo.source.png');
const legacyPath = path.join(root, 'public', 'dpireaper-logo.png');

function resolveSource() {
  const arg = process.argv[2];
  if (arg) {
    const p = path.isAbsolute(arg) ? arg : path.join(root, arg);
    if (!fs.existsSync(p)) {
      console.error(`HATA: Kaynak bulunamadı: ${p}`);
      process.exit(1);
    }
    return p;
  }
  if (fs.existsSync(masterPath)) return masterPath;
  if (fs.existsSync(backupPath)) return backupPath;
  if (fs.existsSync(legacyPath)) return legacyPath;
  console.error('HATA: images/DPIReaper.png veya public/dpireaper-logo.source.png gerekli.');
  process.exit(1);
}

const readPath = resolveSource();
if (readPath !== backupPath) {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(readPath, backupPath);
  console.log(`Kaynak kopyalandı → public/dpireaper-logo.source.png`);
}

const trimOpts = {
  background: { r: 0, g: 0, b: 0, alpha: 0 },
  threshold: 12,
};

const trimmedBuf = await sharp(readPath).trim(trimOpts).png().toBuffer();
const trimmedMeta = await sharp(trimmedBuf).metadata();
console.log(
  `Kırpıldı: ${trimmedMeta.width}x${trimmedMeta.height} (${path.relative(root, readPath)})`,
);

const webMax = 320;
const webBuf = await sharp(trimmedBuf)
  .resize({
    width: webMax,
    height: webMax,
    fit: 'inside',
    withoutEnlargement: true,
  })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();
fs.writeFileSync(path.join(root, 'public', 'dpireaper-logo.png'), webBuf);

async function buildSquareIcon(size, logoFill = 0.84) {
  const inner = Math.round(size * logoFill);
  const { width = 1, height = 1 } = await sharp(trimmedBuf).metadata();
  const scale = Math.min(inner / width, inner / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const logoPng = await sharp(trimmedBuf).resize(w, h, { fit: 'inside' }).png().toBuffer();
  const left = Math.floor((size - w) / 2);
  const top = Math.floor((size - h) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logoPng, left, top }])
    .png()
    .toBuffer();
}

const icon1024 = await buildSquareIcon(1024);
fs.writeFileSync(path.join(root, 'public', 'dpireaper-icon-1024.png'), icon1024);

const engine256 = await sharp(icon1024).resize(256, 256).png().toBuffer();
fs.writeFileSync(path.join(root, 'public', 'dpireaper-engine.png'), engine256);
fs.writeFileSync(path.join(root, 'public', 'uninstall.png'), engine256);

const { data, info } = await sharp(webBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let transparent = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] < 16) transparent++;
const pct = ((100 * transparent) / (info.width * info.height)).toFixed(1);
console.log(`Doğrulama: UI PNG şeffaf alan %${pct} (dama tahtası olmamalı)`);
console.log('Yazıldı: public/dpireaper-logo.png, dpireaper-icon-1024.png, dpireaper-engine.png');
