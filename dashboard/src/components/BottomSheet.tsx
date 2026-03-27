import { useState, useRef, useCallback } from 'react';
import { theme } from '../styles/theme';

interface BottomSheetProps {
  children: React.ReactNode;
  visible: boolean;
}

const SNAP_COLLAPSED = 120;
const SNAP_EXPANDED = 320;

export default function BottomSheet({ children, visible }: BottomSheetProps) {
  const [height, setHeight] = useState(SNAP_COLLAPSED);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = startY.current - e.clientY;
    const newHeight = Math.max(SNAP_COLLAPSED, Math.min(SNAP_EXPANDED, startHeight.current + delta));
    setHeight(newHeight);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    // Snap to nearest
    setHeight(h => (h > (SNAP_COLLAPSED + SNAP_EXPANDED) / 2 ? SNAP_EXPANDED : SNAP_COLLAPSED));
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 400,
        height,
        zIndex: 50,
        background: theme.glass.background,
        backdropFilter: theme.glass.backdropFilter,
        border: theme.glass.border,
        borderRadius: `${theme.radius.lg} ${theme.radius.lg} 0 0`,
        boxShadow: '0 -4px 32px rgba(0, 0, 0, 0.4)',
        transition: dragging.current ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Drag Handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          padding: '12px 0 8px',
          cursor: 'grab',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: theme.colors.textMuted,
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 16px' }}>
        {children}
      </div>
    </div>
  );
}
