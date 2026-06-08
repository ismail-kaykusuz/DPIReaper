import Settings, { ConnectionProfilePicker } from "./Settings";
import BypassGraph from "./components/BypassGraph";
import DefenderConsentModal from "./overlays/DefenderConsentModal";
import LanguagePicker from "./overlays/LanguagePicker";
import UpdateAvailableModal from "./overlays/UpdateAvailableModal";
import { createBypassStatsTracker } from "./bypassStats";
import { detectProfileTier } from "./profiles";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Command, open as openShell } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { getTranslations, detectSystemLang } from "./i18n";
import { DNS_MAP, DOH_MAP, APP, RETRY_DELAYS, DPI_TIMEOUTS, LS_KEYS, URLS } from "./constants";
import { buildProxyEngineArgs } from "./profiles";
import { checkForAppUpdate } from "./utils/checkUpdate";

// Re-add missing imports
import DOMPurify from "dompurify";
import {
  Power,
  Shield,
  SlidersHorizontal,
  ScrollText,
  FileText,
  X,
  Copy,
  Trash2,
  WifiOff,
  Smartphone,
  AlertTriangle,
  Check,
  Heart,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { QRCodeSVG } from "qrcode.react";

import "./App.css";

// ✅ Constants — imported from constants.js (DNS_MAP, DOH_MAP, APP, RETRY_DELAYS, DPI_TIMEOUTS, LS_KEYS)

const PURIFY_CONFIG = { ALLOWED_TAGS: ['strong', 'em', 'br', 'span', 'b'], ALLOWED_ATTR: ['class'] };

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState([]);
  const [currentPort, setCurrentPort] = useState(8080);
  const currentPortRef = useRef(8080); // ✅ #6: Prevent stale closure
  const [lanIp, setLanIp] = useState("127.0.0.1"); // ✅ LAN IP State
  const [pacPort, setPacPort] = useState(8787); // ✅ PAC port (dynamic)
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('all'); // Phase 4 — log filter
  const [showSettings, setShowSettings] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine); // ✅ Internet status
  const [appIsClosingState, setAppIsClosingState] = useState(false); // Shutdown UX
  const [closingStep, setClosingStep] = useState(0);
  const [closingDots, setClosingDots] = useState("");
  const [ispDetection, setIspDetection] = useState(null);
  // ✅ First-run overlay state — show even when config is missing (A12 double-guard)
  // This state must be declared early because useEffect dependency arrays below read it
  // otherwise TDZ ReferenceError → black screen.
  const [showFirstRunISS, setShowFirstRunISS] = useState(() => {
    return !localStorage.getItem(LS_KEYS.firstRun) && !localStorage.getItem(LS_KEYS.config);
  });
  // Defender consent durumu — 'added' | 'declined' | null (not asked yet)
  const [defenderDecision, setDefenderDecision] = useState(() =>
    localStorage.getItem(LS_KEYS.defenderExclusionDecision)
  );
  const [showDefenderConsent, setShowDefenderConsent] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [bypassStats, setBypassStats] = useState(null);
  // C5: Sidecar health status — { ok: bool, latencyMs: number } | null
  const [healthStatus, setHealthStatus] = useState(null);
  // C6: Onboarding step (0/1/2)
  const [onboardingStep, setOnboardingStep] = useState(0);
  const bypassTrackerRef = useRef(null);
  const bypassPendingRef = useRef(null);
  const bypassFlushTimerRef = useRef(null);
  // PERF: batch log lines via rAF/100ms into a single setState
  const logQueueRef = useRef([]);
  const logFlushRafRef = useRef(0);
  const overlayActiveRef = useRef(false);
  const settingsSnapRef = useRef(null);

  // flush ingest() every 250ms instead of setState per line — lowers re-render cost
  const flushBypassStats = (snap) => {
    if (overlayActiveRef.current) return;
    bypassPendingRef.current = snap;
    if (bypassFlushTimerRef.current) return;
    bypassFlushTimerRef.current = setTimeout(() => {
      bypassFlushTimerRef.current = null;
      if (bypassPendingRef.current) {
        setBypassStats(bypassPendingRef.current);
        bypassPendingRef.current = null;
      }
    }, 250);
  };

  useEffect(() => {
    if (!bypassTrackerRef.current) {
      bypassTrackerRef.current = createBypassStatsTracker();
      setBypassStats(bypassTrackerRef.current.snapshot());
    }
    // B3: ISP detection — 24h cache, otherwise async invoke
    try {
      const cached = localStorage.getItem(LS_KEYS.ispCache);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj?.ts && Date.now() - obj.ts < 24 * 60 * 60 * 1000) {
          setIspDetection(obj.result || null);
        } else {
          throw new Error('expired');
        }
      } else {
        throw new Error('miss');
      }
    } catch (_) {
      invoke("detect_isp")
        .then((result) => {
          setIspDetection(result);
          try {
            localStorage.setItem(LS_KEYS.ispCache, JSON.stringify({ result, ts: Date.now() }));
          } catch (_) {}
        })
        .catch(() => setIspDetection(null));
    }
    return () => {
      if (bypassFlushTimerRef.current) clearTimeout(bypassFlushTimerRef.current);
      if (logFlushRafRef.current) cancelAnimationFrame(logFlushRafRef.current);
    };
  }, []);

  // PERF: Heartbeat — stop when page hidden or settings/logs overlay open
  useEffect(() => {
    if (!isConnected || showSettings || showLogs) return undefined;
    let id = null;
    const start = () => {
      if (id || document.visibilityState === 'hidden') return;
      id = setInterval(() => {
        if (bypassTrackerRef.current) {
          setBypassStats(bypassTrackerRef.current.tick());
        }
      }, 1000);
    };
    const stop = () => {
      if (id) { clearInterval(id); id = null; }
    };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };
    start();
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [isConnected, showSettings, showLogs]);

  // C5: Sidecar health check — stop while settings/logs open
  useEffect(() => {
    if (!isConnected || showSettings || showLogs) {
      return undefined;
    }
    let cancelled = false;
    const runCheck = async () => {
      try {
        const res = await invoke('check_proxy_health', { proxyPort: currentPortRef.current });
        if (!cancelled) {
          // res: { ok: bool, latencyMs: number }
          setHealthStatus(res || { ok: false, latencyMs: 0 });
          if (res && res.ok === false) {
            addLog(t.logHealthFail, 'warn', { i18nKey: 'logHealthFail' });
          }
        }
      } catch (_) { /* swallow silently */ }
    };
    const firstId = setTimeout(runCheck, 5000);
    const intervalId = setInterval(runCheck, 30000);
    return () => {
      cancelled = true;
      clearTimeout(firstId);
      clearInterval(intervalId);
    };
  }, [isConnected, showSettings, showLogs]);

  // C14: Verify sidecar binary exists on mount
  useEffect(() => {
    invoke('check_sidecar_exists').then((exists) => {
      if (!exists) {
        addLog(t.logSidecarMissing, 'error', { i18nKey: 'logSidecarMissing' });
      }
    }).catch(() => {});
  }, []);

  // Item 1: hide window to tray when launched with --autostart.
  // Non-elevated autostart breaks bypass — relaunch as admin.
  useEffect(() => {
    (async () => {
      try {
        const auto = await invoke('is_autostarted');
        if (!auto) return;
        const admin = await invoke('check_admin');
        if (!admin) {
          await invoke('relaunch_as_admin');
          return;
        }
        if (configRef.current?.startHidden === false) return;
        getCurrentWindow().hide().catch(() => {});
      } catch (e) {
        console.warn('Autostart elevation:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autostart: config aciksa registry + task kaydini Rust tarafinda yenile.
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(LS_KEYS.config);
        const saved = raw ? JSON.parse(raw) : {};
        if (saved.autoStart === true) {
          const ok = await invoke('set_autostart_enabled', { enabled: true });
          if (!ok) {
            console.warn('Autostart re-apply returned false');
          }
        }
      } catch (e) {
        console.warn('Autostart sync:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GitHub Releases — check after first-run overlay closes.
  useEffect(() => {
    if (showFirstRunISS) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const info = await checkForAppUpdate(APP.version);
        if (cancelled || !info) return;
        const dismissed = localStorage.getItem(LS_KEYS.dismissedUpdateVersion);
        if (dismissed === info.version) return;
        setUpdateInfo(info);
        setShowUpdateModal(true);
      } catch (e) {
        console.warn('Update check:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [showFirstRunISS]);

  // Defender consent modal: show when onboarding complete and no decision yet
  useEffect(() => {
    if (showFirstRunISS) return;
    if (!isAdmin) return;
    if (defenderDecision === 'added' || defenderDecision === 'declined') return;
    setShowDefenderConsent(true);
  }, [showFirstRunISS, isAdmin, defenderDecision]);

  const handleDefenderConsentAccept = async () => {
    try {
      await invoke('add_defender_exclusions');
      localStorage.setItem(LS_KEYS.defenderExclusionDecision, 'added');
      setDefenderDecision('added');
      setShowDefenderConsent(false);
    } catch (e) {
      // UAC denial or other error — do NOT set flag; modal reappears next launch
      addLog(t.logDefenderExclusionFailed, 'warn', { i18nKey: 'logDefenderExclusionFailed' });
      setShowDefenderConsent(false);
    }
  };

  const handleDefenderConsentDecline = () => {
    localStorage.setItem(LS_KEYS.defenderExclusionDecision, 'declined');
    setDefenderDecision('declined');
    setShowDefenderConsent(false);
  };

  useEffect(() => {
    if (appIsClosingState) {
      const stepTimer = setTimeout(() => {
        setClosingStep(1);
      }, 500);

      const dotTimer = setInterval(() => {
        setClosingDots(prev => prev.length >= 3 ? "" : prev + ".");
      }, 300);

      return () => {
        clearTimeout(stepTimer);
        clearInterval(dotTimer);
      };
    }
  }, [appIsClosingState]);

  // Check Admin on Mount
  useEffect(() => {
    invoke("check_admin")
      .then((result) => {
        setIsAdmin(result);
        if (!result) {
          addLog(t.logAdminMissing, "error", { i18nKey: "logAdminMissing" });
        }
      })
      .catch((err) => {
        console.error("Admin check warning:", err);
        setIsAdmin(true);
      });

      // ✅ Internet Connection Listeners
    const handleOnline = () => {
      setIsOnline(true);
      addLog(t.logInternetBack, "success", { i18nKey: "logInternetBack" });
    };
    const handleOffline = () => {
      setIsOnline(false);
      addLog(t.logInternetLost, "error", { i18nKey: "logInternetLost" });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Settings State
  const [config, setConfig] = useState(() => {
    const defaultSettings = {
      // Item 5: auto-detect system language on first launch (EN fallback)
      language: detectSystemLang(),
      autoStart: false,
      autoConnect: false,
      minimizeToTray: false,
      // On first setup, Auto DNS is recommended — picks the fastest server.
      dnsMode: "auto",
      selectedDns: "cloudflare",
      autoReconnect: true,
      dpiMethod: "1",
      httpsChunkSize: 2,
      ipv4Only: true,
      enableWinhttp: true,
      selectedIspProfile: "mid",
      customBypassDomains: [],
      startHidden: true,
    };

    const saved = localStorage.getItem(LS_KEYS.config);
    if (saved) {
      try {
        let parsedStr = saved;
        if (!saved.startsWith("{")) {
          parsedStr = decodeURIComponent(escape(atob(saved)));
        }
        const parsed = JSON.parse(parsedStr);
        if (typeof parsed !== 'object' || parsed === null) return defaultSettings;

        // Migration: 'system' DNS option removed from UI, migrate to auto select
        let migratedDns = parsed.selectedDns;
        let migratedMode = parsed.dnsMode;
        if (migratedDns === 'system') {
          migratedDns = 'cloudflare';
          migratedMode = 'auto';
        }

        // Migration: 8-byte and larger chunk options removed from design (only 1/2/4).
        let migratedChunk = Number(parsed.httpsChunkSize);
        if ([1, 2, 4].includes(migratedChunk)) {
          // tut
        } else if (migratedChunk > 4) {
          migratedChunk = 4;
        } else {
          migratedChunk = defaultSettings.httpsChunkSize;
        }

        // Migration (A6): drop legacy lowCpuMode / lowGpuMode keys
        // eslint-disable-next-line no-unused-vars
        const {
          lowCpuMode: _legacyLowCpu,
          lowGpuMode: _legacyLowGpu,
          advancedBypass: _legacyAdv,
          ...rest
        } = parsed;

        return {
          ...defaultSettings,
          ...rest,
          dpiMethod: ['0', '1', '2'].includes(String(parsed.dpiMethod)) ? String(parsed.dpiMethod) : defaultSettings.dpiMethod,
          httpsChunkSize: migratedChunk,
          selectedDns: typeof migratedDns === 'string' ? migratedDns : defaultSettings.selectedDns,
          dnsMode: typeof migratedMode === 'string' ? migratedMode : defaultSettings.dnsMode,
          customBypassDomains: Array.isArray(parsed.customBypassDomains)
            ? parsed.customBypassDomains.filter((d) => typeof d === 'string')
            : [],
        };
      } catch (e) {
        console.error("Failed to parse config:", e);
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  // ✅ i18n: Reactive translations (must come after config!)
  const t = useMemo(
    () => getTranslations(config.language || "tr"),
    [config.language],
  );

  const childProcess = useRef(null);
  const isStartingEngine = useRef(false);
  const logsEndRef = useRef(null);
  const isRetrying = useRef(false);

  // ✅ Auto-reconnect mechanism
  const retryCount = useRef(0);
  const retryTimer = useRef(null);
  const userIntentDisconnect = useRef(false);
  const fatalErrorRef = useRef(false);
  // ✅ Has exit started? (prevent double modal)
  const isExiting = useRef(false);
  const trayQuitRef = useRef(false);
  const prevLanSharingRef = useRef(config.lanSharing ?? false);
  const prevDpiMethodRef = useRef(config.dpiMethod);
  const prevChunkSizeRef = useRef(config.httpsChunkSize ?? 4);
  const prevSelectedDnsRef = useRef(config.selectedDns);
  const prevDnsModeRef = useRef(config.dnsMode);
  const prevEnableWinhttpRef = useRef(config.enableWinhttp !== false);
  const prevIpv4OnlyRef = useRef(config.ipv4Only !== false);

  // DNS_MAP and DOH_MAP are now defined outside the component (above)

  // B9: localStorage writes debounced 200ms — batch rapid toggle clicks.
  const configWriteTimerRef = useRef(null);
  const pendingConfigRef = useRef(null);
  const flushConfigToStorage = (cfg) => {
    try {
      localStorage.setItem(LS_KEYS.config, JSON.stringify(cfg));
    } catch (e) {
      console.error("Config write failed:", e);
    }
  };
  const updateConfig = (keyOrObj, value) => {
    setConfig((prev) => {
      let newConfig;
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        newConfig = { ...prev, ...keyOrObj };
      } else {
        newConfig = { ...prev, [keyOrObj]: value };
      }
      pendingConfigRef.current = newConfig;
      if (configWriteTimerRef.current) clearTimeout(configWriteTimerRef.current);
      configWriteTimerRef.current = setTimeout(() => {
        configWriteTimerRef.current = null;
        if (pendingConfigRef.current) {
          flushConfigToStorage(pendingConfigRef.current);
          pendingConfigRef.current = null;
        }
      }, 200);
      return newConfig;
    });
  };
  // Sync-write pending config on app close
  const flushPendingConfig = () => {
    if (configWriteTimerRef.current) {
      clearTimeout(configWriteTimerRef.current);
      configWriteTimerRef.current = null;
    }
    if (pendingConfigRef.current) {
      flushConfigToStorage(pendingConfigRef.current);
      pendingConfigRef.current = null;
    }
  };

  // Custom Confirm State
  const confirmResolver = useRef(null);
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: "",
    desc: "",
  });

  const customConfirm = (desc, options) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title: options?.title || "",
        desc: desc,
      });
      confirmResolver.current = resolve;
    });
  };

  const handleConfirmResult = (result) => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
    if (confirmResolver.current) {
      confirmResolver.current(result);
      confirmResolver.current = null;
    }
  };

  const notifyUser = async (title, body, eventType) => {
    try {
      if (configRef.current.notifications === false) return; // Skip if user disabled notifications
      if (
        eventType === "connect" &&
        configRef.current.notifyOnConnect === false
      )
        return;
      if (
        eventType === "disconnect" &&
        configRef.current.notifyOnDisconnect === false
      )
        return;
      if (
        eventType === "disconnect_manual" &&
        configRef.current.notifyOnDisconnect === false
      )
        return;

      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === "granted";
      }
      if (permissionGranted) {
        sendNotification({ title, body });
      }
    } catch (err) {
      console.error("Notification error:", err);
    }
  };

  const resolveI18nMessage = (key, params = []) => {
    if (!key) return "";
    const value = t[key];
    if (!value) return "";
    if (typeof value === "function") {
      return value(...params);
    }
    return value;
  };

  // PERF: Trigger setState once in requestAnimationFrame, not per line.
  // Under heavy traffic (100+ logs/s): was 100 re-renders → now ~60.
  const flushLogQueue = () => {
    logFlushRafRef.current = 0;
    if (overlayActiveRef.current) return;
    const queued = logQueueRef.current;
    if (queued.length === 0) return;
    logQueueRef.current = [];
    setLogs((prev) => {
      const next = prev.length === 0 ? queued : prev.concat(queued);
      return next.length > APP.maxLogs ? next.slice(-APP.maxLogs) : next;
    });
  };

  const addLog = (msg, type = "info", meta = {}) => {
    const { i18nKey, i18nParams } = meta;

    let finalMsg = msg;
    if (i18nKey) {
      finalMsg = resolveI18nMessage(i18nKey, i18nParams);
    }

    if (!finalMsg || finalMsg.toString().trim().length === 0) return;

    const cleanMsg = finalMsg.toString().replace(/\x1b\[[0-9;]*m/g, "");
    logQueueRef.current.push({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      msg: cleanMsg,
      type,
      i18nKey: i18nKey || null,
      i18nParams: i18nParams || null,
    });
    if (!overlayActiveRef.current && !logFlushRafRef.current) {
      logFlushRafRef.current = requestAnimationFrame(flushLogQueue);
    }
  };

  // B8: Resolve logs at render time instead of remapping entire array on language change.
  const getLogText = (log) => {
    if (!log) return "";
    if (log.i18nKey) {
      const v = t[log.i18nKey];
      if (typeof v === 'function') {
        try { return v(...(log.i18nParams || [])); }
        catch (e) { return log.msg || ""; }
      }
      if (typeof v === 'string') return v;
    }
    return log.msg || "";
  };

  const [copyStatus, setCopyStatus] = useState("idle"); // idle, success, error

  const copyLogs = async () => {
    if (logs.length === 0) return;

    const logText = logs.map((l) => `[${l.time}] ${getLogText(l)}`).join("\n");

    try {
      await writeText(logText);
      setCopyStatus("success");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch (e) {
      console.error("Tauri clipboard failed, trying navigator:", e);
      try {
        await navigator.clipboard.writeText(logText);
        setCopyStatus("success");
        setTimeout(() => setCopyStatus("idle"), 1500);
      } catch (navError) {
        console.error("Navigator clipboard also failed:", navError);
        setCopyStatus("error");
        setTimeout(() => setCopyStatus("idle"), 1500);
      }
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearProxy = async (silent = false) => {
    try {
      await invoke("clear_system_proxy");
      if (!silent) {
        addLog(t.logProxyCleared, "success", { i18nKey: "logProxyCleared" });
      }
    } catch (e) {
      addLog(t.logProxyClearError(e), "warn", {
        i18nKey: "logProxyClearError",
        i18nParams: [e],
      });
      console.error(e);
    }
  };

  // ✅ Exponential backoff — wait 2.5s on first retry too (TIME_WAIT)
  const getRetryDelay = (attempt) => {
    return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  };

  // ✅ Update tray tooltip — configRef + currentPortRef prevent stale closure
  const updateTrayTooltip = async (status) => {
    try {
      let tooltip = "";
      switch (status) {
        case "connected": {
          const dnsName = (configRef.current.selectedDns || "auto").toUpperCase();
          tooltip = `🟢 DPIReaper - ${t.statusConnected}\n127.0.0.1:${currentPortRef.current}\nDNS: ${dnsName}`;
          break;
        }
        case "disconnected":
          tooltip = `🔴 DPIReaper - ${t.statusInactive}`;
          break;
        case "retrying":
          tooltip = `🔄 DPIReaper - ${t.btnConnecting}\n${retryCount.current}/5...`;
          break;
        case "connecting":
          tooltip = `⏳ DPIReaper - ${t.btnConnecting}`;
          break;
        default:
          tooltip = "🛡️ DPIReaper";
      }
      await invoke("update_tray_tooltip", { tooltip });
    } catch (e) {
      console.error("Tray tooltip update failed:", e);
    }
  };

  // ✅ Automatic reconnect
  const attemptReconnect = () => {
    // Clear timer if set
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    const currentAttempt = retryCount.current;
    const maxAttempts = APP.maxReconnectAttempts;

    if (currentAttempt >= maxAttempts) {
      // Max attempts exceeded
      addLog(t.logMaxRetries, "error", { i18nKey: "logMaxRetries" });
      addLog("", "info");
      addLog(t.logPossibleReasons, "warn", {
        i18nKey: "logPossibleReasons",
      });
      addLog(`  • ${t.logReasonInternet}`, "info", {
        i18nKey: "logReasonInternet",
      });
      addLog(`  • ${t.logReasonFirewall}`, "info", {
        i18nKey: "logReasonFirewall",
      });
      addLog(`  • ${t.logReasonPorts}`, "info", { i18nKey: "logReasonPorts" });
      addLog("", "info");
      addLog(t.logSolutions, "warn", { i18nKey: "logSolutions" });
      addLog(`  • ${t.logSolInternet}`, "info", { i18nKey: "logSolInternet" });
      addLog(`  • ${t.logSolFirewall}`, "info", { i18nKey: "logSolFirewall" });
      addLog(`  • ${t.logSolAdmin}`, "info", { i18nKey: "logSolAdmin" });
      addLog(`  • ${t.logSolLogs}`, "info", { i18nKey: "logSolLogs" });

      retryCount.current = 0;
      setIsProcessing(false);
      return;
    }

    const delay = getRetryDelay(currentAttempt);
    retryCount.current++;

    if (delay === 0) {
      addLog(t.logReconnecting(currentAttempt + 1), "warn", {
        i18nKey: "logReconnecting",
        i18nParams: [currentAttempt + 1],
      });
      startEngine(8080);
    } else {
      addLog(
        `⏳ ${t.logReconnectWait(delay / 1000, currentAttempt + 1)}`,
        "warn",
        {
          i18nKey: "logReconnectWait",
          i18nParams: [delay / 1000, currentAttempt + 1],
        },
      );
      updateTrayTooltip("retrying");
      retryTimer.current = setTimeout(() => {
        addLog(t.logReconnectNow, "info", {
          i18nKey: "logReconnectNow",
        });
        startEngine(8080);
      }, delay);
    }
  };

  // Is port open? Rust tries TCP connection
  const waitForPort = async (port, maxAttempts = APP.portCheckMaxAttempts) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const open = await invoke("check_port_open", { port });
        if (open) return true;
      } catch (e) {
        console.warn("Port check error:", e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };

  const startEngine = async (ignoredPort, portRetryCount = 0) => {
    // Clear stuck lock / dead sidecar reference
    if (isStartingEngine.current && !childProcess.current) {
      isStartingEngine.current = false;
    }

    if (isStartingEngine.current || childProcess.current) return;
    isStartingEngine.current = true;

    updateTrayTooltip("connecting");

    // ✅ #2: Reset fatalErrorRef — previous wpcap error must not block new connection
    fatalErrorRef.current = false;

    // Max 20 retries
    if (portRetryCount >= APP.maxPortRetries) {
      addLog(t.logNoPort, "error", { i18nKey: "logNoPort" });
      setIsProcessing(false);
      isStartingEngine.current = false;
      return;
    }

    // ✅ Rust'tan Smart Configuration al (Port & IP)
    let configData;
    let port;
    let bindAddr;

    try {
      configData = await invoke("get_sidecar_config", {
        allowLanSharing: configRef.current.lanSharing || false,
        enableGameMode: configRef.current.enableWinhttp !== false,
      });
      port = configData.port;
      bindAddr = configData.bind_address;
      setLanIp(configData.lan_ip); // IP'yi state'e kaydet
    } catch (e) {
      addLog(t.logConfigError(e), "error", {
        i18nKey: "logConfigError",
        i18nParams: [e],
      });
      setIsProcessing(false);
      isStartingEngine.current = false;
      return;
    }

    if (childProcess.current) {
        try {
          await childProcess.current.kill();
        } catch (_) {}
        childProcess.current = null;
    }
    await clearProxy(true);

    // ✅ #3: Use configRef.current — prevents stale closure
    const currentDns = configRef.current.selectedDns;
    const dnsIP = DNS_MAP[currentDns];

    addLog(t.logEngineStarting(port), "info", {
      i18nKey: "logEngineStarting",
      i18nParams: [port],
    });

    // DNS bilgisi
    if (dnsIP) {
      addLog(t.logDnsUsed(currentDns.toUpperCase(), dnsIP), "info", {
        i18nKey: "logDnsUsed",
        i18nParams: [currentDns.toUpperCase(), dnsIP],
      });
    } else {
      addLog(t.logDnsDefault, "info", { i18nKey: "logDnsDefault" });
    }

    isRetrying.current = false;

    try {
      // ✅ New 3-mode timeout system: 0=Turbo, 1=Balanced, 2=Strong
      const TIMEOUT_MS = DPI_TIMEOUTS[configRef.current.dpiMethod] ?? 5000;

      const listenAddr = `${bindAddr}:${port}`;
      const dohUrl = DOH_MAP[currentDns];

      const { args, logs: engineLogs } = buildProxyEngineArgs({
        config: configRef.current,
        listenAddr,
        timeoutMs: TIMEOUT_MS,
        currentDns,
        dnsIP,
        dohUrl,
      });

      for (const entry of engineLogs) {
        const msg = resolveI18nMessage(entry.key, entry.params || []);
        addLog(msg, entry.type || "info", {
          i18nKey: entry.key,
          i18nParams: entry.params,
        });
      }

      const command = Command.sidecar("binaries/dpireaper-proxy", args);

      let connectionConfirmed = false;
      let isReady = false;

      // Optimized regex pattern - compiled once (string + new RegExp so regex literal / does not conflict)
      const SKIP_PATTERN = new RegExp(
        "\\[(?:PROXY|DNS|HTTPS|CACHE|app)]|method:\\s*CONNECT|cache (?:miss|hit)|resolving|routing|resolution took|new conn|client sent hello|shouldExploit|useSystemDns|fragmentation|conn established|writing chunked|caching \\d+ records|[a-f0-9]{8}-[a-f0-9]{8}|d88|Y88|88P|level=|ctrl \\+ c|listen_addr|dns_addr|github\\.com|spoofdpi|connection timeout|\\[::1\\]|ipv6|AAAA|no suitable address|network is unreachable|connectex.*\\[|telemetry\\.net|dns lookup failed",
        "i",
      );
      // While disconnecting/reconnecting SpoofDPI closes all tunnels; each logs WRN — do not forward to user log
      const isTunnelShutdownNoise = (l) =>
        /\[pxy\].*error handling request|unsuccessful tunnel|wsarecv|aborted by the software in your host machine|failed to read http request|malformed HTTP request|invalid method/i.test(
          l,
        );

      const handleOutput = async (line, type) => {
        if (!line || line.length === 0) return;
        // PERF: trim and toLowerCase only when needed
        // First quick check: prefix-based level filter
        const c0 = line.charCodeAt(0);
        const isLevelPrefix =
          (c0 === 68 || c0 === 100 || c0 === 73 || c0 === 105 || c0 === 87 || c0 === 119 || c0 === 69 || c0 === 101) &&
          /^(DBG|INF|WRN|ERR|DEBUG|INFO|WARN|ERROR)\b/i.test(line);

        // Bypass counter engine — runs every line but cheap includes filter before regex
        const statsSnap = bypassTrackerRef.current?.ingest(line);
        if (statsSnap) flushBypassStats(statsSnap);

        // Level-prefixed lines are not shown in user-facing log (info/debug/warn/error)
        if (isLevelPrefix) return;

        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) return;
        const lowerLine = line.toLowerCase();

        if (line.indexOf("888") !== -1) return;
        if (isTunnelShutdownNoise(line)) return;

        if (SKIP_PATTERN.test(line)) return;

        // Optimized alpha check
        const alphaCount = line.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g, "").length;
        if (alphaCount < 5 && trimmedLine.length > 3) return;

        let friendlyKey = null;
        let friendlyParams = [];

        // Port error (trigger only on real "in use" errors)
        const isPortInUse =
          (lowerLine.includes("bind") || lowerLine.includes("yuva adresi")) &&
          (lowerLine.includes("already in use") ||
            lowerLine.includes("only one usage"));

        if (
          lowerLine.includes("listening on") ||
          lowerLine.includes("created a listener")
        ) {
          isReady = true;
          friendlyKey = "logSpoofReady";
          friendlyParams = [port];
        } else if (lowerLine.includes("server started")) {
          isReady = true;
          friendlyKey = "logEngineActive";
        } else if (isPortInUse) {
          friendlyKey = "logPortBusy";
          friendlyParams = [port];
        } else if (lowerLine.includes("initializing")) {
          friendlyKey = "logInitializing";
        }

        if (friendlyKey) {
          const msg = resolveI18nMessage(friendlyKey, friendlyParams);
          let logType = "info";
          if (friendlyKey === "logPortBusy") {
            logType = "warn";
          } else if (friendlyKey === "logSpoofReady" || friendlyKey === "logEngineActive") {
            logType = "success";
          } else if (friendlyKey === "logInitializing") {
            logType = "info";
          }
          addLog(msg, logType, {
            i18nKey: friendlyKey,
            i18nParams: friendlyParams,
          });
        } else {
          // If no friendly mapping, show raw SpoofDPI output so error details are not lost
          addLog(trimmedLine, type === "warn" ? "warn" : "info");
        }

        // Wait for port to be actually ready (brief wait after listener log; SpoofDPI 1.2.1 sometimes binds late)
        if (!connectionConfirmed && isReady) {
          connectionConfirmed = true;
          await new Promise((r) => setTimeout(r, 400));
          const portReady = await waitForPort(port);
          if (!portReady) {
            addLog(t.logPortRetryOpen(port), "warn", {
              i18nKey: "logPortRetryOpen",
              i18nParams: [port],
            });
            // Try next port: kill process, Rust assigns new port, restart
            if (portRetryCount < 19) {
              isRetrying.current = true;
              if (childProcess.current) {
                childProcess.current.kill().catch(() => {});
                childProcess.current = null;
              }
              setTimeout(() => {
                isRetrying.current = false;
                startEngine(0, portRetryCount + 1);
              }, 2000);
            }
            return;
          }

          setCurrentPort(port);
          currentPortRef.current = port;
          try {
            await invoke("set_system_proxy", { port, enableWinhttp: configRef.current.enableWinhttp !== false });
            addLog(t.logProxySet(port), "success", {
              i18nKey: "logProxySet",
              i18nParams: [port],
            });
            if (configRef.current.enableWinhttp !== false) {
              addLog(t.logWinHttpEnabled, "warn", { i18nKey: "logWinHttpEnabled" });
            }
          } catch (err) {
            addLog(t.logProxySetError(err), "error", {
              i18nKey: "logProxySetError",
              i18nParams: [err],
            });
            return;
          }

          // ✅ Successful connection — reset retry mechanism
          retryCount.current = 0;
          userIntentDisconnect.current = false;

          setIsConnected(true);
          setIsProcessing(false);
          bypassTrackerRef.current?.reset();
          setBypassStats(bypassTrackerRef.current?.snapshot() ?? null);
          addLog(t.logConnected, "success", { i18nKey: "logConnected" });
          notifyUser(APP.name, t.logConnected, "connect");
          updateTrayTooltip("connected");
          if (configRef.current.lanSharing) {
            (async () => {
              try {
                const pacResult = await invoke("start_pac_server", { proxyPort: port });
                if (pacResult?.pac_port) setPacPort(pacResult.pac_port);
                addLog(t.logPacStarted, "success", {
                  i18nKey: "logPacStarted",
                });
              } catch (e) {
                addLog(t.logPacStartError(e), "warn", {
                  i18nKey: "logPacStartError",
                  i18nParams: [e],
                });
              }
            })();
          }
        }

        const isPortError = isPortInUse;

        if (
          !fatalErrorRef.current &&
          isPortError &&
          (lowerLine.includes("error") ||
            lowerLine.includes("fail") ||
            lowerLine.includes("ftl")) &&
          !isRetrying.current
        ) {
          isRetrying.current = true;

          if (childProcess.current) {
            childProcess.current.kill().catch(() => {});
            childProcess.current = null;
          }

          setTimeout(() => {
            // Smart Retry: trust Rust to find a new port instead of incrementing
            // Still increment count for recursion
            startEngine(0, portRetryCount + 1);
          }, 1000);
        }
      };

      command.on("close", (data) => {
        if (!isRetrying.current) {
          const isUnexpectedClose = data.code !== 0 && data.code !== null;

          // ✅ Check user intent FIRST
          if (userIntentDisconnect.current) {
            // User intentionally closed — show normal message
            addLog(t.logEngineStoppedGrace, "info", {
              i18nKey: "logEngineStoppedGrace",
            });
            setIsConnected(false);
            setIsProcessing(false);
            childProcess.current = null;
            (async () => {
              try {
                await invoke("stop_pac_server");
                await clearProxy(true);
              } catch (err) {
                console.error(err);
              }
            })();

            // Reset flags
            retryCount.current = 0;
            userIntentDisconnect.current = false;
            return; // Exit early, do not retry
          }

          // User did not intentionally close — unexpected shutdown
          if (isUnexpectedClose) {
            const exitCode = data.code ?? "Unknown (Force Closed)";
            const warnMsg = t.logEngineStopped(exitCode);
            addLog(warnMsg, "warn", {
              i18nKey: "logEngineStopped",
              i18nParams: [exitCode],
            });
          } else {
            addLog(t.logEngineStoppedGrace, "info", {
              i18nKey: "logEngineStoppedGrace",
            });
          }

          // ✅ Backup before setting childProcess null
          const hadActiveProcess = childProcess.current !== null;

          setIsConnected(false);
          setIsProcessing(false);
          bypassTrackerRef.current?.reset();
          setBypassStats(bypassTrackerRef.current?.snapshot() ?? null);
          childProcess.current = null;
          (async () => {
            try {
              await invoke("stop_pac_server");
              await clearProxy(true);
            } catch (err) {
              console.error(err);
            }
          })();
          updateTrayTooltip("disconnected"); // ✅ Connection lost (temporary)

          // ✅ Automatic reconnect kontrol
          const autoReconnectEnabled =
            configRef.current.autoReconnect !== false; // enabled when undefined or true

          const shouldReconnect =
            autoReconnectEnabled && // Enabled in settings?
            !userIntentDisconnect.current && // User did not intentionally disconnect?
            !fatalErrorRef.current && // No fatal error?
            hadActiveProcess; // Was process running?

          if (shouldReconnect) {
            addLog(t.logAutoReconnect, "info", {
              i18nKey: "logAutoReconnect",
            });
            notifyUser("DPIReaper", t.logAutoReconnect, "disconnect");
            setIsProcessing(true);
            attemptReconnect();
          }
        }
      });

      command.stderr.on("data", (line) => handleOutput(line, "warn"));
      command.stdout.on("data", (line) => handleOutput(line, "info"));

      const child = await command.spawn();
      childProcess.current = child;
      invoke("save_sidecar_pid", { pid: child.pid }).catch(console.warn);
      isStartingEngine.current = false; // Hand ownership to childProcess

      // Failsafe timeout
      setTimeout(async () => {
        if (
          childProcess.current &&
          !connectionConfirmed &&
          !isRetrying.current
        ) {
          // P1-FIX: Before writing proxy to Windows, verify app listens on port via TCP
          const portReady = await waitForPort(port, 3);
          if (!portReady) {
            addLog(t.logFailsafePortClosed || "Unexpected error: Proxy failed to start", "error");
            if (childProcess.current) {
              childProcess.current.kill().catch(() => {});
              childProcess.current = null;
            }
            setIsProcessing(false);
            return;
          }

          connectionConfirmed = true;
          setCurrentPort(port);
          currentPortRef.current = port;

          try {
            await invoke("set_system_proxy", { port: port, enableWinhttp: configRef.current.enableWinhttp !== false });
          } catch (err) {
            addLog(t.logProxySetError(err), "error", {
              i18nKey: "logProxySetError",
              i18nParams: [err],
            });
          }

          // ✅ Successful connection — reset retry mechanism
          retryCount.current = 0;
          userIntentDisconnect.current = false;

          setIsConnected(true);
          setIsProcessing(false);
          addLog(t.logConnected, "info", { i18nKey: "logConnected" });
          notifyUser("DPIReaper", t.logConnected, "connect");
          updateTrayTooltip("connected"); // ✅ Auto-connect succeeded
          if (configRef.current.lanSharing) {
            try {
              const pacResult = await invoke("start_pac_server", { proxyPort: port });
              if (pacResult?.pac_port) setPacPort(pacResult.pac_port);
              addLog(t.logPacStarted, "success", { i18nKey: "logPacStarted" });
            } catch (e) {
              addLog(t.logPacStartError(e), "warn", {
                i18nKey: "logPacStartError",
                i18nParams: [e],
              });
            }
          }
        }
      }, DPI_TIMEOUTS[configRef.current.dpiMethod] ?? 5000); // Mod'a uygun failsafe timeout
    } catch (e) {
      isStartingEngine.current = false; // Lock release on start failure
      addLog(t.logEngineStartError(e), "error", {
        i18nKey: "logEngineStartError",
        i18nParams: [e],
      });

      // B5: Categorize spawn error — show correct action message to user
      const errStr = String(e).toLowerCase();
      let categoryKey = null;
      if (errStr.includes("address already in use") || errStr.includes("only one usage") || errStr.includes("port")) {
        categoryKey = "logSidecarPortBusy";
      } else if (errStr.includes("not found") || errStr.includes("no such file") || errStr.includes("cannot find")) {
        categoryKey = "logSidecarMissing";
      } else if (errStr.includes("denied") || errStr.includes("access") || errStr.includes("permission") || errStr.includes("blocked")) {
        categoryKey = "logSidecarBlocked";
      } else if (errStr.includes("os error")) {
        categoryKey = "logAntivirusWarning";
      }
      if (categoryKey) {
        addLog(t[categoryKey] || "", "warn", { i18nKey: categoryKey });
      }
      setIsConnected(false);
      setIsProcessing(false);
      try {
        await clearProxy();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const toggleConnection = async () => {
    // ✅ FIX: Block toggle during isProcessing OR restart (race condition fix)
    if (isProcessing || isRestartingDpi.current || isRestartingLan.current) return;

    if (isConnected) {
      if (configRef.current.requireConfirmation !== false) {
        const confirmed = await customConfirm(
          t.confirmDisconnectDesc ||
            "Are you sure you want to end your secure connection?",
          { title: t.confirmDisconnectTitle || "Disconnect" },
        );
        if (!confirmed) return;
      }

      // ✅ User is intentionally disconnecting
      userIntentDisconnect.current = true;

      // Cancel retry timer if set
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }

      setIsProcessing(true);
      if (childProcess.current) {
        try {
          addLog(t.logDisconnected, "warn", { i18nKey: "logDisconnected" });
          try {
            await invoke("stop_pac_server");
          } catch (_) {}
          await childProcess.current.kill();
        } catch (e) {
          addLog(t.logServiceStopError(e), "error", {
            i18nKey: "logServiceStopError",
            i18nParams: [e],
          });
        }
        childProcess.current = null;
      }
      setIsConnected(false);
      await clearProxy();
      addLog(t.logServiceStopped, "success", { i18nKey: "logServiceStopped" });

      // Do not send notification during shutdown.
      if (!isAppClosingRef.current) {
        notifyUser("DPIReaper", t.notifDisconnectManual, "disconnect_manual"); // Custom notification event type
      }

      setIsProcessing(false);
      updateTrayTooltip("disconnected"); // ✅ Manual stop
    } else {
      retryCount.current = 0;
      userIntentDisconnect.current = false;

      if (!isAdmin) {
        try {
          await invoke('relaunch_as_admin');
        } catch (e) {
          addLog(t.logSolAdmin, 'error', { i18nKey: 'logSolAdmin' });
          console.error('Elevation failed:', e);
        }
        return;
      }

      setIsProcessing(true);
      startEngine(8080);
    }
  };

  useEffect(() => {
    // PERF: Scroll only when log panel open — DOM access wasteful when closed
    if (!showLogs) return;
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, showLogs]);

  // ✅ #4: useRef prevents stale closure (was useState)
  const isAppClosingRef = useRef(false);

  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // ✅ Apply always-on-top setting to window when it changes
  useEffect(() => {
    (async () => {
      try {
        const win = getCurrentWindow();
        await win.setAlwaysOnTop(config.alwaysOnTop || false);
      } catch (e) {
        console.error("setAlwaysOnTop failed:", e);
      }
    })();
  }, [config.alwaysOnTop]);

  // ✅ Restart active connection when LAN sharing changes
  const isRestartingLan = useRef(false);
  useEffect(() => {
    if (prevLanSharingRef.current === config.lanSharing) return;
    prevLanSharingRef.current = config.lanSharing;

    if (!isConnected || isRestartingLan.current) return;
    isRestartingLan.current = true;

    addLog(t.logLanRestart, "warn", { i18nKey: "logLanRestart" });

    // Give user a "reconnecting" feel during the process
    setIsProcessing(true);
    updateTrayTooltip("connecting");

    // Manual restart: do not mix with auto-reconnect
    userIntentDisconnect.current = true;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (childProcess.current) {
      childProcess.current.kill().catch(() => {});
      childProcess.current = null;
    }
    (async () => {
      try {
        await invoke("stop_pac_server");
      } catch (_) {}
    })();
    setIsConnected(false);

    setTimeout(() => {
      userIntentDisconnect.current = false;
      isRestartingLan.current = false;
      setIsProcessing(true);
      startEngine(0);
    }, 2500); // Allow port to free (SpoofDPI 1.2.1 / TIME_WAIT)
  }, [config.lanSharing, isConnected]);

  // ✅ P1-FIX: Auto-restart connection when DPI mode, chunk size OR DNS changes (prevent stale DNS)
  const isRestartingDpi = useRef(false);
  const [isApplyingSettings, setIsApplyingSettings] = useState(false);
  useEffect(() => {
    const chunkSize = config.httpsChunkSize ?? 4;
    const winhttp = config.enableWinhttp !== false;
    const ipv4 = config.ipv4Only !== false;
    if (
      prevDpiMethodRef.current === config.dpiMethod &&
      prevChunkSizeRef.current === chunkSize &&
      prevSelectedDnsRef.current === config.selectedDns &&
      prevDnsModeRef.current === config.dnsMode &&
      prevEnableWinhttpRef.current === winhttp &&
      prevIpv4OnlyRef.current === ipv4
    )
      return;
    prevDpiMethodRef.current = config.dpiMethod;
    prevChunkSizeRef.current = chunkSize;
    prevSelectedDnsRef.current = config.selectedDns;
    prevDnsModeRef.current = config.dnsMode;
    prevEnableWinhttpRef.current = winhttp;
    prevIpv4OnlyRef.current = ipv4;

    if (!isConnected || isRestartingDpi.current) return;
    isRestartingDpi.current = true;
    setIsApplyingSettings(true);

    addLog(t.logDpiRestart, "warn", { i18nKey: "logDpiRestart" });

    setIsProcessing(true);
    updateTrayTooltip("connecting");

    userIntentDisconnect.current = true;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (childProcess.current) {
      childProcess.current.kill().catch(() => {});
      childProcess.current = null;
    }
    setIsConnected(false);

    setTimeout(() => {
      userIntentDisconnect.current = false;
      isRestartingDpi.current = false;
      setIsApplyingSettings(false);
      setIsProcessing(true);
      startEngine(0);
    }, 2500); // Allow port to free (SpoofDPI 1.2.1 / TIME_WAIT)
  }, [config.dpiMethod, config.httpsChunkSize, config.selectedDns, config.dnsMode, config.enableWinhttp, config.ipv4Only, isConnected]);

  useEffect(() => {
    // Initial cleanup on mount
    (async () => {
      try {
        // P0-FIX-1: Detect and clean leftover proxy settings after crash/BSOD via sentinel
        const wasDirty = await invoke("startup_proxy_cleanup").catch((e) => {
          console.warn("Startup proxy cleanup:", e);
          return false;
        });
        if (wasDirty) {
          addLog(t.logDirtyShutdownRecovery, "warn", {
            i18nKey: "logDirtyShutdownRecovery",
          });
        }

        // ✅ Issue 4: clean zombie processes (may remain after crash/force kill)
        await invoke("kill_zombie_sidecar").catch((e) =>
          console.log("Zombie cleanup:", e)
        );
        // ✅ Issue 1: clear proxy (leftover after crash)
        await clearProxy(true);
        updateTrayTooltip("disconnected");

        // Defender consent (silent auto-add removed) — after onboarding
        // prompt dialog opens via separate useEffect.

        // P1-FIX: Auto-Connect race condition fix (connect AFTER cleanup steps complete)
        // ✅ Skip auto-connect if first-run overlay open — let user pick ISP first
        const isFirstRun = !localStorage.getItem(LS_KEYS.firstRun);
        const adminOk = await invoke('check_admin').catch(() => false);
        if (configRef.current.autoConnect && adminOk && !childProcess.current && !isFirstRun) {
          setIsProcessing(true);
          startEngine(8080);
        }
      } catch (e) {
        console.error("Initial cleanup failed:", e);
      }
    })();

    // Listen for window close event
    const initListener = async () => {
      const win = getCurrentWindow();
      const unlisten = await win.onCloseRequested(async (event) => {
        event.preventDefault();

        // ✅ If handleExit already exiting — close immediately, no modal again
        if (isExiting.current) {
          await getCurrentWindow().destroy();
          return;
        }

        isAppClosingRef.current = true;

        if (configRef.current.minimizeToTray && !trayQuitRef.current) {
          isAppClosingRef.current = false;
          try {
            await win.hide();
          } catch (e) {
            console.error("Failed to hide window:", e);
          }
          return;
        }

        if (configRef.current.requireConfirmation !== false) {
          getCurrentWindow().show();
          getCurrentWindow().setFocus();
          const confirmed = await customConfirm(
            t.confirmExitDesc ||
              t.confirmExitDesc,
            { title: t.confirmExitTitle || "Exit" },
          );
          if (!confirmed) {
            isAppClosingRef.current = false;
            if (trayQuitRef.current) {
              trayQuitRef.current = false;
            }
            return;
          }
        }

        isExiting.current = true;
        userIntentDisconnect.current = true;
        setAppIsClosingState(true);
        flushPendingConfig();

        // ✅ Clear timer
        if (retryTimer.current) {
          clearTimeout(retryTimer.current);
          retryTimer.current = null;
        }

        // ✅ Guard cleanup with 3s timeout
        // Windows shows "did not shut down properly" if exit takes too long
        const cleanupPromise = (async () => {
          try {
            if (childProcess.current) {
              await childProcess.current.kill().catch(() => {});
              childProcess.current = null;
            }
            await clearProxy(true);
            
            // ✅ Wait for animation and PAC grace period
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (e) {
            console.error("Cleanup failed:", e);
          }
        })();

        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 4000));
        await Promise.race([cleanupPromise, timeoutPromise]);

        try {
          await invoke("quit_app");
        } catch (e) {
          console.error("Quit app failed:", e);
          await getCurrentWindow().destroy();
        }
      });
      const unlistenTrayQuit = await win.listen("tray_quit", () => {
        trayQuitRef.current = true;
      });
      return { unlisten, unlistenTrayQuit };
    };

    let unlistenFn;
    initListener().then((fn) => (unlistenFn = fn));

    return () => {
      if (unlistenFn) {
        if (unlistenFn.unlisten) unlistenFn.unlisten();
        if (unlistenFn.unlistenTrayQuit) unlistenFn.unlistenTrayQuit();
      }

      // ✅ Clear retry timer
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }

      // Cleanup on unmount
      const cleanup = async () => {
        isAppClosingRef.current = true;
        userIntentDisconnect.current = true; // prevent false notifications on reload/close
        try {
          await invoke("stop_pac_server");
        } catch (_) {}
        if (childProcess.current) {
          try {
            await childProcess.current.kill();
            childProcess.current = null;
          } catch (e) {
            console.error("Process kill failed:", e);
          }
        }
        try {
          await invoke("clear_system_proxy");
        } catch (e) {
          console.error("Proxy cleanup failed:", e);
        }
      };

      cleanup();
    };
  }, []);

  const handleExit = async () => {
    // ✅ Do not trigger again if already exiting
    if (isExiting.current) return;

    if (configRef.current.requireConfirmation !== false) {
      const confirmed = await customConfirm(
        t.confirmExitDesc ||
          t.confirmExitDesc,
        { title: t.confirmExitTitle || "Exit" },
      );
      if (!confirmed) return;
    }

    // ✅ Set flag — prevents onCloseRequested from showing modal again
    isExiting.current = true;
    isAppClosingRef.current = true;
    userIntentDisconnect.current = true; // Block reconnect
    setAppIsClosingState(true);
    flushPendingConfig();
    addLog(t.logShutdownStarting, "warn", { i18nKey: "logShutdownStarting" });

    // ✅ Clear timer
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    // ✅ Guard cleanup with 3s timeout — prevents Windows improper shutdown warning
    const cleanupPromise = (async () => {
      try {
        if (childProcess.current) {
          await childProcess.current.kill().catch(() => {});
          childProcess.current = null;
          addLog(t.logProcessStopped, "success", {
            i18nKey: "logProcessStopped",
          });
        }
        try {
          await invoke("stop_pac_server");
        } catch (_) {}
        await clearProxy(true);
        
        // ✅ Wait for animation and PAC grace period
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.error("Cleanup failed:", e);
      }
    })();

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 4000));
    await Promise.race([cleanupPromise, timeoutPromise]);

    try {
      await invoke("quit_app");
    } catch (e) {
      console.error("Quit app failed:", e);
      await getCurrentWindow().destroy();
    }
  };

  // Auto-connect on mount moved to main cleanup routine in P1-FIX (prevent race condition)
  // P1-FIX: When manual Fix Internet triggered from settings, synchronously stop sidecar and reset state
  useEffect(() => {
    const handleForceDisconnect = async (e) => {
      console.log('[FORCE-DISCONNECT]', e.detail?.reason);
      
      // Disconnect if connected
      if (childProcess.current) {
        userIntentDisconnect.current = true;
        try {
          await invoke('stop_pac_server');
          await childProcess.current.kill();
        } catch (_) {}
        childProcess.current = null;
      }
      
      setIsConnected(false);
      setIsProcessing(false);
      updateTrayTooltip('disconnected');
    };
    
    window.addEventListener('dpireaper-force-disconnect', handleForceDisconnect);
    return () => window.removeEventListener('dpireaper-force-disconnect', handleForceDisconnect);
  }, []);

  // B6: ESC closes modals
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showConnectionModal) { setShowConnectionModal(false); return; }
      if (confirmState.isOpen) { handleConfirmResult(false); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showConnectionModal, confirmState.isOpen]);

  // Native App Experience: Disable browser-like behaviors
  useEffect(() => {
    // Disable right-click
    const handleContextMenu = (e) => e.preventDefault();

    // Disable refresh and dev shortcuts
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Block F5, F11 (Fullscreen), F12
      if (["F5", "F11", "F12"].includes(e.key)) {
        e.preventDefault();
      }

      // Block Ctrl+R, Ctrl+Shift+R, Ctrl+Shift+I, Ctrl+P, Ctrl+S, Ctrl+U (View Source)
      if (
        isCmdOrCtrl &&
        ["r", "R", "i", "I", "p", "P", "s", "S", "u", "U"].includes(e.key)
      ) {
        e.preventDefault();
      }
    };

    // Prevent accidental text selection (optional but recommended for buttons/UI)
    // and prevent dragging of images/links
    const handleDragStart = (e) => e.preventDefault();

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);

    // CSS level text selection prevention (best for all browsers)
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, []);

  const overlayActive = showSettings || showLogs;

  useEffect(() => {
    const wasOverlay = overlayActiveRef.current;
    overlayActiveRef.current = overlayActive;
    if (wasOverlay && !overlayActive) {
      if (logQueueRef.current.length > 0 && !logFlushRafRef.current) {
        logFlushRafRef.current = requestAnimationFrame(flushLogQueue);
      }
      if (bypassPendingRef.current) {
        setBypassStats(bypassPendingRef.current);
        bypassPendingRef.current = null;
      }
    }
  }, [overlayActive]);

  const stableRequestDefenderExclusion = useCallback(async () => {
    try {
      await invoke('add_defender_exclusions');
      localStorage.setItem(LS_KEYS.defenderExclusionDecision, 'added');
      setDefenderDecision('added');
      return true;
    } catch (e) {
      addLog(t.logDefenderExclusionFailed, 'warn', { i18nKey: 'logDefenderExclusionFailed' });
      return false;
    }
  }, [t.logDefenderExclusionFailed]);

  const handleAutostartError = useCallback(() => {
    addLog(t.autostartEnableFailed, 'warn', { i18nKey: 'autostartEnableFailed' });
  }, [t.autostartEnableFailed]);

  const openSettings = useCallback(() => {
    settingsSnapRef.current = configRef.current;
    setShowSettings(true);
  }, []);

  const handleSettingsClose = useCallback((savedConfig) => {
    setConfig(savedConfig);
    try {
      localStorage.setItem(LS_KEYS.config, JSON.stringify(savedConfig));
    } catch (e) {
      console.error('Config write failed:', e);
    }
    setShowSettings(false);
  }, []);

  // PERF: Settings only: mount Settings tree — not app-container/Framer Motion
  if (!appIsClosingState && showSettings && !showLogs && settingsSnapRef.current) {
    return (
      <div className="settings-standalone-root">
        <div className="window-drag" data-tauri-drag-region />
        <Settings
          initialConfig={settingsSnapRef.current}
          onClose={handleSettingsClose}
          ispDetection={ispDetection}
          isConnected={isConnected}
          currentPort={currentPort}
          defenderDecision={defenderDecision}
          requestDefenderExclusion={stableRequestDefenderExclusion}
          onAutostartError={handleAutostartError}
        />
        <UpdateAvailableModal
          open={showUpdateModal && !!updateInfo}
          t={t}
          version={updateInfo?.version}
          onDownload={() => {
            if (updateInfo?.url) openShell(updateInfo.url);
            setShowUpdateModal(false);
          }}
          onLater={() => {
            if (updateInfo?.version) {
              localStorage.setItem(LS_KEYS.dismissedUpdateVersion, updateInfo.version);
            }
            setShowUpdateModal(false);
          }}
        />
        <DefenderConsentModal
          open={showDefenderConsent}
          t={t}
          onAccept={handleDefenderConsentAccept}
          onDecline={handleDefenderConsentDecline}
        />
      </div>
    );
  }

  return (
    <div className={`app-container fade-in${isConnected ? ' is-connected' : ''}${overlayActive ? ' overlay-open' : ''}`}>
      <AnimatePresence>
        {appIsClosingState && (
          <motion.div
            className="closing-screen-overlay"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              zIndex: 999999,
              background: "#09090b",
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            <div
              style={{
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <img
                src={APP.logo}
                alt="DPIReaper"
                className="app-logo app-logo--hero"
                style={{ animation: "pulse 2s infinite ease-in-out" }}
              />
              <h1 style={{ fontSize: "1.3rem", fontWeight: "600", color: "#fff", marginBottom: "0.5rem" }}>
                {t.confirmExitTitle || "Closing DPIReaper"}
              </h1>
              <p style={{ color: "#a1a1aa", fontSize: "0.95rem" }}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={closingStep}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "inline-block" }}
                  >
                    {closingStep === 0 
                      ? (t.logShutdownStarting || "Ending secure connection").replace(/\.+$/, "")
                      : "Closing application"}
                    <span style={{ display: "inline-block", width: "16px", textAlign: "left" }}>
                      {closingDots}
                    </span>
                  </motion.span>
                </AnimatePresence>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="window-drag" data-tauri-drag-region />

      <AnimatePresence>
        {!isAdmin && !import.meta.env.DEV && !appIsClosingState && (
          <motion.div
            className="v2-settings-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              zIndex: 99999,
              background: "#09090b",
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            {/* Background Glow */}
            <div
              style={{
                position: "absolute",
                top: "40%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "100%",
                height: "400px",
                background:
                  "radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, rgba(0,0,0,0) 60%)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />

            <div
              style={{
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                maxWidth: "420px",
              }}
            >
              <img
                src={APP.logo}
                alt="DPIReaper"
                className="app-logo app-logo--hero-lg"
              />

              <h1
                style={{
                  fontSize: "1.5rem",
                  marginBottom: "0.75rem",
                  color: "#fff",
                  fontWeight: "700",
                }}
              >
                {t.adminTitle}
              </h1>

              <p
                style={{
                  color: "#a1a1aa",
                  marginBottom: "1.5rem",
                  lineHeight: "1.6",
                  fontSize: "0.95rem",
                }}
              >
                {t.adminDesc}
              </p>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "12px",
                  padding: "1rem",
                  marginBottom: "2rem",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      padding: "10px",
                      borderRadius: "8px",
                      color: "#ef4444",
                      flexShrink: 0,
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Shield size={22} />
                  </div>
                  <div>
                    <div
                      style={{
                        color: "#d4d4d8",
                        fontSize: "0.85rem",
                        lineHeight: "1.4",
                      }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t.adminStep, PURIFY_CONFIG) }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  width: "100%",
                }}
              >
                <button
                  style={{
                    background: "var(--accent-primary, #6366f1)",
                    color: "white",
                    padding: "0.8rem 2rem",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    width: "100%",
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.target.style.opacity = "1")}
                  onClick={async () => {
                    try {
                      await invoke("relaunch_as_admin");
                    } catch (e) {
                      console.error("Relaunch as admin failed:", e);
                    }
                  }}
                >
                  {t.adminRelaunch}
                </button>
                <button
                  style={{
                    background: "#ef4444",
                    color: "white",
                    padding: "0.8rem 2rem",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    width: "100%",
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.target.style.opacity = "1")}
                  onClick={async () => {
                    try {
                      await invoke("quit_app");
                    } catch (e) {
                      console.error("Quit app failed:", e);
                      await getCurrentWindow().destroy();
                    }
                  }}
                >
                  {t.adminClose}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!overlayActive && (
        <>
      {/* First launch — multi-step onboarding (C6) */}
      <AnimatePresence>
        {isAdmin && showFirstRunISS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="v2-settings-overlay"
            style={{
              zIndex: 99998,
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
            }}
          >
            <div style={{
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              maxWidth: "360px",
              width: "100%",
              textAlign: "center",
            }}>
              <img
                src={APP.logo}
                alt="DPIReaper"
                className="app-logo app-logo--hero"
                style={{ alignSelf: "center" }}
              />

              {/* Step indicator — 4 steps (0=language, 1=what it does, 2=profile, 3=LAN) */}
              <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "0.5rem 0 1rem" }}>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: i === onboardingStep ? 22 : 8,
                      height: 4,
                      borderRadius: 2,
                      background: i === onboardingStep ? "var(--accent, #007fff)" : "rgba(255,255,255,0.15)",
                      transition: "width var(--transition-base, 0.2s)",
                    }}
                  />
                ))}
              </div>

              {onboardingStep === 0 && (
                <>
                  <h1 style={{ fontSize: "1.15rem", marginBottom: "0.4rem", color: "var(--text-primary)", fontWeight: 700, letterSpacing: 0.5 }}>
                    {t.onboardingStep0Title}
                  </h1>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: 1.45, fontSize: "0.8rem" }}>
                    {t.onboardingStep0Desc}
                  </p>
                  <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 2 }}>
                    <LanguagePicker
                      value={config.language}
                      onChange={(code) => updateConfig('language', code)}
                      t={t}
                      inline
                    />
                  </div>
                </>
              )}

              {onboardingStep === 1 && (
                <>
                  <h1 style={{ fontSize: "1.15rem", marginBottom: "0.4rem", color: "var(--text-primary)", fontWeight: 700, letterSpacing: 0.5 }}>
                    {t.onboardingStep1Title}
                  </h1>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", lineHeight: 1.5, fontSize: "0.82rem" }}>
                    {t.onboardingStep1Desc}
                  </p>
                </>
              )}

              {onboardingStep === 2 && (
                <>
                  <h1 style={{ fontSize: "1.15rem", marginBottom: "0.4rem", color: "var(--text-primary)", fontWeight: 700, letterSpacing: 0.5 }}>
                    {t.onboardingStep2Title}
                  </h1>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "1.0rem", lineHeight: 1.45, fontSize: "0.82rem" }}>
                    {t.onboardingStep2Desc}
                  </p>
                  <ConnectionProfilePicker
                    config={config}
                    updateConfig={updateConfig}
                    t={t}
                    compact={true}
                    ispDetection={ispDetection}
                  />
                </>
              )}

              {onboardingStep === 3 && (
                <>
                  <h1 style={{ fontSize: "1.15rem", marginBottom: "0.4rem", color: "var(--text-primary)", fontWeight: 700, letterSpacing: 0.5 }}>
                    {t.onboardingStep3Title}
                  </h1>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "1.0rem", lineHeight: 1.5, fontSize: "0.82rem" }}>
                    {t.onboardingStep3Desc}
                  </p>
                </>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: "1rem" }}>
                {onboardingStep > 0 && (
                  <button
                    onClick={() => setOnboardingStep(onboardingStep - 1)}
                    className="cta-btn cta-btn--secondary"
                  >
                    {t.onboardingBack}
                  </button>
                )}
                {onboardingStep < 3 && (
                  <button
                    onClick={() => setOnboardingStep(onboardingStep + 1)}
                    className="cta-btn cta-btn--primary"
                  >
                    {t.onboardingNext}
                  </button>
                )}
                {onboardingStep === 3 && (
                  <button
                    onClick={() => {
                      localStorage.setItem(LS_KEYS.firstRun, 'true');
                      localStorage.setItem(LS_KEYS.onboardingDone, 'true');
                      setShowFirstRunISS(false);
                      if (!isConnected && !isProcessing) {
                        retryCount.current = 0;
                        userIntentDisconnect.current = false;
                        setIsProcessing(true);
                        startEngine(8080);
                      }
                    }}
                    className="cta-btn cta-btn--primary"
                  >
                    <Power size={16} strokeWidth={2.4} />
                    {t.firstRunApply}
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  localStorage.setItem(LS_KEYS.firstRun, 'true');
                  localStorage.setItem(LS_KEYS.onboardingDone, 'true');
                  setShowFirstRunISS(false);
                }}
                style={{
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  border: "none",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  padding: "0.75rem 0.5rem 0",
                  transition: "color var(--transition-fast)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
              >
                {t.firstRunSkip}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Alert */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden", background: "#eab308" }}
          >
            <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#000", fontSize: "0.85rem", fontWeight: 600 }}>
              <WifiOff size={16} />
              <span>{t.noInternetTitle}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="main-content">
        <div className="shield-wrapper">
          <div
            className={`shield-circle ${isConnected ? "connected" : isProcessing ? "processing" : ""}`}
          >
            <Shield size={56} strokeWidth={1.5} className="shield-icon" />
          </div>
        </div>

        <div className="status-text">
          <h1
            className={`status-title ${isConnected ? "connected" : isProcessing ? "processing" : ""}`}
          >
            {isProcessing
              ? isConnected
                ? t.statusDisconnecting
                : t.statusConnecting
              : isConnected
                ? t.statusConnected
                : t.statusReady2}
          </h1>
          <p className="status-desc">
            {isProcessing
              ? t.descConnecting
              : isConnected
                ? t.descConnected
                : t.descReady}
          </p>
        </div>

        <AnimatePresence>
          {isConnected && !isProcessing && (() => {
            const tier = detectProfileTier(config);
            const tierLabel = tier
              ? (t[`profile${tier.charAt(0).toUpperCase()}${tier.slice(1)}Name`] || tier)
              : (t.profileCustomLabel || 'Custom');
            const dnsLabel = config.selectedDns && config.selectedDns !== 'system'
              ? config.selectedDns.toUpperCase()
              : null;
            return (
              <motion.div
                key="stats-stack"
                className="stats-stack"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
              >
                <div className="status-summary-row">
                  <div className="status-summary">
                    <span className="status-summary-item">
                      <span className="status-summary-label">{t.summaryProfile || 'Profil'}</span>
                      <span className="status-summary-value">{tierLabel}</span>
                    </span>
                    {dnsLabel && (
                      <>
                        <span className="status-summary-divider" />
                        <span className="status-summary-item">
                          <span className="status-summary-label">{t.summaryDns || 'DNS'}</span>
                          <span className="status-summary-value">{dnsLabel}</span>
                        </span>
                      </>
                    )}
                  </div>
                  {/* Health indicator — same row, right side */}
                  {healthStatus && (
                    <div className={`health-indicator ${healthStatus.ok ? 'is-ok' : 'is-fail'}`}>
                      <span className="health-indicator-dot" />
                      <span className="health-indicator-text">
                        {healthStatus.ok
                          ? (healthStatus.latencyMs > 0
                              ? `${t.healthLabelOk} · ${healthStatus.latencyMs}ms`
                              : t.healthLabelOk)
                          : t.healthLabelFail}
                      </span>
                    </div>
                  )}
                </div>
                <BypassGraph stats={bypassStats} t={t} visible />
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </main>

      {/* Top-right: connect (LAN) + donate */}
      <div className="main-corner-bar">
        <AnimatePresence>
          {config.lanSharing && isConnected && (
            <motion.button
              key="lan-connect"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              className="icon-btn lan-connect-corner-btn"
              onClick={() => setShowConnectionModal(true)}
              aria-label={t.btnConnectDevices}
              title={t.btnConnectDevices}
            >
              <Smartphone size={16} />
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="donate-corner-btn"
          onClick={() => openShell(URLS.patreon).catch(() => {})}
          aria-label={t.donateLabel}
          title={t.donateLabel}
        >
          <Heart size={14} strokeWidth={2.4} />
          <span>{t.donateLabel}</span>
        </button>
      </div>

      {/* Action Button */}
      <div className="action-area">

        {(() => {
          const btnLabel = isApplyingSettings
            ? t.btnApplyingSettings
            : isProcessing
              ? isConnected
                ? t.btnDisconnecting
                : t.btnConnecting
              : isConnected
                ? t.btnDisconnect
                : t.btnConnect;
          return (
            <button
              className={`main-btn icon-only ${isConnected ? "disconnect" : "connect"} ${isProcessing ? "processing" : ""}`}
              onClick={toggleConnection}
              disabled={isProcessing || isRestartingDpi.current || isRestartingLan.current}
              aria-label={btnLabel}
              title={btnLabel}
            >
              <Power size={26} strokeWidth={2.4} />
            </button>
          );
        })()}
      </div>

      {/* Bottom Navigation — icon-only */}
      <nav className="bottom-nav" aria-label={t.navSettings + " / " + t.navLogs}>
        <button
          className="nav-btn nav-btn--icon"
          onClick={openSettings}
          aria-label={t.navSettings}
          title={t.navSettings}
        >
          <SlidersHorizontal size={20} strokeWidth={2} />
        </button>
        <div className="nav-divider" />
        <button
          className="nav-btn nav-btn--icon"
          onClick={() => setShowLogs(true)}
          aria-label={t.navLogs}
          title={t.navLogs}
        >
          <ScrollText size={20} strokeWidth={2} />
        </button>
      </nav>
        </>
      )}

      {!appIsClosingState && overlayActive && showLogs && (
        <div className="logs-overlay">
          <div className="logs-header">
            <h3 className="logs-title-text">{t.logsTitle}</h3>
            <div className="logs-header-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={clearLogs}
                disabled={logs.length === 0}
                aria-label={t.logsClear}
                title={t.logsClear}
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                className={`icon-btn ${copyStatus === 'success' ? 'is-success' : ''} ${copyStatus === 'error' ? 'is-error' : ''}`}
                onClick={copyLogs}
                disabled={logs.length === 0}
                aria-label={t.logsCopy}
                title={t.logsCopy}
              >
                {copyStatus === 'success' ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowLogs(false)}
                aria-label="Close"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {(() => {
            const filterCounts = logs.reduce((acc, l) => {
              acc.all++;
              if (l.type === 'warn') acc.warn++;
              else if (l.type === 'error') acc.error++;
              else acc.info++;
              return acc;
            }, { all: 0, info: 0, warn: 0, error: 0 });

            const filters = [
              { id: 'all',   label: t.logsFilterAll },
              { id: 'info',  label: t.logsFilterInfo },
              { id: 'warn',  label: t.logsFilterWarn },
              { id: 'error', label: t.logsFilterError },
            ];

            const visibleLogs = logFilter === 'all'
              ? logs
              : logFilter === 'info'
                ? logs.filter(l => l.type !== 'warn' && l.type !== 'error')
                : logs.filter(l => l.type === logFilter);

            return (
              <>
                <div className="logs-filter-bar">
                  {filters.map(f => (
                    <button
                      key={f.id}
                      className={`logs-filter-btn ${logFilter === f.id ? 'active' : ''}`}
                      onClick={() => setLogFilter(f.id)}
                    >
                      <span>{f.label}</span>
                      <span className="logs-filter-count">{filterCounts[f.id]}</span>
                    </button>
                  ))}
                </div>

                <div className="console-content">
                  {visibleLogs.length === 0 ? (
                    <div className="logs-empty">
                      <FileText size={32} strokeWidth={1.5} />
                      <p>{logs.length === 0 ? t.logsEmpty : t.logsEmptyFiltered}</p>
                    </div>
                  ) : (
                    visibleLogs.map((log, index) => (
                      <div key={log.id} className={`log-line log-${log.type}`}>
                        <span className="log-number">
                          {String(index + 1).padStart(3, "0")}
                        </span>
                        <span className="log-time">[{log.time}]</span>
                        <span className="log-msg">{getLogText(log)}</span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </>
            );
          })()}

        </div>
      )}

      {/* Connect device — simple QR modal */}
      <AnimatePresence>
        {showConnectionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="connect-modal-overlay"
            onClick={() => setShowConnectionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="connect-modal-box"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="connect-modal-header">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowConnectionModal(false)}
                  aria-label="Close"
                  title="Close"
                >
                  <X size={16} />
                </button>
                <h2 className="connect-modal-title">{t.btnConnectDevices}</h2>
              </div>
              <div className="connect-modal-qr">
                <QRCodeSVG value={`http://${lanIp}:${pacPort}/?lang=${config.language || 'en'}`} size={280} level="M" />
              </div>
              <p className="connect-modal-caption">{t.modalScanWithPhone}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {confirmState.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            style={{
              zIndex: 999999,
              background: "rgba(9, 9, 11, 0.65)",
              backdropFilter: "blur(6px)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "40%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "100%",
                height: "400px",
                background:
                  "radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, rgba(0,0,0,0) 50%)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />

            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="connection-modal"
              style={{
                zIndex: 1,
                textAlign: "center",
                maxWidth: "340px",
                background: "#18181b",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                padding: "24px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1.25rem",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  <AlertTriangle size={30} strokeWidth={1.5} />
                </div>

                <h2
                  style={{
                    fontSize: "1.25rem",
                    color: "#f8fafc",
                    marginBottom: "0.75rem",
                    fontWeight: "600",
                  }}
                >
                  {confirmState.title}
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    marginBottom: "2rem",
                    lineHeight: "1.6",
                  }}
                >
                  {confirmState.desc}
                </p>

                <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                  <button
                    onClick={() => handleConfirmResult(false)}
                    style={{
                      fontFamily: "inherit",
                      flex: 1,
                      background: "rgba(255, 255, 255, 0.03)",
                      color: "#cbd5e1",
                      padding: "0.85rem",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      fontWeight: "500",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.08)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255, 255, 255, 0.03)";
                      e.currentTarget.style.color = "#cbd5e1";
                    }}
                  >
                    {t.btnNo || "Cancel"}
                  </button>
                  <button
                    autoFocus
                    onClick={() => handleConfirmResult(true)}
                    style={{
                      fontFamily: "inherit",
                      flex: 1,
                      background: "#ef4444",
                      color: "#ffffff",
                      padding: "0.85rem",
                      border: "none",
                      borderRadius: "10px",
                      fontWeight: "600",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#dc2626";
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 6px 20px rgba(239, 68, 68, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#ef4444";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 4px 14px rgba(239, 68, 68, 0.3)";
                    }}
                  >
                    {t.btnYes || "Confirm"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <UpdateAvailableModal
        open={showUpdateModal && !!updateInfo}
        t={t}
        version={updateInfo?.version}
        onDownload={() => {
          if (updateInfo?.url) openShell(updateInfo.url);
          setShowUpdateModal(false);
        }}
        onLater={() => {
          if (updateInfo?.version) {
            localStorage.setItem(LS_KEYS.dismissedUpdateVersion, updateInfo.version);
          }
          setShowUpdateModal(false);
        }}
      />

      <DefenderConsentModal
        open={showDefenderConsent}
        t={t}
        onAccept={handleDefenderConsentAccept}
        onDecline={handleDefenderConsentDecline}
      />
    </div>
  );
}

export default App;
