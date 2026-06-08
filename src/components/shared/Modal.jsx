import React, { useEffect } from 'react';

/**
 * Shared modal shell: owns the backdrop, click-outside-to-close, and Escape
 * handling so individual modals only define their own body.
 *
 * variant:
 *   'center' (default) — centered dialog, uses the `.popup` look from index.css
 *   'top'              — anchored near the top of the viewport (mobile forms)
 *
 * className / style are applied to the inner container so callers keep control
 * of their own chrome (padding, width, etc.).
 */
export default function Modal({ onClose, variant = 'center', className = '', style, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (variant === 'top') {
    return (
      <>
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }}
        />
        <div
          className={className}
          style={{
            position: 'fixed', left: '50%', top: 16, transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)', zIndex: 101,
            ...style,
          }}
        >
          {children}
        </div>
      </>
    );
  }

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className={`popup ${className}`.trim()} style={style} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
