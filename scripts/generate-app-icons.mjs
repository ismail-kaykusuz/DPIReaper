/**
 * Logo hazırla + Tauri ikon seti + proxy exe ikonu.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconSrc = path.join(root, 'public', 'dpireaper-icon-1024.png');

function run(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 && !allowFail) process.exit(r.status ?? 1);
  return r.status === 0;
}

run('node', [path.join(__dirname, 'prepare-logo.mjs')]);

const icoExists = fs.existsSync(path.join(root, 'src-tauri', 'icons', 'icon.ico'));
const skipIcons = process.env.SKIP_TAURI_ICON === '1' || (icoExists && process.env.FORCE_TAURI_ICON !== '1');
if (skipIcons) {
  console.log('Icon set already present, skipping `tauri icon` regen (set FORCE_TAURI_ICON=1 to override).');
} else {
  const ok = run('npm', ['run', 'tauri', '--', 'icon', iconSrc], { allowFail: true });
  if (!ok) {
    console.warn('WARN: `tauri icon` failed (likely a locked .icns file). Continuing with existing icon set.');
  }
}

run('node', [path.join(root, 'change-icon.js')]);

console.log('\nTamam. dev:app öncesi: npm run dev:app (veya tam yeniden derleme).');
