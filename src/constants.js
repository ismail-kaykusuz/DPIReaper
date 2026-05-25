// ============================================================
// DPIReaper — Merkezi Sabitler
// ============================================================

export const URLS = {
  github: 'https://github.com/ismail-kaykusuz/DPIReaper',
  discord: 'https://discord.gg/s8nqMqecXY',
  patreon: 'https://www.patreon.com/16093117/join',
};

export const DNS_MAP = {
  system: null,
  cloudflare: "1.1.1.1",
  adguard: "94.140.14.14",
  google: "8.8.8.8",
  quad9: "9.9.9.9",
  opendns: "208.67.222.222",
};

export const DOH_MAP = {
  cloudflare: "https://1.1.1.1/dns-query",
  google: "https://8.8.8.8/dns-query",
  adguard: "https://94.140.14.14/dns-query",
  quad9: "https://9.9.9.9:5053/dns-query",
  opendns: "https://208.67.222.222/dns-query",
};

const APP_VERSION = "1.0.7";

export const APP = {
  name: "DPIReaper",
  // B16: Cache-bust ile yeni sürümde Tauri WebView eski logoyu cache'lemesin
  logo: `/dpireaper-logo.png?v=${APP_VERSION}`,
  version: APP_VERSION,
  designWidth: 380,
  designHeight: 700,
  maxLogs: 100,
  maxPortRetries: 20,
  maxReconnectAttempts: 5,
  portCheckMaxAttempts: 15,
};

export const LS_KEYS = {
  config: "dpireaper_config",
  firstRun: "dpireaper_first_run_done",
  // Defender consent: 'added' | 'declined' | null (henüz sorulmadı)
  defenderExclusionDecision: "dpireaper_defender_exclusion_decision",
  ispCache: "dpireaper_isp_cache",
  onboardingDone: "dpireaper_onboarding_done",
  lang: "dpireaper_lang",
  /** Kullanıcının "Sonra" dediği sürüm — aynı sürüm için tekrar gösterme */
  dismissedUpdateVersion: "dpireaper_dismissed_update_version",
};

export const RETRY_DELAYS = [2500, 3000, 6000, 12000, 20000];

export const DPI_TIMEOUTS = {
  "0": 3000,
  "1": 5000,
  "2": 8000,
};
