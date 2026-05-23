// ═══════════════════════════════════════════════════════════════════
// profiles.js — Tek Merkezi Yapılandırma Dosyası
// 
// Tüm ISS profilleri, bypass modları, chunk seçenekleri ve
// engine argümanları buradan yönetilir.
// 
// Yeni ISS eklemek veya mevcut ayarları değiştirmek için
// sadece bu dosyayı düzenlemeniz yeterlidir.
// ═══════════════════════════════════════════════════════════════════

// ─── ISS PROFİLLERİ ──────────────────────────────────────────────
// İlk giriş overlay'ı ve Settings → ISS Rehberi'nde kullanılır.
// 
// Her profil:
//   id       → Benzersiz tanımlayıcı
//   mode     → dpiMethod değeri ('0'=Turbo, '1'=Dengeli, '2'=Güçlü)
//   chunk    → httpsChunkSize değeri
//   color    → UI renk kodu
//   bg       → Arkaplan renk kodu (düşük opacity)
//   icon     → İlk giriş overlay emoji ikonu
// ─────────────────────────────────────────────────────────────────

import turknetLogo from './assets/iss-icons/turknet.png';
import milenicomLogo from './assets/iss-icons/milenicom.png';
import turkTelekomLogo from './assets/iss-icons/turktelekom.png';
import vodafoneLogo from './assets/iss-icons/vodafone.png';
import kablonetLogo from './assets/iss-icons/kablonet.png';
import superonlineLogo from './assets/iss-icons/superonline.png';

export const ISP_PROFILES = [
  { 
    id: 'light', 
    mode: '0', 
    chunk: 4, 
    color: '#facc15', 
    bg: 'rgba(250, 204, 21, 0.1)',
    icon: '⚡',
    logos: [turknetLogo],
    // i18n key'leri: issLightName, issLightDesc
  },
  { 
    id: 'mid', 
    mode: '1', 
    chunk: 2, 
    color: '#60a5fa', 
    bg: 'rgba(96, 165, 250, 0.1)',
    icon: '🛡️',
    logos: [],
    // i18n key'leri: issMidName, issMidDesc
  },
  { 
    id: 'heavy', 
    mode: '2', 
    chunk: 1, 
    color: '#60a5fa', 
    bg: 'rgba(96, 165, 250, 0.1)',
    icon: '🔒',
    logos: [kablonetLogo, superonlineLogo,turkTelekomLogo, vodafoneLogo, milenicomLogo],
    // i18n key'leri: issHeavyName, issHeavyDesc
  },
  { 
    id: 'other', 
    mode: '2', 
    chunk: 1, 
    color: '#a78bfa', 
    bg: 'rgba(167, 139, 250, 0.1)',
    icon: '🌐',
    logos: [],
    // i18n key'leri: issOtherName, issOtherDesc
  },
];

// ─── BYPASS MODLARI ──────────────────────────────────────────────
// Settings → Bypass Modu seçicisinde ve engine argüman oluşturucuda kullanılır.
//
// Her mod:
//   id            → dpiMethod değeri ('0', '1', '2')
//   color         → Aktif renk
//   activeBg      → Aktif arkaplan rengi
//   iconBg        → İkon arkaplan rengi
//   iconName      → lucide-react ikon adı
//   hasChunkSize  → Chunk size seçici gösterilsin mi
//   hasNpcap      → Npcap gelişmiş bypass gösterilsin mi
// ─────────────────────────────────────────────────────────────────

export const BYPASS_MODES = [
  {
    id: '0',
    color: '#facc15',
    activeBg: 'rgba(234, 179, 8, 0.1)',
    iconBg: 'rgba(234, 179, 8, 0.2)',
    iconClass: 'yellow',
    iconName: 'Activity',
    hasChunkSize: false,
    hasNpcap: false,
    // i18n key'leri: modeTurboName, modeTurboDesc
  },
  {
    id: '1',
    color: '#4ade80',
    activeBg: 'rgba(34, 197, 94, 0.1)',
    iconBg: 'rgba(34, 197, 94, 0.2)',
    iconClass: 'green',
    iconName: 'Zap',
    hasChunkSize: true,
    hasNpcap: false,
    // i18n key'leri: modeBalancedName, modeBalancedDesc
  },
  {
    id: '2',
    color: '#60a5fa',
    activeBg: 'rgba(59, 130, 246, 0.1)',
    iconBg: 'rgba(59, 130, 246, 0.2)',
    iconClass: 'blue',
    iconName: 'Shield',
    hasChunkSize: true,
    hasNpcap: true,
    // i18n key'leri: modeStrongName, modeStrongDesc
  },
];

// ─── CHUNK SIZE SEÇENEKLERİ ─────────────────────────────────────
// Bypass modlarının chunk size seçicisinde gösterilir.
// Değer dizisi: her mod için gösterilecek chunk size'lar
// ─────────────────────────────────────────────────────────────────

export const CHUNK_SIZES = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
  { value: 8, label: '8' },
];

// ─── VARSAYILAN CHUNK DEĞERLERİ ─────────────────────────────────
// Her mod için varsayılan chunk size
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_CHUNKS = {
  '0': 4,   // Turbo: chunk kullanmaz ama fallback
  '1': 2,   // Dengeli: 2 byte chunk
  '2': 1,   // Güçlü: 1 byte chunk
};

// ─── GEÇERLİ CHUNK DEĞERLERİ ────────────────────────────────────
// Config validasyonunda kullanılır
// ─────────────────────────────────────────────────────────────────

export const VALID_CHUNK_SIZES = [1, 2, 4, 8, 16, 32, 64, 128];

// ─── GEÇERLİ DPI MODLARI ────────────────────────────────────────

export const VALID_DPI_METHODS = ['0', '1', '2'];

/** Defender / düşük CPU: bu değerin altındaki chunk çok fazla mini paket üretir */
export const LOW_CPU_MIN_CHUNK = 8;

// ─── KULLANICIYA GÖSTERİLEN BAĞLANTI PROFİLLERİ (Faz 3) ──────────
// Tek karar noktası: kullanıcı Hızlı / Önerilen / Maksimum seçer.
// Eski ISS rehberi + Turbo/Dengeli/Güçlü mod seçicisinin yerini alır.
//
// tier → { mode (dpiMethod), chunk (httpsChunkSize), profileId (ISP_PROFILES eşlemesi) }
// ─────────────────────────────────────────────────────────────────

export const PROFILE_TIERS = {
  fast:        { mode: '0', chunk: 4, profileId: 'light' },
  recommended: { mode: '1', chunk: 2, profileId: 'mid' },
  max:         { mode: '2', chunk: 1, profileId: 'heavy' },
};

export const PROFILE_TIER_ORDER = ['fast', 'recommended', 'max'];
export const DEFAULT_PROFILE_TIER = 'recommended';

/** Verilen tier için tam config patch'i döner (dpiMethod + chunk + ISS id). */
export function profilePatch(tier) {
  const p = PROFILE_TIERS[tier];
  if (!p) return null;
  return {
    dpiMethod: p.mode,
    httpsChunkSize: p.chunk,
    selectedIspProfile: p.profileId,
  };
}

/** Mevcut config hangi tier'a denk geliyor? Eşleşmiyorsa null (özel). */
export function detectProfileTier(config) {
  const dpiMethod = String(config?.dpiMethod ?? '');
  const chunk = Number(config?.httpsChunkSize);
  for (const tier of PROFILE_TIER_ORDER) {
    const p = PROFILE_TIERS[tier];
    if (p.mode === dpiMethod && Number(p.chunk) === chunk) return tier;
  }
  return null;
}

// ─── ENGINE ARGÜMAN OLUŞTURUCU ───────────────────────────────────

export function getChunkOptionsForUi(dpiMethod, lowCpuMode) {
  if (lowCpuMode && dpiMethod !== '0') {
    return CHUNK_SIZES.filter((o) => o.value >= LOW_CPU_MIN_CHUNK);
  }
  return CHUNK_SIZES;
}

export function getEffectiveChunkSize(dpiMethod, httpsChunkSize, lowCpuMode) {
  const raw = Number(httpsChunkSize);
  let chunk = [1, 2, 4, 8, 16].includes(raw) ? raw : (DEFAULT_CHUNKS[dpiMethod] || 2);
  if (lowCpuMode && dpiMethod !== '0') {
    chunk = Math.max(chunk, LOW_CPU_MIN_CHUNK);
  }
  return chunk;
}

/**
 * SpoofDPI (dpireaper-proxy) sidecar argümanları.
 * @returns {{ args: string[], logs: Array<{ key: string, type?: string, params?: unknown[] }> }}
 */
export function buildProxyEngineArgs({
  config,
  hasDriver,
  listenAddr,
  timeoutMs,
  currentDns,
  dnsIP,
  dohUrl,
}) {
  const logs = [];
  const args = [
    '--clean',
    '--listen-addr', listenAddr,
    '--timeout', String(timeoutMs),
    '--silent',
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
  const lowCpu = config.lowCpuMode === true;
  const userChunk = getEffectiveChunkSize(dpiMethod, config.httpsChunkSize, lowCpu);

  if (lowCpu && dpiMethod !== '0' && Number(config.httpsChunkSize) < LOW_CPU_MIN_CHUNK) {
    logs.push({
      key: 'logLowCpuChunkBump',
      type: 'info',
      params: [Number(config.httpsChunkSize), LOW_CPU_MIN_CHUNK],
    });
  }

  if (dpiMethod === '2') {
    const useFake = hasDriver && config.advancedBypass !== false && !lowCpu;
    if (useFake) {
      args.push('--https-split-mode', 'chunk', '--https-chunk-size', '1', '--https-fake-count', '3');
      logs.push({ key: 'logStrongFake', type: 'success' });
    } else {
      args.push('--https-split-mode', 'chunk', '--https-chunk-size', String(userChunk));
      if (!hasDriver) {
        logs.push({ key: 'logStrongNoDriver', type: 'warn' });
      } else if (lowCpu) {
        logs.push({ key: 'logLowCpuMode', type: 'info' });
      } else {
        logs.push({ key: 'logStrongChunkOnly', type: 'info' });
      }
    }
  } else if (dpiMethod === '1') {
    args.push('--https-split-mode', 'chunk', '--https-chunk-size', String(userChunk));
  } else {
    args.push('--https-split-mode', 'sni');
    if (lowCpu) {
      logs.push({ key: 'logLowCpuTurbo', type: 'info' });
    }
  }

  return { args, logs };
}


