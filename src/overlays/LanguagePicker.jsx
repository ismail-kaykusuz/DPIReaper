import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, X, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';

/**
 * Modern dil seçici:
 *  - Trigger: küçük kart (mevcut dil bayrağı + adı + chevron)
 *  - Sheet: 2-sütun grid, her hücre küçük dil kartı (bayrak + native isim)
 *  - Seçili dilde accent border + tick
 *  - ESC ile kapatma, dış tıklama ile kapatma
 *
 * Onboarding'de inline=true ile sadece grid render edilir (trigger yok).
 */
const LanguagePicker = ({ value, onChange, t, inline = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === value) || SUPPORTED_LANGUAGES[0];

  const Grid = (
    <div className="lang-grid" role="radiogroup" aria-label={t.languageSheetTitle || 'Pick a language'}>
      {SUPPORTED_LANGUAGES.map((l) => {
        const selected = value === l.code;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`lang-tile ${selected ? 'is-selected' : ''}`}
            onClick={() => {
              onChange(l.code);
              setOpen(false);
            }}
          >
            <span className="lang-tile-flag">{l.flag}</span>
            <span className="lang-tile-name">{l.name}</span>
            {selected && <Check size={12} className="lang-tile-check" />}
          </button>
        );
      })}
    </div>
  );

  if (inline) {
    // Onboarding adım 0: trigger yok, sadece grid
    return Grid;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lang-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="lang-trigger-text">
          <h3>{t.language}</h3>
          <p>{t.languageDesc}</p>
        </div>
        <div className="lang-trigger-pill">
          <span className="lang-tile-flag">{current.flag}</span>
          <span className="lang-trigger-name">{current.name}</span>
          <ChevronDown size={14} className="lang-trigger-chevron" />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lang-sheet-overlay"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="lang-sheet-box"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="lang-sheet-header">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Kapat"
                  title="Kapat"
                >
                  <X size={16} />
                </button>
                <h2 className="lang-sheet-title">{t.languageSheetTitle || 'Pick a language'}</h2>
              </div>
              {Grid}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LanguagePicker;
