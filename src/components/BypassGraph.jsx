import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';

/** 1234 → "1.2K", 1234567 → "1.2M" */
function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return String(v);
}

/**
 * Ana ekranda sidecar'dan gelen bypass olaylarını gösteren mini çizgi grafik.
 *
 * PERF: React.memo ile sarılmış — yalnızca `stats` referansı değişince yeniden
 * render olur. App.jsx tarafında flushBypassStats 250ms throttle ile çağrılır,
 * yani saniyede max 4 render.
 */
function BypassGraph({ stats, t, visible = true }) {
  const { path, areaPath, isLive } = useMemo(() => {
    const buckets = stats?.buckets || [];
    const w = 280;
    const h = 38;
    const pad = 2;
    const allZero = buckets.every((v) => v === 0);
    const max = Math.max(1, stats?.peak || 1, ...buckets);

    if (buckets.length === 0 || allZero) {
      const mid = h / 2;
      return {
        path: `M ${pad} ${mid} L ${w - pad} ${mid}`,
        areaPath: '',
        isLive: false,
      };
    }

    const step = (w - pad * 2) / Math.max(1, buckets.length - 1);
    const points = buckets.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return [x, y];
    });

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ');
    const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${h - pad} L ${pad} ${h - pad} Z`;

    return { path: line, areaPath: area, isLive: true };
  }, [stats]);

  if (!visible) return null;

  return (
    <div className="bypass-graph" aria-label={t.bypassGraphLabel}>
      <div className="bypass-graph-header">
        <span className="bypass-graph-title">
          <Activity size={11} strokeWidth={2.4} />
          {t.bypassGraphTitle}
        </span>
        <span className={`bypass-graph-meta ${isLive ? '' : 'is-idle'}`}>
          {t.bypassGraphConnections(formatCount(stats?.connections ?? 0))} · {t.bypassGraphEvents(formatCount(stats?.bypassEvents ?? 0))}
        </span>
      </div>
      <svg className="bypass-graph-svg" viewBox="0 0 280 38" preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="bypassGraphFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#bypassGraphFill)" />}
        <path
          d={path}
          fill="none"
          stroke="var(--success)"
          strokeOpacity={isLive ? 1 : 0.35}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default React.memo(BypassGraph);
