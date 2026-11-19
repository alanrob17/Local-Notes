import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// items: [{ label, icon, onClick, danger } | 'separator']
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth - r.width - 8),
      top: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div className="menu" ref={ref} style={pos}>
      {items.map((it, i) =>
        it === 'separator' ? (
          <div className="menu-sep" key={i} />
        ) : (
          <button
            key={i}
            className={`menu-item${it.danger ? ' danger' : ''}`}
            onClick={() => { onClose(); it.onClick(); }}
          >
            {it.icon && <span className="menu-icon">{it.icon}</span>}
            <span>{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
