import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Globe, Activity, AlertTriangle, Check, Wrench, Gamepad2, RotateCw } from 'lucide-react';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { APP } from '../constants';
import Toggle from './Toggle';

const REPO_URL = 'https://github.com/dpireaper';
const SUPPORT_URL = 'https://github.com/dpireaper/issues';

/** Ayarlar → GELİŞMİŞ sekmesi: Ağ + Bildirim Türleri + Sorun Giderme + Hakkında. */
const SettingsAdvancedTab = ({
  config,
  updateConfig,
  t,
  fixStatus,
  handleFixInternet,
}) => (
  <motion.div
    key="advanced-tab"
    initial={{ opacity: 0, x: -15 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 15 }}
    transition={{ duration: 0.2, ease: 'easeInOut' }}
    style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
  >
    {/* Uyarı şeridi */}
    <div style={{
      padding: '10px 14px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      background: 'var(--surface-1)',
      color: 'var(--text-secondary)',
      fontSize: '0.75rem',
      lineHeight: 1.45,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{t.advancedHint}</span>
    </div>

    {/* Gelişmiş Ağ */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionAdvancedNetwork}</div>
      <div className="v2-card">
        <div className="v2-item" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="v2-icon"><Activity size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.ipv4ForceTitle}</h3>
            <p>{t.ipv4ForceDesc}</p>
          </div>
          <Toggle checked={config.ipv4Only !== false} onChange={(v) => updateConfig('ipv4Only', v)} />
        </div>
        <div className="v2-item" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="v2-icon"><Gamepad2 size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.winHttpForceTitle}</h3>
            <p>{t.winHttpForceDesc}</p>
          </div>
          <Toggle checked={config.enableWinhttp !== false} onChange={(v) => updateConfig('enableWinhttp', v)} />
        </div>
        <div className="v2-item">
          <div className="v2-icon"><Globe size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.lanSharing}</h3>
            <p>{t.lanSharingDesc}</p>
          </div>
          <Toggle checked={config.lanSharing || false} onChange={(v) => updateConfig('lanSharing', v)} />
        </div>
      </div>
    </div>

    {/* Bildirim Türleri (alt detay) */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionAdvancedNotifications}</div>
      <div
        className="v2-card"
        style={{
          opacity: config.notifications !== false ? 1 : 0.45,
          pointerEvents: config.notifications !== false ? 'auto' : 'none',
          transition: 'opacity var(--transition-base)',
        }}
      >
        <div className="v2-item" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="v2-icon"><Check size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.notifyOnConnect}</h3>
            <p>{t.notifyOnConnectDesc}</p>
          </div>
          <Toggle
            checked={config.notifyOnConnect !== false}
            onChange={(v) => updateConfig('notifyOnConnect', v)}
          />
        </div>
        <div className="v2-item">
          <div className="v2-icon"><AlertTriangle size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.notifyOnDisconnect}</h3>
            <p>{t.notifyOnDisconnectDesc}</p>
          </div>
          <Toggle
            checked={config.notifyOnDisconnect !== false}
            onChange={(v) => updateConfig('notifyOnDisconnect', v)}
          />
        </div>
      </div>
    </div>

    {/* Sorun Giderme */}
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

    {/* Hakkında */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionAbout}</div>
      <div className="v2-card">
        <div className="v2-item">
          <img src={APP.logo} alt="DPIReaper" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
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
          onClick={() => openShell(REPO_URL).catch(() => {})}
          style={{ cursor: 'pointer' }}
        >
          <div className="v2-icon"><Globe size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.aboutSource}</h3>
            <p>{t.aboutSourceValue}</p>
          </div>
          <ChevronLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }} />
        </div>
        <div className="v2-divider" />
        <div
          className="v2-item hover-effect"
          onClick={() => openShell(SUPPORT_URL).catch(() => {})}
          style={{ cursor: 'pointer' }}
        >
          <div className="v2-icon"><AlertTriangle size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.aboutSupport}</h3>
          </div>
          <ChevronLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }} />
        </div>
      </div>
      <p style={{
        marginTop: 10,
        textAlign: 'center',
        fontSize: '0.7rem',
        color: 'var(--text-tertiary)',
        letterSpacing: 0.4,
      }}>
        {t.aboutCopyright}
      </p>
    </div>
  </motion.div>
);

export default SettingsAdvancedTab;
