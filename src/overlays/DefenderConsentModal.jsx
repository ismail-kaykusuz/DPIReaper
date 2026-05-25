import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

/**
 * Defender exclusion için onaylı dialog. İlk açılışta veya kullanıcı henüz
 * karar vermediğinde gösterilir. "Şimdi ekle" → UAC + add_defender_exclusions.
 * "Daha sonra" → flag = 'declined', modal bir daha çıkmaz.
 */
const DefenderConsentModal = ({ open, t, onAccept, onDecline }) => {
  const [busy, setBusy] = useState(false);
  const acceptBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setBusy(false);
    const id = setTimeout(() => acceptBtnRef.current?.focus(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDecline?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onDecline]);

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAccept?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
          style={{
            zIndex: 999998,
            background: 'rgba(9, 9, 11, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="defender-consent-title"
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{
              maxWidth: 380,
              width: '100%',
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              padding: '22px 22px 18px',
              color: '#f8fafc',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  flexShrink: 0,
                }}
              >
                <ShieldCheck size={22} />
              </div>
              <h2
                id="defender-consent-title"
                style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}
              >
                {t.defenderConsentTitle}
              </h2>
            </div>

            <div
              style={{
                fontSize: '0.82rem',
                color: '#cbd5e1',
                lineHeight: 1.55,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 18,
              }}
            >
              <p style={{ margin: 0 }}>{t.defenderConsentBody1}</p>
              <p style={{ margin: 0 }}>{t.defenderConsentBody2}</p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.78rem' }}>
                {t.defenderConsentBody3}
              </p>
            </div>

            <div className="cta-row">
              <button
                type="button"
                onClick={onDecline}
                disabled={busy}
                className="cta-btn cta-btn--secondary"
              >
                {t.defenderConsentDecline}
              </button>
              <button
                ref={acceptBtnRef}
                type="button"
                onClick={handleAccept}
                disabled={busy}
                className="cta-btn cta-btn--primary"
              >
                {busy ? t.defenderAddingBtn : t.defenderConsentAccept}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DefenderConsentModal;
