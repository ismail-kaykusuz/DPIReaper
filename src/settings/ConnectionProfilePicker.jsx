import React from 'react';
import { AlertCircle, RotateCcw, Sparkles, ShieldCheck } from 'lucide-react';
import {
  LOW_CPU_MIN_CHUNK,
  PROFILE_TIER_ORDER,
  DEFAULT_PROFILE_TIER,
  profilePatch,
  detectProfileTier,
} from '../profiles';

const ConnectionProfilePicker = ({ config, updateConfig, t, compact = false, ispDetection = null }) => {
  const activeTier = detectProfileTier(config);
  const suggestedTier = ispDetection?.detected ? ispDetection.suggested_tier : null;
  const rows = PROFILE_TIER_ORDER.map((tier) => {
    const key = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      tier,
      name: t[`profile${key}Name`] || tier,
      recommended: tier === DEFAULT_PROFILE_TIER,
      ispSuggested: suggestedTier === tier,
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

  const handleResetToDefault = () => {
    handleSelect(DEFAULT_PROFILE_TIER);
  };

  const handleApplySuggested = () => {
    if (suggestedTier) handleSelect(suggestedTier);
  };

  return (
    <div className="v2-section">
      {!compact && <div className="v2-section-title">{t.sectionConnectionProfile}</div>}
      {ispDetection?.detected && (
        <div className="info-banner info-banner--isp">
          <Sparkles size={16} className="info-banner-icon info-banner-icon--accent" />
          <div className="info-banner-body">
            <div className="info-banner-title">{t.ispDetectedTitle(ispDetection.isp_label)}</div>
            <span>{t.ispDetectedHint(
              t[`profile${suggestedTier?.charAt(0).toUpperCase()}${suggestedTier?.slice(1)}Name`] || suggestedTier
            )}</span>
          </div>
          {activeTier !== suggestedTier && (
            <div className="info-banner-actions">
              <button type="button" className="info-banner-btn info-banner-btn--accent" onClick={handleApplySuggested}>
                {t.ispApplySuggested}
              </button>
            </div>
          )}
        </div>
      )}
      {activeTier === null && !compact && (
        <div className="info-banner">
          <AlertCircle size={16} className="info-banner-icon" />
          <div className="info-banner-body">
            <div className="info-banner-title">{t.profileCustomLabel}</div>
            <span>{t.profileCustomHint}</span>
          </div>
          <div className="info-banner-actions">
            <button type="button" className="info-banner-btn" onClick={handleResetToDefault}>
              <RotateCcw size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
              {t.profileResetBtn}
            </button>
          </div>
        </div>
      )}
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
                  <h3>
                    {row.name}
                    {row.ispSuggested && (
                      <span className="profile-badge-isp">{t.profileIspBestBadge}</span>
                    )}
                    {row.recommended && !row.ispSuggested && (
                      <span className="profile-badge-recommended">{t.profileRecommendedBadge}</span>
                    )}
                  </h3>
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
      <div className="profile-defender-note">
        <ShieldCheck size={13} strokeWidth={2.2} />
        <span>{t.profileDefenderBadge}</span>
      </div>
      {activeTier === null && compact && (
        <div className="info-banner" style={{ marginTop: 8 }}>
          <AlertCircle size={16} className="info-banner-icon" />
          <div className="info-banner-body">
            <div className="info-banner-title">{t.profileCustomLabel}</div>
            <span>{t.profileCustomHint}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionProfilePicker;
