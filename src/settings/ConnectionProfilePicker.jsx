import React from 'react';
import { LOW_CPU_MIN_CHUNK, PROFILE_TIER_ORDER, profilePatch, detectProfileTier } from '../profiles';

/**
 * Faz 3 — Bağlantı profili seçici (tek karar noktası).
 * ISS rehberi + Turbo/Dengeli/Güçlü mod + chunk butonlarının yerine geçer.
 * Hem Ayarlar → Bağlantı sekmesinde hem de ilk açılış sihirbazında kullanılır.
 */
const ConnectionProfilePicker = ({ config, updateConfig, t, compact = false }) => {
  const activeTier = detectProfileTier(config);
  const rows = PROFILE_TIER_ORDER.map((tier) => {
    const key = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      tier,
      name: t[`profile${key}Name`] || tier,
      desc: t[`profile${key}Desc`] || '',
      isps: t[`profile${key}Isps`] || '',
    };
  });

  const handleSelect = (tier) => {
    const patch = profilePatch(tier);
    if (!patch) return;
    if (config.lowCpuMode && patch.dpiMethod !== '0') {
      patch.httpsChunkSize = Math.max(Number(patch.httpsChunkSize), LOW_CPU_MIN_CHUNK);
    }
    updateConfig(patch);
  };

  return (
    <div className="v2-section">
      {!compact && <div className="v2-section-title">{t.sectionConnectionProfile}</div>}
      <div className="v2-card">
        {rows.map((row, idx) => {
          const isSelected = activeTier === row.tier;
          return (
            <React.Fragment key={row.tier}>
              <div
                className={`v2-item hover-effect ${isSelected ? 'v2-selected' : ''}`}
                onClick={() => handleSelect(row.tier)}
              >
                <div className="v2-item-text">
                  <h3>{row.name}</h3>
                  <p>{row.desc}</p>
                  {row.isps && (
                    <p style={{ marginTop: 3, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      {row.isps}
                    </p>
                  )}
                </div>
                <div className={`v2-radio ${isSelected ? 'on' : ''}`}>
                  {isSelected && <div className="v2-radio-dot" />}
                </div>
              </div>
              {idx < rows.length - 1 && <div className="v2-divider" />}
            </React.Fragment>
          );
        })}
      </div>
      {activeTier === null && (
        <p style={{
          marginTop: 8,
          padding: '8px 12px',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          lineHeight: 1.45,
        }}>
          <strong style={{ color: 'var(--accent)' }}>{t.profileCustomLabel}</strong> — {t.profileCustomHint}
        </p>
      )}
    </div>
  );
};

export default ConnectionProfilePicker;
