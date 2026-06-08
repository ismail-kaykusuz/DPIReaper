import React, { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, Globe, Activity, AlertTriangle, Check, Wrench, Gamepad2, RotateCw,
  ShieldCheck, Plus, Trash2, MessageCircle,
} from 'lucide-react';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { APP, URLS } from '../constants';
import Toggle from './Toggle';

/** Settings → ADVANCED tab (order: Defender → Custom bypass → Troubleshoot → Expert settings → About). */
const SettingsAdvancedTab = ({
  config,
  updateConfig,
  t,
  fixStatus,
  handleFixInternet,
  isConnected = false,
  currentPort = 0,
  defenderDecision = null,
  requestDefenderExclusion = async () => false,
  isActive = true,
}) => {
  // C18: Network interfaces (read-only info)
  const [interfaces, setInterfaces] = useState([]);

  const [newDomain, setNewDomain] = useState('');
  const customDomains = Array.isArray(config.customBypassDomains) ? config.customBypassDomains : [];

  const [defenderBusy, setDefenderBusy] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    invoke('list_network_interfaces').then((list) => {
      if (Array.isArray(list)) setInterfaces(list);
    }).catch(() => {});
  }, [isActive]);

  const addCustomDomain = useCallback(() => {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (!/^[a-z0-9.\-*]+$/.test(d) || d.length > 253) return;
    if (customDomains.includes(d)) {
      setNewDomain('');
      return;
    }
    const next = [...customDomains, d].slice(0, 64);
    updateConfig('customBypassDomains', next);
    setNewDomain('');
    if (isConnected && currentPort) {
      invoke('apply_custom_bypass', { domains: next, proxyPort: currentPort }).catch(() => {});
    }
  }, [newDomain, customDomains, updateConfig, isConnected, currentPort]);

  const removeCustomDomain = useCallback((d) => {
    const next = customDomains.filter((x) => x !== d);
    updateConfig('customBypassDomains', next);
    if (isConnected && currentPort) {
      invoke('apply_custom_bypass', { domains: next, proxyPort: currentPort }).catch(() => {});
    }
  }, [customDomains, updateConfig, isConnected, currentPort]);

  const handleAddDefender = async () => {
    if (defenderBusy) return;
    setDefenderBusy(true);
    try {
      await requestDefenderExclusion();
    } finally {
      setDefenderBusy(false);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* 1) Windows Defender exclusion — security critical, top */}
      <div className="v2-section">
        <div className="v2-section-title">{t.sectionDefender}</div>
        <div className="v2-card defender-card">
          {defenderDecision === 'added' ? (
            <div className="defender-row defender-row--ok">
              <div className="defender-row-icon defender-row-icon--ok">
                <ShieldCheck size={20} />
              </div>
              <div className="defender-row-text">
                <h3>{t.defenderAddedTitle}</h3>
                <p>{t.defenderAddedDesc}</p>
              </div>
              <Check size={18} className="defender-row-tick" />
            </div>
          ) : (
            <div className="defender-row">
              <div className="defender-row-icon defender-row-icon--warn">
                <ShieldCheck size={20} />
              </div>
              <div className="defender-row-text">
                <h3>{t.defenderNotAddedTitle}</h3>
                <p>{t.defenderNotAddedDesc}</p>
                <button
                  type="button"
                  onClick={handleAddDefender}
                  disabled={defenderBusy}
                  className="defender-add-btn"
                >
                  {defenderBusy && <RotateCw size={14} className="spinning" />}
                  {defenderBusy ? t.defenderAddingBtn : t.defenderAddBtn}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2) Custom bypass list */}
      <div className="v2-section">
        <div className="custom-bypass-header">
          <h2>{t.sectionCustomBypass}</h2>
          <p>{t.customBypassHint}</p>
        </div>
        <div className="custom-bypass-list">
          <div className="custom-bypass-input-row">
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder={t.customBypassPlaceholder}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomDomain(); }}
              className="custom-bypass-input"
              aria-label={t.customBypassPlaceholder}
            />
            <button
              type="button"
              onClick={addCustomDomain}
              disabled={!newDomain.trim()}
              className="custom-bypass-add-btn"
              aria-label={t.customBypassAdd}
              title={t.customBypassAdd}
            >
              <Plus size={16} strokeWidth={2.4} />
            </button>
          </div>

          {customDomains.length === 0 ? (
            <div className="custom-bypass-empty">{t.customBypassEmpty}</div>
          ) : (
            <ul className="custom-bypass-items">
              {customDomains.map((d) => (
                <li key={d} className="custom-bypass-item">
                  <Globe size={14} strokeWidth={2} className="custom-bypass-item-icon" />
                  <span className="custom-bypass-item-text">{d}</span>
                  <button
                    type="button"
                    onClick={() => removeCustomDomain(d)}
                    className="custom-bypass-item-remove"
                    aria-label={t.customBypassRemove}
                    title={t.customBypassRemove}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 3) Troubleshooting */}
      <div className="v2-section">
        <div className="v2-section-title">{t.sectionTroubleshoot}</div>
        <div className="v2-card">
          <div
            className="v2-item hover-effect"
            onClick={handleFixInternet}
            style={{ cursor: fixStatus === 'idle' ? 'pointer' : 'default' }}
          >
            <div className={`v2-icon ${fixStatus !== 'idle' ? 'accent' : ''}`}>
              <Wrench size={20} className={fixStatus === 'fixing' ? 'spinning' : ''} />
            </div>
            <div className="v2-item-text">
              <h3>
                {fixStatus === 'fixing' ? t.fixRepairing
                  : fixStatus === 'fixed' ? t.fixDone
                  : fixStatus === 'error' ? t.fixError
                  : t.fixInternet}
              </h3>
              <p>
                {fixStatus === 'fixing' ? t.fixRepairingDesc
                  : fixStatus === 'fixed' ? t.fixDoneDesc
                  : fixStatus === 'error' ? t.fixErrorDesc
                  : t.fixInternetDesc}
              </p>
            </div>
            <div style={{ padding: '0 0.5rem', color: 'var(--text-secondary)' }}>
              {fixStatus === 'fixing' && <RotateCw size={20} className="spinning" />}
              {fixStatus === 'fixed' && <Check size={20} style={{ color: 'var(--accent-green)' }} />}
              {fixStatus === 'error' && <AlertTriangle size={20} style={{ color: 'var(--accent)' }} />}
            </div>
          </div>
        </div>
      </div>

      {/* 4) Expert settings — IPv4 + WinHTTP toggles. LAN sharing is now on Connection tab. */}
      <div className="v2-section">
        <div className="v2-section-title">{t.sectionAdvancedNetwork}</div>
        <div className="v2-card">
          <div className="v2-item">
            <div className="v2-icon"><Activity size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.ipv4ForceTitle}</h3>
              <p>{t.ipv4ForceDesc}</p>
            </div>
            <Toggle checked={config.ipv4Only !== false} onChange={(v) => updateConfig('ipv4Only', v)} label={t.ipv4ForceTitle} />
          </div>
          <div className="v2-divider" />
          <div className="v2-item">
            <div className="v2-icon"><Gamepad2 size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.winHttpForceTitle}</h3>
              <p>{t.winHttpForceDesc}</p>
            </div>
            <Toggle checked={config.enableWinhttp !== false} onChange={(v) => updateConfig('enableWinhttp', v)} label={t.winHttpForceTitle} />
          </div>
        </div>

        {/* C18: Detected network interfaces (read-only) */}
        {interfaces.length > 0 && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <div style={{ fontSize: 'var(--font-micro, 0.66rem)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 4 }}>
              {t.sectionAdvancedNetwork}
            </div>
            {interfaces.slice(0, 4).map((iface) => (
              <div key={iface.name + iface.ip} style={{ fontSize: 'var(--font-caption, 0.72rem)', color: iface.is_virtual ? 'var(--text-tertiary)' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{iface.name}</span>
                <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{iface.ip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5) About — at bottom */}
      <div className="v2-section">
        <div className="v2-section-title">{t.sectionAbout}</div>
        <div className="v2-card">
          <div className="v2-item">
            <img src={APP.logo} alt="DPIReaper" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
            <div className="v2-item-text">
              <h3>{APP.name}</h3>
              <p>{t.aboutVersion}: {APP.version}</p>
            </div>
          </div>
          <div className="v2-divider" />
          <div className="v2-item">
            <div className="v2-icon"><Check size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.aboutPrivacy}</h3>
              <p>{t.aboutPrivacyValue}</p>
            </div>
          </div>
          <div className="v2-divider" />
          <div
            className="v2-item hover-effect"
            onClick={() => openShell(URLS.github).catch(() => {})}
            style={{ cursor: 'pointer' }}
          >
            <div className="v2-icon"><Globe size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.aboutSource}</h3>
            </div>
            <ChevronLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }} />
          </div>
          <div className="v2-divider" />
          <div
            className="v2-item hover-effect"
            onClick={() => openShell(URLS.discord).catch(() => {})}
            style={{ cursor: 'pointer' }}
          >
            <div className="v2-icon"><MessageCircle size={20} /></div>
            <div className="v2-item-text">
              <h3>{t.aboutSupport}</h3>
              <p>{t.aboutSupportValue}</p>
            </div>
            <ChevronLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }} />
          </div>
        </div>
        <p style={{
          marginTop: 10,
          textAlign: 'center',
          fontSize: 'var(--font-micro, 0.66rem)',
          color: 'var(--text-tertiary)',
          letterSpacing: 0.4,
        }}>
          {t.aboutCopyright}
        </p>
      </div>
    </div>
  );
};

export default React.memo(SettingsAdvancedTab);
