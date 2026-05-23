/**
 * Logo hazırla + Tauri ikon seti + proxy exe ikonu.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const iconSrc = path.join(root, 'public', 'dpireaper-icon-1024.png');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('node', [path.join(__dirname, 'prepare-logo.mjs')]);
run('npm', ['run', 'tauri', '--', 'icon', iconSrc]);
run('node', [path.join(root, 'change-icon.js')]);

console.log('\nTamam. dev:app öncesi: npm run dev:app (veya tam yeniden derleme).');
