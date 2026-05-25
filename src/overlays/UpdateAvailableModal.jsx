import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';

const UpdateAvailableModal = ({ open, t, version, onDownload, onLater }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-overlay"
        style={{
          zIndex: 999998,
          background: 'rgba(9, 9, 11, 0.65)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 15, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="connection-modal"
          style={{
            zIndex: 1,
            textAlign: 'center',
            maxWidth: '340px',
            background: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            padding: '24px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <Download size={30} strokeWidth={1.5} />
          </div>
          <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', marginBottom: '0.75rem', fontWeight: 600 }}>
            {t.updateAvailableTitle}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            {typeof t.updateAvailableDesc === 'function'
              ? t.updateAvailableDesc(version)
              : t.updateAvailableDesc}
          </p>
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              type="button"
              onClick={onLater}
              style={{
                fontFamily: 'inherit',
                flex: 1,
                background: 'rgba(255, 255, 255, 0.03)',
                color: '#cbd5e1',
                padding: '0.85rem',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                fontWeight: 500,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {t.updateAvailableLater}
            </button>
            <button
              type="button"
              autoFocus
              onClick={onDownload}
              style={{
                fontFamily: 'inherit',
                flex: 1,
                background: '#10b981',
                color: '#fff',
                padding: '0.85rem',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {t.updateAvailableDownload}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default UpdateAvailableModal;
