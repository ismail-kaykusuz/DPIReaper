import React from 'react';
import { Power, Zap, RotateCw, Pin, AlertTriangle, Bell, Eye, Check } from 'lucide-react';
import Toggle from './Toggle';
import LanguagePicker from '../overlays/LanguagePicker';

/** Settings → General tab (language, startup, notifications). */
const SettingsGeneralTab = ({ config, updateConfig, t, lang, autostartEnabled, toggleAutostart }) => (
  <div className="settings-tab-panel">
    <div className="v2-section">
      <LanguagePicker
        value={lang}
        onChange={(code) => updateConfig('language', code)}
        t={t}
      />
    </div>

    <div className="v2-section">
      <div className="v2-section-title">{t.sectionGeneral}</div>
      <div className="v2-card">
        <div className="v2-item">
          <div className="v2-icon"><Power size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoStart}</h3>
            <p>{t.autoStartDesc}</p>
          </div>
          <Toggle checked={autostartEnabled} onChange={toggleAutostart} label={t.autoStart} />
        </div>

        {/* Sub: start hidden — only when autostart enabled */}
        {autostartEnabled && (
          <>
            <div className="v2-divider" />
            <div className="v2-item v2-item--sub">
              <div className="v2-icon"><Eye size={20} /></div>
              <div className="v2-item-text">
                <h3>{t.autoStartHidden}</h3>
                <p>{t.autoStartHiddenDesc}</p>
              </div>
              <Toggle
                checked={config.startHidden !== false}
                onChange={(v) => updateConfig('startHidden', v)}
                label={t.autoStartHidden}
              />
            </div>
          </>
        )}

        <div className="v2-divider" />
        {/* Connect on launch */}
        <div className="v2-item">
          <div className="v2-icon"><Zap size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoConnect}</h3>
            <p>{t.autoConnectDesc}</p>
          </div>
          <Toggle checked={config.autoConnect} onChange={(v) => updateConfig('autoConnect', v)} label={t.autoConnect} />
        </div>

        <div className="v2-divider" />
        {/* Auto reconnect */}
        <div className="v2-item">
          <div className="v2-icon"><RotateCw size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.autoReconnect}</h3>
            <p>{t.autoReconnectDesc}</p>
          </div>
          <Toggle checked={config.autoReconnect} onChange={(v) => updateConfig('autoReconnect', v)} label={t.autoReconnect} />
        </div>

        <div className="v2-divider" />
        {/* Minimize to tray */}
        <div className="v2-item">
          <div className="v2-icon"><Check size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.minimizeToTray}</h3>
            <p>{t.minimizeToTrayDesc}</p>
          </div>
          <Toggle checked={config.minimizeToTray} onChange={(v) => updateConfig('minimizeToTray', v)} label={t.minimizeToTray} />
        </div>

        <div className="v2-divider" />
        {/* Always on top */}
        <div className="v2-item">
          <div className="v2-icon"><Pin size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.alwaysOnTop}</h3>
            <p>{t.alwaysOnTopDesc}</p>
          </div>
          <Toggle
            checked={config.alwaysOnTop || false}
            onChange={(v) => updateConfig('alwaysOnTop', v)}
            label={t.alwaysOnTop}
          />
        </div>

        <div className="v2-divider" />
        {/* Require confirmation */}
        <div className="v2-item">
          <div className="v2-icon"><AlertTriangle size={20} /></div>
          <div className="v2-item-text">
            <h3>{t.requireConfirmation}</h3>
            <p>{t.requireConfirmationDesc}</p>
          </div>
          <Toggle
            checked={config.requireConfirmation !== false}
            onChange={(v) => updateConfig('requireConfirmation', v)}
            label={t.requireConfirmation}
          />
        </div>
      </div>
    </div>

    {/* 3) Bildirimler — master + sub */}
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
            label={t.notifications}
          />
        </div>
        {config.notifications !== false && (
          <>
            <div className="v2-divider" />
            <div className="v2-item v2-item--sub">
              <div className="v2-icon"><Check size={20} /></div>
              <div className="v2-item-text">
                <h3>{t.notifyOnConnect}</h3>
                <p>{t.notifyOnConnectDesc}</p>
              </div>
              <Toggle
                checked={config.notifyOnConnect !== false}
                onChange={(v) => updateConfig('notifyOnConnect', v)}
                label={t.notifyOnConnect}
              />
            </div>
            <div className="v2-divider" />
            <div className="v2-item v2-item--sub">
              <div className="v2-icon"><AlertTriangle size={20} /></div>
              <div className="v2-item-text">
                <h3>{t.notifyOnError || t.notifyOnDisconnect}</h3>
                <p>{t.notifyOnErrorDesc || t.notifyOnDisconnectDesc}</p>
              </div>
              <Toggle
                checked={config.notifyOnDisconnect !== false}
                onChange={(v) => updateConfig('notifyOnDisconnect', v)}
                label={t.notifyOnError || t.notifyOnDisconnect}
              />
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);

export default React.memo(SettingsGeneralTab);
