import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCw, Activity } from 'lucide-react';
import Toggle from './Toggle';
import ConnectionProfilePicker from './ConnectionProfilePicker';

/** Ayarlar → BAĞLANTI sekmesi: profil seçici + DNS. */
const SettingsConnectionTab = ({
  config,
  updateConfig,
  t,
  sortedProviders,
  latencies,
  isChecking,
  checkAllLatencies,
  ispDetection = null,
}) => (
  <motion.div
    key="connection-tab"
    initial={{ opacity: 0, x: -15 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 15 }}
    transition={{ duration: 0.2, ease: 'easeInOut' }}
    style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
  >
    {/* Bağlantı profili (tek karar) */}
    <ConnectionProfilePicker config={config} updateConfig={updateConfig} t={t} ispDetection={ispDetection} />

    {/* DNS */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionDns}</div>
      <div className="v2-card">
        {/* Otomatik Seçim — her zaman en üstte ve ilk kurulumda varsayılan */}
        <div className="v2-item">
          <div className="v2-item-text">
            <h3>{t.dnsAutoSelect}</h3>
            <p>{t.dnsAutoSelectDesc}</p>
          </div>
          <Toggle
            checked={config.dnsMode === 'auto'}
            onChange={(v) => {
              updateConfig('dnsMode', v ? 'auto' : 'manual');
              if (v) checkAllLatencies(true);
            }}
          />
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <button
            type="button"
            onClick={() => checkAllLatencies()}
            disabled={isChecking}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              padding: '10px 0',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isChecking ? 'wait' : 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            {isChecking ? <RotateCw size={16} className="spin" /> : <Activity size={16} />}
            {isChecking ? t.dnsChecking : t.dnsCheckSpeed}
          </button>
        </div>

        <div className="v2-divider" style={{ margin: 0 }} />

        <div className="v2-dns-list">
          <AnimatePresence>
            {sortedProviders.filter((p) => p.id !== 'system').map((p) => {
              const isSelected = config.selectedDns === p.id;
              const isAutoMode = config.dnsMode === 'auto';
              const isDisabled = isAutoMode;
              return (
                <motion.div
                  layout
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: isDisabled ? (isSelected ? 1 : 0.5) : (!isSelected ? 0.45 : 1),
                    y: 0,
                  }}
                  whileHover={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className={`v2-dns-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (isDisabled) return;
                    updateConfig('selectedDns', p.id);
                  }}
                >
                  <div className={`v2-radio ${isSelected ? 'on' : ''}`}>
                    {isSelected && <div className="v2-radio-dot" />}
                  </div>
                  <div className="v2-dns-info">
                    <span className="v2-dns-name">{p.name}</span>
                    <span className="v2-dns-desc">{p.desc}</span>
                  </div>
                  {latencies[p.id] && (
                    <div className="v2-latency">{latencies[p.id]}ms</div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  </motion.div>
);

export default SettingsConnectionTab;
