import React from 'react';

/** Kurumsal toggle — kırmızı vurguda aktif. */
const Toggle = ({ checked, onChange }) => (
  <div
    className={`v2-toggle ${checked ? 'active' : ''}`}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
  >
    <div className="v2-toggle-thumb" />
  </div>
);

export default Toggle;
