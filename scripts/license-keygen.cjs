/**
 * license-keygen.cjs — Ed25519 anahtar çifti üretir (BİR KEZ çalıştırılır).
 *
 * Çıktılar:
 *   .keys/dpireaper-private.key        — sadece sizde kalmalı, asla paylaşılmaz
 *   src-tauri/src/license_pubkey.txt   — uygulamaya gömülür
 *
 * Kullanım:
 *   node scripts/license-keygen.cjs           # ilk seferi
 *   node scripts/license-keygen.cjs --force   # üzerine yaz (yeni anahtar çifti)
 */

const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');

const ROOT = path.join(__dirname, '..');
const PRIVATE_PATH = path.join(ROOT, '.keys', 'dpireaper-private.key');
const PUBLIC_PATH = path.join(ROOT, 'src-tauri', 'src', 'license_pubkey.txt');

const force = process.argv.includes('--force');

if (fs.existsSync(PRIVATE_PATH) && !force) {
  console.error('HATA: Anahtar zaten var: ' + PRIVATE_PATH);
  console.error('Üzerine yazmak için: node scripts/license-keygen.cjs --force');
  console.error('(Yeni anahtar üretirseniz eski lisanslar geçersiz olur!)');
  process.exit(1);
}

const pair = nacl.sign.keyPair();
const privateB64 = Buffer.from(pair.secretKey).toString('base64');
const publicB64 = Buffer.from(pair.publicKey).toString('base64');

fs.mkdirSync(path.dirname(PRIVATE_PATH), { recursive: true });
fs.writeFileSync(PRIVATE_PATH, privateB64, { mode: 0o600 });
fs.writeFileSync(PUBLIC_PATH, publicB64);

console.log('✓ Private key  → ' + path.relative(ROOT, PRIVATE_PATH));
console.log('✓ Public key   → ' + path.relative(ROOT, PUBLIC_PATH));
console.log('');
console.log('ÖNEMLİ:');
console.log('  • Private key DOSYASINI ASLA PAYLAŞMAYIN, repo\'ya commit etmeyin.');
console.log('  • Public key uygulamaya gömülecek — yeniden build gerekir.');
console.log('  • Yeni lisans üretmek için: node scripts/issue-license.cjs --help');
