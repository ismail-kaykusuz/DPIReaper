import React from 'react';
import { RotateCw, Activity, Sparkles, Smartphone } from 'lucide-react';
import ConnectionProfilePicker from './ConnectionProfilePicker';
import Toggle from './Toggle';

// DNS provider visual identity (colored circle + initial instead of local SVG).
const DNS_BRANDS = {
  cloudflare: { color: '#f38020', short: 'CF' },
  adguard:    { color: '#68bc71', short: 'A' },
  google:     { color: '#4285f4', short: 'G' },
  quad9:      { color: '#9013fe', short: 'Q' },
  opendns:    { color: '#e2342f', short: 'O' },
};

const pingClass = (ms) => {
  if (!ms || ms >= 999) return 'dns-card-ping--off';
  if (ms < 50) return 'dns-card-ping--fast';
  if (ms < 150) return 'dns-card-ping--mid';
  return 'dns-card-ping--slow';
};

/** Settings → CONNECTION tab: profile picker + modern DNS cards. */
const SettingsConnectionTab = ({
  config,
  updateConfig,
  t,
  sortedProviders,
  latencies,
  isChecking,
  checkAllLatencies,
  ispDetection = null,
}) => {
  const isAutoMode = config.dnsMode === 'auto';

  return (
    <div className="settings-tab-panel settings-tab-panel--connection">
      {/* Connection profile */}
      <ConnectionProfilePicker
        config={config}
        updateConfig={updateConfig}
        t={t}
        ispDetection={ispDetection}
      />

      {/* DNS — modern card list */}
      <div className="v2-section">
        <div className="dns-section-header">
          <span className="v2-section-title">{t.sectionDns}</span>
          <button
            type="button"
            onClick={() => checkAllLatencies()}
            disabled={isChecking}
            className="icon-btn"
            aria-label={t.dnsCheckSpeed}
            title={t.dnsCheckSpeed}
          >
            {isChecking ? <RotateCw size={14} className="spin" /> : <Activity size={14} />}
          </button>
        </div>

        <div className="dns-card-list">
          {/* Auto Select card — always on top */}
          <div
            role="radio"
            tabIndex={0}
            aria-checked={isAutoMode}
            className={`dns-card dns-card--auto ${isAutoMode ? 'is-selected' : ''}`}
            onClick={() => {
              const next = !isAutoMode;
              updateConfig('dnsMode', next ? 'auto' : 'manual');
              if (next) checkAllLatencies(true);
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const next = !isAutoMode;
                updateConfig('dnsMode', next ? 'auto' : 'manual');
                if (next) checkAllLatencies(true);
              }
            }}
          >
            <div className="dns-card-icon dns-card-icon--auto">
              <Sparkles size={14} strokeWidth={2.2} />
            </div>
            <div className="dns-card-meta">
              <span className="dns-card-name">{t.dnsAutoSelect}</span>
              <span className="dns-card-desc">{t.dnsAutoSelectDesc}</span>
            </div>
            <div className={`dns-card-radio ${isAutoMode ? 'on' : ''}`}>
              {isAutoMode && <div className="dns-card-radio-dot" />}
            </div>
          </div>

          {/* DNS providers */}
          {sortedProviders.filter((p) => p.id !== 'system').map((p) => {
              const isSelected = !isAutoMode && config.selectedDns === p.id;
              const brand = DNS_BRANDS[p.id] || { color: '#71717a', short: p.name?.[0] || '?' };
              const ms = latencies[p.id];
              return (
                <div
                  key={p.id}
                  role="radio"
                  tabIndex={0}
                  aria-checked={isSelected}
                  className={`dns-card ${isSelected ? 'is-selected' : ''} ${isAutoMode ? 'is-locked' : ''}`}
                  style={{ opacity: isAutoMode ? 0.55 : 1 }}
                  onClick={() => {
                    if (isAutoMode) return;
                    updateConfig('selectedDns', p.id);
                  }}
                  onKeyDown={(e) => {
                    if (isAutoMode) return;
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      updateConfig('selectedDns', p.id);
                    }
                  }}
                >
                  <div
                    className="dns-card-icon"
                    style={{ background: brand.color, color: '#fff' }}
                  >
                    {brand.short}
                  </div>
                  <div className="dns-card-meta">
                    <span className="dns-card-name">{p.name}</span>
                    <span className="dns-card-desc">{p.desc}</span>
                  </div>
                  {ms ? (
                    <span className={`dns-card-ping ${pingClass(ms)}`}>{ms}ms</span>
                  ) : (
                    <div className={`dns-card-radio ${isSelected ? 'on' : ''}`}>
                      {isSelected && <div className="dns-card-radio-dot" />}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Connect other devices — LAN sharing toggle */}
      <div className="v2-section">
        <div className="v2-section-title">{t.sectionConnectOtherDevices}</div>
        <div className="v2-card">
          <div className="v2-item">
            <div className="v2-icon"><Smartphone size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.connectionLanShareTitle}</h3>
              <p>{t.connectionLanShareDesc}</p>
            </div>
            <Toggle
              checked={config.lanSharing || false}
              onChange={(v) => updateConfig('lanSharing', v)}
              label={t.connectionLanShareTitle}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsConnectionTab);
