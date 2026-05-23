/**
 * issue-license.cjs — Yeni lisans anahtarı üretir.
 *
 * Format:
 *   dpir-<base64url(payload)>.<base64url(signature)>
 *
 * Payload:
 *   { id, name, issuedAt (ISO8601), expiresAt (ISO8601) }
 *
 * Çıktı (otomatik):
 *   license/<Name><N><unit>PoweredByParziiLicense.txt   (özel dosya)
 *   license/customers.csv                                (müşteri kayıt CSV)
 *
 * Kullanım örnekleri:
 *   node scripts/issue-license.cjs --name "Ali" --minutes 5
 *   node scripts/issue-license.cjs --name "Ali" --days 30
 *   node scripts/issue-license.cjs --name "Ali" --hours 12
 *   node scripts/issue-license.cjs --name "Ali" --days 365 --out custom.txt   # özel yol
 *
 * Süre öncelik sırası: --minutes > --hours > --days (varsayılan: 5 dakika)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');

const ROOT = path.join(__dirname, '..');
const PRIVATE_PATH = path.join(ROOT, '.keys', 'dpireaper-private.key');
const LICENSE_DIR = path.join(ROOT, 'license');
const CUSTOMERS_CSV = path.join(LICENSE_DIR, 'customers.csv');
const BRAND_SUFFIX = 'PoweredByParziiLicense';

function getArg(flag, defaultValue) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return defaultValue;
  return process.argv[idx + 1];
}
function hasArg(flag) {
  return process.argv.includes(flag);
}

if (hasArg('--help') || hasArg('-h')) {
  console.log('Kullanım: node scripts/issue-license.cjs --name <ad> [--minutes N | --hours N | --days N] [--out dosya.txt]');
  console.log('');
  console.log('Örnekler:');
  console.log('  --name "Ali"  --minutes 30');
  console.log('  --name "Ali"  --hours 12');
  console.log('  --name "Ali"  --days 30');
  console.log('  --name "Ali"  --days 365 --out custom-path.txt');
  console.log('');
  console.log('Otomatik çıktı: license/<Ad><Süre><Birim>PoweredByParziiLicense.txt');
  console.log('Müşteri kaydı:  license/customers.csv');
  process.exit(0);
}

if (!fs.existsSync(PRIVATE_PATH)) {
  console.error('HATA: Private key bulunamadı: ' + PRIVATE_PATH);
  console.error('Önce: node scripts/license-keygen.cjs');
  process.exit(1);
}

const name = getArg('--name', null);
if (!name) {
  console.error('HATA: --name gerekli. Örn: --name "Ali"');
  process.exit(1);
}

const minutes = Number(getArg('--minutes', null));
const hours = Number(getArg('--hours', null));
const days = Number(getArg('--days', null));

let expiresMs;
let durationNumber;
let durationUnit;
let durationLabel;
if (minutes && !Number.isNaN(minutes)) {
  expiresMs = minutes * 60 * 1000;
  durationNumber = minutes;
  durationUnit = 'minutes';
  durationLabel = `${minutes} dakika`;
} else if (hours && !Number.isNaN(hours)) {
  expiresMs = hours * 60 * 60 * 1000;
  durationNumber = hours;
  durationUnit = 'hours';
  durationLabel = `${hours} saat`;
} else if (days && !Number.isNaN(days)) {
  expiresMs = days * 24 * 60 * 60 * 1000;
  durationNumber = days;
  durationUnit = 'days';
  durationLabel = `${days} gün`;
} else {
  expiresMs = 5 * 60 * 1000;
  durationNumber = 5;
  durationUnit = 'minutes';
  durationLabel = '5 dakika (varsayılan)';
}

const now = new Date();
const expires = new Date(now.getTime() + expiresMs);

const payload = {
  id: crypto.randomUUID(),
  name: String(name),
  issuedAt: now.toISOString(),
  expiresAt: expires.toISOString(),
};

const payloadStr = JSON.stringify(payload);
const payloadBytes = Buffer.from(payloadStr, 'utf8');

const privateB64 = fs.readFileSync(PRIVATE_PATH, 'utf8').trim();
const privateKey = Buffer.from(privateB64, 'base64');
const signature = nacl.sign.detached(payloadBytes, privateKey);

const toBase64Url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const token = 'dpir-' + toBase64Url(payloadBytes) + '.' + toBase64Url(signature);

fs.mkdirSync(LICENSE_DIR, { recursive: true });

// Dosya adı: Türkçe / boşluk vb. karakterleri ASCII'ye indirgeyerek güvenli ad üret.
const safeName = String(name)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '');

const customOut = getArg('--out', null);
const autoFileName = `${safeName}${durationNumber}${durationUnit}${BRAND_SUFFIX}.txt`;
const outFile = customOut
  ? (path.isAbsolute(customOut) ? customOut : path.join(ROOT, customOut))
  : path.join(LICENSE_DIR, autoFileName);

const fileBody = `DPIReaper — Lisans Anahtarı
Powered by Parzii

Müşteri:      ${name}
Süre:         ${durationLabel}
Düzenleme:    ${now.toISOString()}
Son geçerli:  ${expires.toISOString()}
ID:           ${payload.id}

ANAHTAR (uygulamaya tek satır olarak yapıştırın):

${token}
`;

fs.writeFileSync(outFile, fileBody, 'utf8');

// CSV müşteri kaydı (her zaman append). İlk seferse header da yaz.
const csvExists = fs.existsSync(CUSTOMERS_CSV);
const csvLine = [
  now.toISOString(),
  JSON.stringify(name),
  durationLabel,
  expires.toISOString(),
  payload.id,
  path.basename(outFile),
].join(',') + '\n';

if (!csvExists) {
  fs.writeFileSync(
    CUSTOMERS_CSV,
    'issuedAt,name,duration,expiresAt,id,file\n' + csvLine,
    'utf8'
  );
} else {
  fs.appendFileSync(CUSTOMERS_CSV, csvLine, 'utf8');
}

console.log('');
console.log('✓ Lisans dosyası : ' + path.relative(ROOT, outFile));
console.log('✓ CSV kaydı       : ' + path.relative(ROOT, CUSTOMERS_CSV));
console.log('');
console.log('Müşteri:    ' + name);
console.log('Süre:       ' + durationLabel);
console.log('Son geçerli: ' + expires.toISOString());
console.log('');
console.log('Anahtarı dosyadan kopyalayıp müşteriye gönderin.');
