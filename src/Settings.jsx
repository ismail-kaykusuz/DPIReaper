import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, Network, Wrench, SlidersHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getTranslations } from './i18n';
import SettingsGeneralTab from './settings/SettingsGeneralTab';
import SettingsConnectionTab from './settings/SettingsConnectionTab';
import SettingsAdvancedTab from './settings/SettingsAdvancedTab';
import ConnectionProfilePicker from './settings/ConnectionProfilePicker';
import './App.css';

// Faz 3 — App.jsx ilk açılış overlay'i de bu picker'ı kullanır.
export { ConnectionProfilePicker };

/**
 * Settings — koordinatör bileşen.
 * Tüm sekme içerikleri `src/settings/Settings{App,Connection,Advanced}Tab.jsx` altındadır.
 * Bu bileşen yalnızca state + helper fonksiyonları yönetir.
 */
const Settings = ({
  onBack,
  config,
  updateConfig,
  dnsLatencies,
  setDnsLatencies,
  ispDetection = null,
  isConnected = false,
  currentPort = 0,
  defenderDecision = null,
  requestDefenderExclusion = async () => false,
  onAutostartError = null,
}) => {
  const [activeTab, setActiveTab] = useState('connection');
  const scrollRef = useRef(null);

  // DNS state (App.jsx prop'undan)
  const latencies = dnsLatencies || {};
  const setLatencies = setDnsLatencies || (() => {});
  const [isChecking, setIsChecking] = useState(false);
  const [sortedProviders, setSortedProviders] = useState([]);

  // Otomatik başlatma
  const [autostartEnabled, setAutostartEnabled] = useState(false);

  // Sorun giderme
  const [fixStatus, setFixStatus] = useState('idle');

  const lang = config.language || 'tr';
  const t = getTranslations(lang);

  const DNS_PROVIDERS = useMemo(() => [
    { id: 'cloudflare', name: 'Cloudflare', desc: t.dnsCfDesc,       ip: '1.1.1.1' },
    { id: 'adguard',    name: 'AdGuard',    desc: t.dnsAdguardDesc,  ip: '94.140.14.14' },
    { id: 'google',     name: 'Google',     desc: t.dnsGoogleDesc,   ip: '8.8.8.8' },
    { id: 'quad9',      name: 'Quad9',      desc: t.dnsQuad9Desc,    ip: '9.9.9.9' },
    { id: 'opendns',    name: 'OpenDNS',    desc: t.dnsOpenDnsDesc,  ip: '208.67.222.222' },
  ], [t]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab]);

  useEffect(() => {
    if (Object.keys(latencies).length > 0) {
      const sorted = [...DNS_PROVIDERS].sort(
        (a, b) => (latencies[a.id] || 999) - (latencies[b.id] || 999)
      );
      setSortedProviders(sorted);
    } else {
      setSortedProviders(DNS_PROVIDERS);
    }
  }, [lang, latencies, DNS_PROVIDERS]);

  useEffect(() => {
    (async () => {
      try {
        const active = await invoke('is_autostart_registry_enabled');
        setAutostartEnabled(active);
        // Madde 1: Config ile gerçek Registry durumu uyumsuzsa config'i tetikle
        if (config.autoStart !== active) {
          updateConfig('autoStart', active);
        }
      } catch (e) {
        console.error('Autostart check failed:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C15: İlk açılışta auto DNS ping — kullanıcı butona basmak zorunda kalmasın
  useEffect(() => {
    if (config.dnsMode !== 'auto') return;
    if (Object.keys(latencies).length > 0) return;
    // Latency boşsa arkaplanda bir kez ölç ve en hızlıyı seç
    checkAllLatencies(true).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAutostart = async (val) => {
    try {
      const verified = await invoke('set_autostart_enabled', { enabled: val });
      setAutostartEnabled(verified);
      updateConfig('autoStart', verified);
    } catch (e) {
      console.error('Autostart toggle failed:', e);
      try {
        const fallback = await invoke('is_autostart_registry_enabled');
        setAutostartEnabled(fallback);
        updateConfig('autoStart', fallback);
      } catch (_) { /* sessizce yut */ }
      onAutostartError?.(t.autostartEnableFailed);
    }
  };

  const checkAllLatencies = async (forceSelectBest = false) => {
    setIsChecking(true);
    const newLatencies = {};

    const results = await Promise.allSettled(
      DNS_PROVIDERS.map(async (provider) => {
        try {
          const latency = await invoke('check_dns_latency', { dnsIp: provider.ip });
          return { id: provider.id, latency };
        } catch (e) {
          console.error(`Ping failed for ${provider.name}:`, e);
          return { id: provider.id, latency: 999 };
        }
      })
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') newLatencies[r.value.id] = r.value.latency;
    });

    setLatencies(newLatencies);

    const sorted = [...DNS_PROVIDERS].sort(
      (a, b) => (newLatencies[a.id] || 999) - (newLatencies[b.id] || 999)
    );
    setSortedProviders(sorted);

    if (forceSelectBest || config.dnsMode === 'auto') {
      const bestDns = sorted[0];
      if (bestDns) updateConfig('selectedDns', bestDns.id);
    }

    setIsChecking(false);
  };

  const handleFixInternet = async () => {
    if (fixStatus === 'fixing') return;
    setFixStatus('fixing');
    try {
      // C16: Genişletilmiş onarım — proxy clear + WinHTTP reset + flushdns + firewall
      await invoke('repair_internet_extended');
      window.dispatchEvent(new CustomEvent('dpireaper-force-disconnect', {
        detail: { reason: 'manual-fix' },
      }));
      setFixStatus('fixed');
      setTimeout(() => setFixStatus('idle'), 2000);
    } catch (e) {
      console.error('Fix failed:', e);
      setFixStatus('error');
      setTimeout(() => setFixStatus('idle'), 2000);
    }
  };

  return (
    <div className="v2-settings-overlay">
      <div className="v2-settings-header">
        <button className="v2-back-btn" onClick={onBack}>
          <ChevronLeft size={28} />
        </button>
        <h1>{t.settingsTitle}</h1>
      </div>

      <div className="v2-settings-content" ref={scrollRef}>
        <AnimatePresence mode="wait">
          {activeTab === 'connection' && (
            <SettingsConnectionTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              sortedProviders={sortedProviders}
              latencies={latencies}
              isChecking={isChecking}
              checkAllLatencies={checkAllLatencies}
              ispDetection={ispDetection}
            />
          )}

          {activeTab === 'general' && (
            <SettingsGeneralTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              lang={lang}
              autostartEnabled={autostartEnabled}
              toggleAutostart={toggleAutostart}
            />
          )}

          {activeTab === 'advanced' && (
            <SettingsAdvancedTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              fixStatus={fixStatus}
              handleFixInternet={handleFixInternet}
              isConnected={isConnected}
              currentPort={currentPort}
              defenderDecision={defenderDecision}
              requestDefenderExclusion={requestDefenderExclusion}
            />
          )}
        </AnimatePresence>
      </div>

      <nav className="bottom-nav" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <button
          className={`nav-btn nav-btn--icon ${activeTab === 'connection' ? 'active' : ''}`}
          onClick={() => setActiveTab('connection')}
          aria-label={t.tabConnection}
          title={t.tabConnection}
        >
          <Network size={20} strokeWidth={activeTab === 'connection' ? 2.4 : 2} />
        </button>
        <div className="nav-divider" />
        <button
          className={`nav-btn nav-btn--icon ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
          aria-label={t.tabGeneral || t.tabApp}
          title={t.tabGeneral || t.tabApp}
        >
          <SlidersHorizontal size={20} strokeWidth={activeTab === 'general' ? 2.4 : 2} />
        </button>
        <div className="nav-divider" />
        <button
          className={`nav-btn nav-btn--icon ${activeTab === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveTab('advanced')}
          aria-label={t.tabAdvanced}
          title={t.tabAdvanced}
        >
          <Wrench size={20} strokeWidth={activeTab === 'advanced' ? 2.4 : 2} />
        </button>
      </nav>
    </div>
  );
};

export default Settings;
