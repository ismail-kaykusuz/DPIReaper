import { invoke } from '@tauri-apps/api/core';
import { URLS } from '../constants';

/**
 * GitHub Releases uzerinden guncelleme kontrolu (Rust backend — CSP bagimsiz).
 * @param {string} currentVersion
 * @returns {Promise<{ version: string, url: string } | null>}
 */
export async function checkForAppUpdate(currentVersion) {
  try {
    const info = await invoke('check_for_app_update', { currentVersion });
    if (!info?.update_available) return null;
    return {
      version: info.latest,
      url: info.url || `${URLS.github}/releases/latest`,
    };
  } catch (e) {
    console.warn('Update check failed:', e);
    return null;
  }
}
