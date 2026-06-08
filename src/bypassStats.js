/** Live bypass activity from sidecar log lines (sliding window).
 *
 * Counter (connections / bypassEvents) removed from design — user gets
 * only a visualization bar (buckets). No matter how
 * "meaningful" a line is, it reflects on the graph instead of counting.
 */

const NOISE_CHARS = new Set([0x20, 0x09]);

// No expensive regex — only log lines containing one of these words
// count as "activity". Very little extra work per second.
const ACTIVITY_HINTS = [
  'dial', 'tunnel', 'handled', 'connection',
  'forward', 'served', 'host', 'resolved',
  'connecting', ':443', ':80',
  'chunk', 'split', 'fragment', 'fake', 'sni', 'tls', 'bypass',
];

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
  let lastRealActivity = 0;

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

  function snapshot() {
    advanceTime();
    const ordered = [];
    for (let i = 0; i < buckets.length; i++) {
      ordered.push(buckets[(cursor + 1 + i) % buckets.length]);
    }
    const peak = Math.max(1, ...ordered);
    return {
      buckets: ordered,
      peak,
      activeRate: buckets[cursor],
      hasRealActivity: lastRealActivity > 0,
    };
  }

  function ingest(line) {
    const l = String(line || '');
    if (l.length < 4) return null;

    // Skip ASCII art / sidecar banner lines
    const c0 = l.charCodeAt(0);
    if (NOISE_CHARS.has(c0)) {
      if (l.indexOf('888') !== -1 || l.indexOf('d88') !== -1) return null;
    }

    const lower = l.toLowerCase();
    if (!containsAny(lower, ACTIVITY_HINTS)) return null;

    advanceTime();
    buckets[cursor] += 1;
    lastRealActivity = Date.now();
    return snapshot();
  }

  function heartbeat() {
    advanceTime();
    return snapshot();
  }

  function reset() {
    buckets.fill(0);
    cursor = 0;
    lastAdvance = Date.now();
    lastRealActivity = 0;
  }

  return { ingest, snapshot, heartbeat, reset, tick: heartbeat };
}
