import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Power, Zap, RotateCw, Pin, AlertTriangle, Bell } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';
import Toggle from './Toggle';

/** Ayarlar → UYGULAMA sekmesi: Dil + Otomasyon + Genel + Bildirim (ana toggle). */
const SettingsAppTab = ({ config, updateConfig, t, lang, autostartEnabled, toggleAutostart }) => (
  <motion.div
    key="app-tab"
    initial={{ opacity: 0, x: -15 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 15 }}
    transition={{ duration: 0.2, ease: 'easeInOut' }}
    style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
  >
    {/* Dil */}
    <div className="v2-section">
      <div className="v2-section-title">{t.language}</div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '-4px 0 12px 6px' }}>{t.languageDesc}</p>
      <div className="v2-card">
        {SUPPORTED_LANGUAGES.map((l, index) => (
          <React.Fragment key={l.code}>
            <div
              className={`v2-item hover-effect ${lang === l.code ? 'v2-selected' : ''}`}
              style={{ padding: '12px 16px' }}
              onClick={() => updateConfig('language', l.code)}
            >
              <div className="v2-icon">
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{l.flag}</span>
              </div>
              <div className="v2-item-text">
                <h3>{l.name}</h3>
                <p>{l.code.toUpperCase()}</p>
              </div>
              <div className={`v2-radio ${lang === l.code ? 'on' : ''}`}>
                {lang === l.code && <div className="v2-radio-dot" />}
              </div>
            </div>
            {index < SUPPORTED_LANGUAGES.length - 1 && <div className="v2-divider" />}
          </React.Fragment>
        ))}
      </div>
    </div>

    {/* Otomasyon */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionAutomation}</div>
      <div className="v2-card">
        <div className="v2-item">
          <div className="v2-icon"><Zap size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoConnect}</h3>
            <p>{t.autoConnectDesc}</p>
          </div>
          <Toggle checked={config.autoConnect} onChange={(v) => updateConfig('autoConnect', v)} />
        </div>
        <div className="v2-divider" />
        <div className="v2-item">
          <div className="v2-icon"><RotateCw size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoReconnect}</h3>
            <p>{t.autoReconnectDesc}</p>
          </div>
          <Toggle checked={config.autoReconnect} onChange={(v) => updateConfig('autoReconnect', v)} />
        </div>
      </div>
    </div>

    {/* Genel */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionGeneral}</div>
      <div className="v2-card">
        <div className="v2-item">
          <div className="v2-icon"><Power size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoStart}</h3>
            <p>{t.autoStartDesc}</p>
          </div>
          <Toggle checked={autostartEnabled} onChange={toggleAutostart} />
        </div>
        <div className="v2-divider" />
        <div className="v2-item">
          <div className="v2-icon"><ChevronLeft size={20} style={{ transform: 'rotate(-90deg)' }} /></div>
          <div className="v2-item-text">
            <h3>{t.minimizeToTray}</h3>
            <p>{t.minimizeToTrayDesc}</p>
          </div>
          <Toggle checked={config.minimizeToTray} onChange={(v) => updateConfig('minimizeToTray', v)} />
        </div>
        <div className="v2-divider" />
        <div className="v2-item">
          <div className="v2-icon"><Pin size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.alwaysOnTop || 'Her Şeyin Üzerinde Tut'}</h3>
            <p>{t.alwaysOnTopDesc || 'Pencere her zaman diğer pencerelerin üzerinde kalır'}</p>
          </div>
          <Toggle checked={config.alwaysOnTop || false} onChange={(v) => updateConfig('alwaysOnTop', v)} />
        </div>
        <div className="v2-divider" />
        <div className="v2-item">
          <div className="v2-icon"><AlertTriangle size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.requireConfirmation}</h3>
            <p>{t.requireConfirmationDesc}</p>
          </div>
          <Toggle
            checked={config.requireConfirmation !== false}
            onChange={(v) => updateConfig('requireConfirmation', v)}
          />
        </div>
      </div>
    </div>

    {/* Bildirim — tek ana toggle (detaylar Gelişmiş'te) */}
    <div className="v2-section">
      <div className="v2-section-title">{t.sectionNotifications}</div>
      <div className="v2-card">
        <div className="v2-item">
          <div className="v2-icon"><Bell size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.notifications}</h3>
            <p>{t.notificationsDesc}</p>
          </div>
          <Toggle
            checked={config.notifications !== false}
            onChange={(v) => updateConfig('notifications', v)}
          />
        </div>
      </div>
    </div>
  </motion.div>
);

export default SettingsAppTab;
