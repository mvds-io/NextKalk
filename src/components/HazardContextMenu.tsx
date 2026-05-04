'use client';

import { useEffect, useRef } from 'react';

interface Props {
  x: number;
  y: number;
  onPick: (kind: 'circle' | 'polyline') => void;
  onClose: () => void;
}

export default function HazardContextMenu({ x, y, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp position so menu stays in viewport
  const menuWidth = 230;
  const menuHeight = 110;
  const clampedX = Math.min(Math.max(x, 8), window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(Math.max(y, 8), window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 10000,
        background: '#fff',
        border: '1px solid #d4d4d8',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: 6,
        minWidth: menuWidth,
        fontSize: 14,
      }}
    >
      <div style={{ padding: '6px 10px 8px', fontWeight: 600, color: '#dc2626' }}>
        <i className="fas fa-triangle-exclamation me-2" /> Legg til fare
      </div>
      <button
        type="button"
        onClick={() => onPick('circle')}
        style={menuItemStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <i className="fas fa-circle-notch me-2" /> Sirkel (område)
      </button>
      <button
        type="button"
        onClick={() => onPick('polyline')}
        style={menuItemStyle}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <i className="fas fa-route me-2" /> Linje (f.eks. høyspent)
      </button>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  background: 'transparent',
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  color: '#111827',
};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
}
