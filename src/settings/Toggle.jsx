import React from 'react';

/** Kurumsal toggle — kırmızı vurguda aktif. */
const Toggle = ({ checked, onChange, label }) => (
  <div
    role="switch"
    tabIndex={0}
    aria-checked={!!checked}
    aria-label={label || undefined}
    className={`v2-toggle ${checked ? 'active' : ''}`}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
    onKeyDown={(e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onChange(!checked);
      }
    }}
  >
    <div className="v2-toggle-thumb" />
  </div>
);

export default Toggle;
