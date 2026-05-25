import { URLS } from '../constants';

/** @returns {number} 1 if a>b, -1 if a<b, 0 if equal */
export function compareSemver(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * GitHub Releases üzerinden en son sürümü kontrol eder.
 * @param {string} currentVersion — örn. "1.0.0"
 * @returns {Promise<{ version: string, url: string } | null>}
 */
export async function checkForAppUpdate(currentVersion) {
  try {
    const res = await fetch(
      'https://api.github.com/repos/ismail-kaykusuz/DPIReaper/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const latest = (data.tag_name || '').replace(/^v/i, '');
    if (!latest || compareSemver(latest, currentVersion) <= 0) return null;
    return {
      version: latest,
      url: data.html_url || `${URLS.github}/releases/latest`,
    };
  } catch {
    return null;
  }
}
