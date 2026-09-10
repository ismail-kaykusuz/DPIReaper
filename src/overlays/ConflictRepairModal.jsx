import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle, Check, ChevronLeft, RotateCw, ShieldCheck, X,
} from 'lucide-react';
import { formatDeepRepairSummary, localizeConflictFinding } from '../i18n/conflictFindings';

/** Full-screen deep repair flow: scan → list conflicts → full cleanup. */
const ConflictRepairModal = ({ open, t, onClose, onComplete }) => {
  const [phase, setPhase] = useState('scanning');
  const [findings, setFindings] = useState([]);
  const [scanError, setScanError] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const scanStartedRef = useRef(false);

  const runScan = useCallback(async () => {
    setPhase('scanning');
    setFindings([]);
    setScanError('');
    setResultMessage('');
    try {
      const result = await invoke('scan_dpi_conflicts');
      const raw = result?.findings ?? result?.Findings;
      const list = Array.isArray(raw) ? raw : [];
      setFindings(list);
      setPhase(list.length > 0 ? 'list' : 'clean');
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setScanError(msg || t.conflictScanErrorDesc);
      setPhase('scan-error');
    }
  }, [t.conflictScanErrorDesc]);

  useEffect(() => {
    if (!open) {
      scanStartedRef.current = false;
      return undefined;
    }
    if (scanStartedRef.current) return undefined;
    scanStartedRef.current = true;
    runScan();
    const onKey = (e) => {
      if (e.key === 'Escape' && phase !== 'acting') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, runScan, onClose, phase]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleFullClean = useCallback(async () => {
    setPhase('acting');
    try {
      const summary = await invoke('deep_repair_network');
      window.dispatchEvent(new CustomEvent('dpireaper-force-disconnect', {
        detail: { reason: 'deep-repair' },
      }));
      const text = formatDeepRepairSummary(summary, t) || t.deepRepairDoneDesc;
      const isPartial = summary?.partial ?? false;
      setResultMessage(text);
      setPhase('result');
      onComplete?.({ status: 'cleaned', summary: text, partial: isPartial });
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setResultMessage(msg || t.deepRepairErrorDesc);
      setPhase('error');
      onComplete?.({ status: 'error', summary: msg });
    }
  }, [onComplete, t.deepRepairPartialHint, t.deepRepairDoneDesc, t.deepRepairErrorDesc]);

  const title = phase === 'scanning'
    ? t.conflictScanning
    : phase === 'clean'
      ? t.conflictScanDone
      : phase === 'list'
        ? (typeof t.conflictScanFound === 'function'
          ? t.conflictScanFound(findings.length)
          : t.conflictScanFound)
        : phase === 'acting'
          ? t.deepRepairRunning
          : phase === 'result'
            ? t.deepRepairDone
            : phase === 'error' || phase === 'scan-error'
              ? t.deepRepairError
              : t.deepRepairTitle;

  const subtitle = phase === 'scanning'
    ? t.deepRepairScanDesc
    : phase === 'clean'
      ? t.conflictScanDoneDesc
      : phase === 'list'
        ? t.conflictRepairListDesc
        : phase === 'acting'
          ? t.deepRepairRunningDesc
          : phase === 'result' || phase === 'error'
            ? resultMessage
            : scanError || t.conflictScanErrorDesc;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="conflict-repair-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conflict-repair-title"
        >
          <div className="conflict-repair-header">
            <button
              type="button"
              className="conflict-repair-back"
              onClick={handleClose}
              disabled={phase === 'acting'}
              aria-label={t.btnClose || 'Close'}
            >
              <ChevronLeft size={24} />
            </button>
            <div className="conflict-repair-header-text">
              <h2 id="conflict-repair-title">{t.deepRepairTitle}</h2>
              <p>{subtitle}</p>
            </div>
            <button
              type="button"
              className="conflict-repair-close"
              onClick={handleClose}
              disabled={phase === 'acting'}
              aria-label={t.btnClose || 'Close'}
            >
              <X size={18} />
            </button>
          </div>

          <div className="conflict-repair-body">
            {phase === 'scanning' && (
              <div className="conflict-repair-center">
                <div className="conflict-repair-icon conflict-repair-icon--scan">
                  <RotateCw size={32} className="spinning" />
                </div>
                <h3>{title}</h3>
              </div>
            )}

            {phase === 'clean' && (
              <div className="conflict-repair-center">
                <div className="conflict-repair-icon conflict-repair-icon--ok">
                  <Check size={32} />
                </div>
                <h3>{title}</h3>
                <p className="conflict-repair-center-desc">{t.conflictScanDoneDesc}</p>
              </div>
            )}

            {phase === 'list' && (
              <ul className="conflict-repair-list">
                {findings.map((f) => {
                  const localized = localizeConflictFinding(f, t);
                  return (
                  <li
                    key={f.id}
                    className={f.severity === 'critical' ? 'is-critical' : 'is-warning'}
                  >
                    <div className="conflict-repair-list-icon">
                      <AlertTriangle size={16} />
                    </div>
                    <div className="conflict-repair-list-text">
                      <strong>{localized.title}</strong>
                      <span>{localized.detail}</span>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}

            {(phase === 'acting') && (
              <div className="conflict-repair-center">
                <div className="conflict-repair-icon conflict-repair-icon--scan">
                  <ShieldCheck size={32} className="spinning" />
                </div>
                <h3>{title}</h3>
              </div>
            )}

            {(phase === 'result' || phase === 'error' || phase === 'scan-error') && (
              <div className="conflict-repair-center">
                <div className={`conflict-repair-icon ${phase === 'result' ? 'conflict-repair-icon--ok' : 'conflict-repair-icon--warn'}`}>
                  {phase === 'result' ? <Check size={32} /> : <AlertTriangle size={32} />}
                </div>
                <h3>{title}</h3>
                {resultMessage && (
                  <p className="conflict-repair-center-desc">{resultMessage}</p>
                )}
                {scanError && phase === 'scan-error' && (
                  <p className="conflict-repair-center-desc">{scanError}</p>
                )}
              </div>
            )}
          </div>

          <div className="conflict-repair-footer">
            {phase === 'list' && (
              <button
                type="button"
                className="conflict-repair-btn conflict-repair-btn--primary conflict-repair-btn--full"
                onClick={handleFullClean}
              >
                {t.deepRepairCleanBtn}
              </button>
            )}
            {(phase === 'clean' || phase === 'result' || phase === 'error') && (
              <button
                type="button"
                className="conflict-repair-btn conflict-repair-btn--primary conflict-repair-btn--full"
                onClick={handleClose}
              >
                {t.btnOk || t.btnClose || 'Tamam'}
              </button>
            )}
            {phase === 'scan-error' && (
              <>
                <button
                  type="button"
                  className="conflict-repair-btn conflict-repair-btn--secondary"
                  onClick={handleClose}
                >
                  {t.btnClose || 'Kapat'}
                </button>
                <button
                  type="button"
                  className="conflict-repair-btn conflict-repair-btn--primary"
                  onClick={() => {
                    scanStartedRef.current = false;
                    runScan();
                  }}
                >
                  {t.conflictScanRetry || t.btnRetry || 'Tekrar dene'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConflictRepairModal;
