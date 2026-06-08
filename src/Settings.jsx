import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronLeft, Network, Wrench, SlidersHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getTranslations } from './i18n';
import { LS_KEYS } from './constants';
import SettingsGeneralTab from './settings/SettingsGeneralTab';
import SettingsConnectionTab from './settings/SettingsConnectionTab';
import SettingsAdvancedTab from './settings/SettingsAdvancedTab';
import ConnectionProfilePicker from './settings/ConnectionProfilePicker';
import './App.css';

export { ConnectionProfilePicker };

const DNS_CACHE_KEY = 'dpireaper_dns_latency_cache';
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

function readDnsCache() {
  try {
    const raw = localStorage.getItem(DNS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.latencies) return null;
    if (Date.now() - parsed.ts > DNS_CACHE_TTL_MS) return null;
    return parsed.latencies;
  } catch {
    return null;
  }
}

function writeDnsCache(latencies) {
  try {
    localStorage.setItem(DNS_CACHE_KEY, JSON.stringify({ ts: Date.now(), latencies }));
  } catch {
    /* ignore */
  }
}

function mergeConfigUpdate(prev, keyOrObj, value) {
  if (typeof keyOrObj === 'object' && keyOrObj !== null) {
    return { ...prev, ...keyOrObj };
  }
  return { ...prev, [keyOrObj]: value };
}

/**
 * Settings — isolated session: config and DNS latencies stay in local state.
 * Parent App does not re-render on each toggle; syncs once on close.
 */
const Settings = ({
  initialConfig,
  onClose,
  ispDetection = null,
  isConnected = false,
  currentPort = 0,
  defenderDecision = null,
  requestDefenderExclusion = async () => false,
  onAutostartError = null,
}) => {
  const [localConfig, setLocalConfig] = useState(initialConfig);
  const [activeTab, setActiveTab] = useState('connection');
  const scrollRef = useRef(null);
  const dnsCheckStartedRef = useRef(false);
  const configWriteTimerRef = useRef(null);

  const [latencies, setLatencies] = useState(() => readDnsCache() || {});
  const [isChecking, setIsChecking] = useState(false);
  const [sortedProviders, setSortedProviders] = useState([]);

  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [fixStatus, setFixStatus] = useState('idle');

  const lang = localConfig.language || 'tr';
  const t = useMemo(() => getTranslations(lang), [lang]);

  const DNS_PROVIDERS = useMemo(() => [
    { id: 'cloudflare', name: 'Cloudflare', desc: t.dnsCfDesc,       ip: '1.1.1.1' },
    { id: 'adguard',    name: 'AdGuard',    desc: t.dnsAdguardDesc,  ip: '94.140.14.14' },
    { id: 'google',     name: 'Google',     desc: t.dnsGoogleDesc,   ip: '8.8.8.8' },
    { id: 'quad9',      name: 'Quad9',      desc: t.dnsQuad9Desc,    ip: '9.9.9.9' },
    { id: 'opendns',    name: 'OpenDNS',    desc: t.dnsOpenDnsDesc,  ip: '208.67.222.222' },
  ], [t]);

  const updateConfig = useCallback((keyOrObj, value) => {
    setLocalConfig((prev) => {
      const next = mergeConfigUpdate(prev, keyOrObj, value);
      if (configWriteTimerRef.current) clearTimeout(configWriteTimerRef.current);
      configWriteTimerRef.current = setTimeout(() => {
        configWriteTimerRef.current = null;
        try {
          localStorage.setItem(LS_KEYS.config, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }, 200);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (configWriteTimerRef.current) clearTimeout(configWriteTimerRef.current);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab]);

  useEffect(() => {
    if (Object.keys(latencies).length > 0) {
      const sorted = [...DNS_PROVIDERS].sort(
        (a, b) => (latencies[a.id] || 999) - (latencies[b.id] || 999),
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
        setLocalConfig((prev) => {
          if (prev.autoStart === active) return prev;
          return { ...prev, autoStart: active };
        });
      } catch (e) {
        console.error('Autostart check failed:', e);
      }
    })();
  }, []);

  const toggleAutostart = useCallback(async (val) => {
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
  }, [onAutostartError, t.autostartEnableFailed, updateConfig]);

  const checkAllLatencies = useCallback(async (forceSelectBest = false) => {
    if (dnsCheckStartedRef.current) return;
    dnsCheckStartedRef.current = true;
    setIsChecking(true);
    const newLatencies = {};

    try {
      const results = await Promise.allSettled(
        DNS_PROVIDERS.map(async (provider) => {
          try {
            const latency = await invoke('check_dns_latency', { dnsIp: provider.ip });
            return { id: provider.id, latency };
          } catch (e) {
            console.error(`Ping failed for ${provider.name}:`, e);
            return { id: provider.id, latency: 999 };
          }
        }),
      );

      results.forEach((r) => {
        if (r.status === 'fulfilled') newLatencies[r.value.id] = r.value.latency;
      });

      setLatencies(newLatencies);
      writeDnsCache(newLatencies);

      const sorted = [...DNS_PROVIDERS].sort(
        (a, b) => (newLatencies[a.id] || 999) - (newLatencies[b.id] || 999),
      );
      setSortedProviders(sorted);

      if (forceSelectBest || localConfig.dnsMode === 'auto') {
        const bestDns = sorted[0];
        if (bestDns) updateConfig('selectedDns', bestDns.id);
      }
    } finally {
      setIsChecking(false);
      dnsCheckStartedRef.current = false;
    }
  }, [DNS_PROVIDERS, localConfig.dnsMode, updateConfig]);

  const handleFixInternet = useCallback(async () => {
    if (fixStatus === 'fixing') return;
    setFixStatus('fixing');
    try {
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
  }, [fixStatus]);

  const handleBack = useCallback(() => {
    if (configWriteTimerRef.current) {
      clearTimeout(configWriteTimerRef.current);
      configWriteTimerRef.current = null;
    }
    try {
      localStorage.setItem(LS_KEYS.config, JSON.stringify(localConfig));
    } catch {
      /* ignore */
    }
    onClose(localConfig);
  }, [localConfig, onClose]);

  return (
    <div className="v2-settings-overlay">
      <div className="v2-settings-header">
        <button type="button" className="v2-back-btn" onClick={handleBack}>
          <ChevronLeft size={28} />
        </button>
        <h1>{t.settingsTitle}</h1>
      </div>

      <div className="v2-settings-content" ref={scrollRef}>
        {activeTab === 'connection' && (
          <SettingsConnectionTab
            config={localConfig}
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
            config={localConfig}
            updateConfig={updateConfig}
            t={t}
            lang={lang}
            autostartEnabled={autostartEnabled}
            toggleAutostart={toggleAutostart}
          />
        )}

        {activeTab === 'advanced' && (
          <SettingsAdvancedTab
            config={localConfig}
            updateConfig={updateConfig}
            t={t}
            fixStatus={fixStatus}
            handleFixInternet={handleFixInternet}
            isConnected={isConnected}
            currentPort={currentPort}
            defenderDecision={defenderDecision}
            requestDefenderExclusion={requestDefenderExclusion}
            isActive
          />
        )}
      </div>

      <nav className="bottom-nav settings-bottom-nav" aria-label={t.tabConnection}>
        <button
          type="button"
          className={`nav-btn nav-btn--icon ${activeTab === 'connection' ? 'active' : ''}`}
          onClick={() => setActiveTab('connection')}
          aria-label={t.tabConnection}
          title={t.tabConnection}
        >
          <Network size={20} strokeWidth={activeTab === 'connection' ? 2.4 : 2} />
        </button>
        <div className="nav-divider" />
        <button
          type="button"
          className={`nav-btn nav-btn--icon ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
          aria-label={t.tabGeneral || t.tabApp}
          title={t.tabGeneral || t.tabApp}
        >
          <SlidersHorizontal size={20} strokeWidth={activeTab === 'general' ? 2.4 : 2} />
        </button>
        <div className="nav-divider" />
        <button
          type="button"
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

export default React.memo(Settings);
