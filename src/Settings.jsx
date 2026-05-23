import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, Globe, Wrench, Settings as SettingsIcon } from 'lucide-react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import { getTranslations } from './i18n';
import SettingsAppTab from './settings/SettingsAppTab';
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
const Settings = ({ onBack, config, updateConfig, dnsLatencies, setDnsLatencies }) => {
  const [activeTab, setActiveTab] = useState('connection');
  const scrollRef = useRef(null);

  // Npcap durumu
  const [driverInstalled, setDriverInstalled] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  // DNS state (App.jsx prop'undan)
  const latencies = dnsLatencies || {};
  const setLatencies = setDnsLatencies || (() => {});
  const [isChecking, setIsChecking] = useState(false);
  const [sortedProviders, setSortedProviders] = useState([]);

  // Otomatik başlatma
  const [autostartEnabled, setAutostartEnabled] = useState(false);

  // Sorun giderme + Defender
  const [fixStatus, setFixStatus] = useState('idle');
  const [defenderExclusionMsg, setDefenderExclusionMsg] = useState(null);

  const lang = config.language || 'tr';
  const t = getTranslations(lang);

  const DNS_PROVIDERS = useMemo(() => [
    { id: 'system',     name: t.dnsSystemDefault, desc: t.dnsSystemDefaultDesc, ip: null },
    { id: 'cloudflare', name: 'Cloudflare',        desc: t.dnsCfDesc,       ip: '1.1.1.1' },
    { id: 'adguard',    name: 'AdGuard',           desc: t.dnsAdguardDesc,  ip: '94.140.14.14' },
    { id: 'google',     name: 'Google',            desc: t.dnsGoogleDesc,   ip: '8.8.8.8' },
    { id: 'quad9',      name: 'Quad9',             desc: t.dnsQuad9Desc,    ip: '9.9.9.9' },
    { id: 'opendns',    name: 'OpenDNS',           desc: t.dnsOpenDnsDesc,  ip: '208.67.222.222' },
  ], [t]);

  useEffect(() => {
    invoke('check_driver').then(setDriverInstalled).catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab]);

  useEffect(() => {
    if (Object.keys(latencies).length > 0) {
      const systemDns = DNS_PROVIDERS.find((p) => p.id === 'system');
      const otherDns = DNS_PROVIDERS.filter((p) => p.id !== 'system')
        .sort((a, b) => (latencies[a.id] || 999) - (latencies[b.id] || 999));
      setSortedProviders(systemDns ? [systemDns, ...otherDns] : otherDns);
    } else {
      setSortedProviders(DNS_PROVIDERS);
    }
  }, [lang, latencies, DNS_PROVIDERS]);

  useEffect(() => {
    (async () => {
      try {
        const active = await isEnabled();
        setAutostartEnabled(active);
      } catch (e) {
        console.error('Autostart check failed:', e);
      }
    })();
  }, []);

  const toggleAutostart = async (val) => {
    try {
      if (val) await enable(); else await disable();
      setAutostartEnabled(val);
      updateConfig('autoStart', val);
    } catch (e) {
      console.error('Autostart toggle failed:', e);
    }
  };

  const checkAllLatencies = async (forceSelectBest = false) => {
    setIsChecking(true);
    const newLatencies = {};
    const pingableProviders = DNS_PROVIDERS.filter((p) => p.ip !== null);

    const results = await Promise.allSettled(
      pingableProviders.map(async (provider) => {
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

    const systemDns = DNS_PROVIDERS.find((p) => p.id === 'system');
    const otherDns = DNS_PROVIDERS.filter((p) => p.id !== 'system')
      .sort((a, b) => (newLatencies[a.id] || 999) - (newLatencies[b.id] || 999));
    setSortedProviders(systemDns ? [systemDns, ...otherDns] : otherDns);

    if (forceSelectBest || config.dnsMode === 'auto') {
      const bestDns = otherDns[0];
      if (bestDns) updateConfig('selectedDns', bestDns.id);
    }

    setIsChecking(false);
  };

  const handleFixInternet = async () => {
    if (fixStatus === 'fixing') return;
    setFixStatus('fixing');
    try {
      await invoke('clear_system_proxy');
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
          {activeTab === 'app' && (
            <SettingsAppTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              lang={lang}
              autostartEnabled={autostartEnabled}
              toggleAutostart={toggleAutostart}
            />
          )}

          {activeTab === 'connection' && (
            <SettingsConnectionTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              sortedProviders={sortedProviders}
              latencies={latencies}
              isChecking={isChecking}
              checkAllLatencies={checkAllLatencies}
            />
          )}

          {activeTab === 'advanced' && (
            <SettingsAdvancedTab
              config={config}
              updateConfig={updateConfig}
              t={t}
              driverInstalled={driverInstalled}
              setDriverInstalled={setDriverInstalled}
              needsRestart={needsRestart}
              setNeedsRestart={setNeedsRestart}
              defenderExclusionMsg={defenderExclusionMsg}
              setDefenderExclusionMsg={setDefenderExclusionMsg}
              fixStatus={fixStatus}
              handleFixInternet={handleFixInternet}
            />
          )}
        </AnimatePresence>
      </div>

      <nav className="bottom-nav" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <button
          className={`nav-btn ${activeTab === 'connection' ? 'active' : ''}`}
          onClick={() => setActiveTab('connection')}
        >
          <Globe size={20} strokeWidth={activeTab === 'connection' ? 2.4 : 2} />
          <span>{t.tabConnection || 'BAĞLANTI'}</span>
        </button>
        <div className="nav-divider" />
        <button
          className={`nav-btn ${activeTab === 'app' ? 'active' : ''}`}
          onClick={() => setActiveTab('app')}
        >
          <SettingsIcon size={20} strokeWidth={activeTab === 'app' ? 2.4 : 2} />
          <span>{t.tabApp || 'UYGULAMA'}</span>
        </button>
        <div className="nav-divider" />
        <button
          className={`nav-btn ${activeTab === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveTab('advanced')}
        >
          <Wrench size={20} strokeWidth={activeTab === 'advanced' ? 2.4 : 2} />
          <span>{t.tabAdvanced || 'GELİŞMİŞ'}</span>
        </button>
      </nav>
    </div>
  );
};

export default Settings;
