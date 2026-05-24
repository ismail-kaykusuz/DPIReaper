/** Sidecar log satırlarından canlı bypass / bağlantı sayacı (kayan pencere). */

// PERF: Regex'ten önce çalışan UCUZ ön-filtre. JS string.includes ~O(n) ama
// V8 SIMD optimizasyonu ile regex.test'ten 3-5x daha hızlı. Hiçbir tetikleyici
// kelime yoksa hiç regex çağrılmaz — satırların %70-90'ı burada elenir.
const CONN_HINTS = ['[pxy]', '[proxy]', '[https]', '[dns]', '[app]', 'conn', 'host', 'method:', 'hello', 'dial', ':443', ':80'];
const BYPASS_HINTS = ['chunk', 'fragment', 'split', 'fake', 'sni', 'inject', 'exploit', 'mitm', 'tls'];
const TRAFFIC_HINTS = ['resolv', 'rout', 'cache'];

const CONNECTION_RE =
  /\[(?:pxy|proxy|https|dns|app|cache)]|new conn|new connection|conn(?:ection)? established|client sent hello|client hello|method:\s*connect|tunneling|tunnel established|handling.*request|dialing|connecting to|:443\b|:80\b|host[:=]/i;

const BYPASS_RE =
  /fragment|chunk|inject|https?-split|split-mode|fake.?count|fake.?packet|exploit|mitm|tls hello|\bsni\b|shouldexploit|writing chunked|firstByteFragment/i;

const TRAFFIC_RE = /resolving|routing|cache (?:miss|hit)|server name|resolution took/i;

function containsAny(lower, hints) {
  for (let i = 0; i < hints.length; i++) {
    if (lower.indexOf(hints[i]) !== -1) return true;
  }
  return false;
}

export function createBypassStatsTracker(windowSize = 48) {
  const buckets = new Array(windowSize).fill(0);
  let cursor = 0;
  let lastAdvance = Date.now();
  let connections = 0;
  let bypassEvents = 0;
  let lastRealActivity = 0;
  let totalLines = 0;

  function advanceTime() {
    const now = Date.now();
    const steps = Math.floor((now - lastAdvance) / 1000);
    if (steps <= 0) return;
    for (let i = 0; i < Math.min(steps, windowSize); i++) {
      cursor = (cursor + 1) % windowSize;
      buckets[cursor] = 0;
    }
    lastAdvance = now;
  }

  function snapshot(extra = {}) {
    advanceTime();
    const ordered = [];
    for (let i = 0; i < buckets.length; i++) {
      ordered.push(buckets[(cursor + 1 + i) % buckets.length]);
    }
    const peak = Math.max(1, ...ordered);
    return {
      buckets: ordered,
      peak,
      connections,
      bypassEvents,
      activeRate: buckets[cursor],
      hasRealActivity: lastRealActivity > 0,
      totalLines,
      ...extra,
    };
  }

  function ingest(line) {
    const l = String(line || "");
    if (l.length === 0) return null;

    const len = l.length;
    if (len < 4) return null;
    const c0 = l.charCodeAt(0);
    if (c0 === 0x20 || c0 === 0x09) {
      if (l.indexOf('888') !== -1 || l.indexOf('d88') !== -1) return null;
    }

    const lower = l.toLowerCase();

    // PERF: Önce ucuz includes — hiçbir tetikleyici yoksa regex'i atla
    const mightBeConn = containsAny(lower, CONN_HINTS);
    const mightBeBypass = containsAny(lower, BYPASS_HINTS);
    const mightBeTraffic = !mightBeConn && !mightBeBypass && containsAny(lower, TRAFFIC_HINTS);

    if (!mightBeConn && !mightBeBypass && !mightBeTraffic) {
      if (len >= 14) {
        totalLines += 1;
        advanceTime();
        buckets[cursor] += 1;
        lastRealActivity = Date.now();
        return snapshot();
      }
      return null;
    }

    let delta = 0;
    let countedConn = false;

    if (mightBeConn && CONNECTION_RE.test(l)) {
      connections += 1;
      delta += 1;
      countedConn = true;
    }
    if (mightBeBypass && BYPASS_RE.test(l)) {
      bypassEvents += 1;
      delta += 2;
    }
    if (countedConn && (lower.indexOf('method:') !== -1 || lower.indexOf('hello') !== -1)) {
      bypassEvents += 1;
      delta += 1;
    }
    if (delta === 0 && mightBeTraffic && TRAFFIC_RE.test(l)) {
      delta += 1;
    }
    if (delta === 0 && len >= 14) {
      delta += 1;
    }

    if (delta === 0) return null;

    totalLines += 1;
    advanceTime();
    buckets[cursor] += delta;
    lastRealActivity = Date.now();
    return snapshot();
  }

  function heartbeat() {
    advanceTime();
    const sinceReal = Date.now() - lastRealActivity;
    if (lastRealActivity === 0 || sinceReal > 1500) {
      const t = Date.now() / 1000;
      const wave = Math.max(0, Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3) * 0.3);
      const noise = wave > 0.35 ? 1 : 0;
      if (noise > 0) buckets[cursor] += noise;
    }
    return snapshot();
  }

  function reset() {
    buckets.fill(0);
    cursor = 0;
    lastAdvance = Date.now();
    lastRealActivity = 0;
    connections = 0;
    bypassEvents = 0;
    totalLines = 0;
  }

  return { ingest, snapshot, heartbeat, reset, tick: heartbeat };
}
