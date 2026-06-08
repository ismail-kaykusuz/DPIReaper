// ═══════════════════════════════════════════════════════════════════
// profiles.js — Single Central Configuration File
//
// All bypass modes, chunk options, and engine arguments
// are managed here.
// ═══════════════════════════════════════════════════════════════════

// ─── CHUNK SIZE DEFAULTS ─────────────────────────────────
// Only 3 profiles: fast (4) · recommended (2) · max (1).
// 8-byte profile removed from design.
export const DEFAULT_CHUNKS = {
  '0': 4,
  '1': 2,
  '2': 1,
};

export const VALID_CHUNK_SIZES = [1, 2, 4];
export const VALID_DPI_METHODS = ['0', '1', '2'];

// ─── USER-FACING CONNECTION PROFILES ──────────────────
export const PROFILE_TIERS = {
  fast:        { mode: '0', chunk: 4, profileId: 'light' },
  recommended: { mode: '1', chunk: 2, profileId: 'mid' },
  max:         { mode: '2', chunk: 1, profileId: 'heavy' },
};

export const PROFILE_TIER_ORDER = ['fast', 'recommended', 'max'];
export const DEFAULT_PROFILE_TIER = 'recommended';

export function profilePatch(tier) {
  const p = PROFILE_TIERS[tier];
  if (!p) return null;
  return {
    dpiMethod: p.mode,
    httpsChunkSize: p.chunk,
    selectedIspProfile: p.profileId,
  };
}

export function detectProfileTier(config) {
  const dpiMethod = String(config?.dpiMethod ?? '');
  const chunk = Number(config?.httpsChunkSize);
  for (const tier of PROFILE_TIER_ORDER) {
    const p = PROFILE_TIERS[tier];
    if (p.mode === dpiMethod && Number(p.chunk) === chunk) return tier;
  }
  return null;
}

export function getEffectiveChunkSize(dpiMethod, httpsChunkSize) {
  const raw = Number(httpsChunkSize);
  return VALID_CHUNK_SIZES.includes(raw) ? raw : (DEFAULT_CHUNKS[dpiMethod] || 2);
}

/**
 * SpoofDPI (dpireaper-proxy) sidecar arguments.
 * @returns {{ args: string[], logs: Array<{ key: string, type?: string, params?: unknown[] }> }}
 */
export function buildProxyEngineArgs({
  config,
  listenAddr,
  timeoutMs,
  currentDns,
  dnsIP,
  dohUrl,
}) {
  const logs = [];
  // PERF: 'info' level produces only 10-50 lines/sec under heavy traffic.
  // This level adds ~1% CPU load in daily use.
  const args = [
    '--clean',
    '--listen-addr', listenAddr,
    '--timeout', String(timeoutMs),
    '--log-level', 'info',
  ];

  if (config.ipv4Only !== false) {
    args.push('--dns-qtype', 'ipv4');
  } else {
    args.push('--dns-qtype', 'all');
  }

  if (currentDns === 'system' || !dnsIP) {
    args.push('--dns-mode', 'system');
  } else if (dohUrl) {
    args.push('--dns-mode', 'https', '--dns-https-url', dohUrl);
  } else {
    args.push('--dns-addr', `${dnsIP}:53`, '--dns-mode', 'udp');
  }

  const dpiMethod = config.dpiMethod || '1';
  const userChunk = getEffectiveChunkSize(dpiMethod, config.httpsChunkSize);

  if (dpiMethod === '2') {
    args.push('--https-split-mode', 'chunk', '--https-chunk-size', String(userChunk));
    logs.push({ key: 'logBypassActive', type: 'info' });
  } else if (dpiMethod === '1') {
    args.push('--https-split-mode', 'chunk', '--https-chunk-size', String(userChunk));
  } else {
    args.push('--https-split-mode', 'sni');
  }

  return { args, logs };
}
