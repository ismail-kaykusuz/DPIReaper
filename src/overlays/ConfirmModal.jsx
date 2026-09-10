import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

/** App-styled confirm dialog (replaces window.confirm in Tauri/WebView2). */
const ConfirmModal = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-overlay confirm-modal-overlay"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, y: 15, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 15, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="connection-modal confirm-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="confirm-modal-icon-wrap">
            <AlertTriangle size={30} strokeWidth={1.5} />
          </div>
          <h2 className="confirm-modal-title">{title}</h2>
          <p className="confirm-modal-desc">{description}</p>
          <div className="confirm-modal-actions">
            <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className="confirm-modal-btn confirm-modal-btn--confirm" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default ConfirmModal;
