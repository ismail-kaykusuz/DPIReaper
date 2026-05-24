// ============================================================
// DPIReaper — Merkezi Sabitler
// ============================================================

export const URLS = {};

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

export const APP = {
  name: "DPIReaper",
  logo: "/dpireaper-logo.png",
  version: "1.0.0",
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
  defenderExclusionAdded: "dpireaper_defender_exclusion_added",
};

export const RETRY_DELAYS = [2500, 3000, 6000, 12000, 20000];

export const DPI_TIMEOUTS = {
  "0": 3000,
  "1": 5000,
  "2": 8000,
};
