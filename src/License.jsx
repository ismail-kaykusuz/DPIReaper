import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Power, Shield, AlertTriangle, Check, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { APP, LS_KEYS } from './constants';

/** Lisans dosyası metninden token'ı çıkartır (dpir- ile başlayan tek satırlık string). */
function extractTokenFromText(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('dpir-') && t.length > 50) return t;
  }
  // Tek parça da olabilir — boşlukları temizleyip kontrol
  const compact = String(text).replace(/\s+/g, '');
  if (compact.startsWith('dpir-')) return compact;
  return null;
}

/**
 * License gate — uygulamadan önce gelen lisans doğrulama ekranı.
 * Geçerli token bulunursa onSuccess(status) çağrılır; aksi halde giriş alanı gösterilir.
 *
 * mode: 'enter' (henüz lisans yok) | 'expired' (mevcut lisans bitti)
 */
export default function License({ t, mode = 'enter', expiredStatus = null, onSuccess, onQuit }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleActivate = async (overrideToken) => {
    const token = (overrideToken ?? input).trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const status = await invoke('verify_license', { token });
      if (status?.valid) {
        localStorage.setItem(LS_KEYS.license, token);
        onSuccess(status);
      } else {
        setError(status?.reason || t.licenseInvalid);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Lisans dosyası', extensions: ['txt', 'lic'] }],
      });
      if (!selected) return;
      const path = Array.isArray(selected) ? selected[0] : selected;
      const text = await readTextFile(path);
      const token = extractTokenFromText(text);
      if (!token) {
        setError(t.licenseFileError);
        return;
      }
      setInput(token);
      setError(null);
      await handleActivate(token);
    } catch (e) {
      setError(t.licenseFileError + ' — ' + String(e));
    }
  };

  const isExpired = mode === 'expired';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="v2-settings-overlay"
      style={{
        zIndex: 100000,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        maxWidth: 360,
        width: '100%',
        textAlign: 'center',
      }}>
        <img
          src={APP.logo}
          alt="DPIReaper"
          className="app-logo app-logo--hero"
          style={{ alignSelf: 'center' }}
        />

        <div style={{
          display: 'inline-flex',
          alignSelf: 'center',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          marginBottom: 14,
          borderRadius: 99,
          background: isExpired ? 'var(--accent-soft)' : 'var(--surface-1)',
          border: '1px solid ' + (isExpired ? 'var(--accent-glow)' : 'var(--border-default)'),
          color: isExpired ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}>
          {isExpired ? <AlertTriangle size={12} /> : <Shield size={12} />}
          {isExpired ? t.licenseExpiredShort : 'Lisans'}
        </div>

        <h1 style={{
          fontSize: '1.2rem',
          marginBottom: 6,
          color: 'var(--text-primary)',
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>
          {isExpired ? t.licenseExpiredTitle : t.licenseTitle}
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          marginBottom: 18,
          lineHeight: 1.45,
          fontSize: '0.85rem',
        }}>
          {isExpired ? t.licenseExpiredDesc : t.licenseDesc}
        </p>

        {isExpired && expiredStatus?.name && (
          <div style={{
            marginBottom: 14,
            padding: '10px 14px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            background: 'var(--surface-1)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>{t.licenseHolder}: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{expiredStatus.name}</span>
            </div>
            {expiredStatus.expiresAt && (
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>{t.licenseExpiresAt}: </span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {new Date(expiredStatus.expiresAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder={t.licensePlaceholder}
          spellCheck={false}
          rows={4}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '1px solid ' + (error ? 'var(--accent-glow)' : 'var(--border-default)'),
            borderRadius: 10,
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.78rem',
            lineHeight: 1.4,
            resize: 'vertical',
            outline: 'none',
            wordBreak: 'break-all',
            transition: 'border-color var(--transition-fast)',
          }}
        />

        {error && (
          <p style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--accent-softer)',
            border: '1px solid var(--accent-glow)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: '0.78rem',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </p>
        )}

        <button
          onClick={() => handleActivate()}
          disabled={busy || !input.trim()}
          className="main-btn connect"
          style={{ marginTop: '1.25rem', opacity: busy || !input.trim() ? 0.6 : 1 }}
        >
          {busy ? <Power size={16} className="spin" /> : <Check size={18} strokeWidth={2.4} />}
          {busy ? t.licenseChecking : t.licenseActivate}
        </button>

        <button
          onClick={handlePickFile}
          disabled={busy}
          style={{
            marginTop: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            background: 'var(--surface-1)',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            transition: 'all var(--transition-fast)',
            opacity: busy ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (busy) return;
            e.currentTarget.style.borderColor = 'var(--accent-glow)';
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.background = 'var(--accent-softer)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)';
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'var(--surface-1)';
          }}
        >
          <FileText size={16} strokeWidth={2} />
          {t.licenseFromFile}
        </button>

        <button
          onClick={onQuit}
          style={{
            background: 'transparent',
            color: 'var(--text-tertiary)',
            border: 'none',
            fontSize: '0.82rem',
            cursor: 'pointer',
            padding: '0.75rem 0.5rem 0',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          {t.licenseQuitBtn}
        </button>
      </div>
    </motion.div>
  );
}
