import { useState } from 'react';
import { Layers } from 'lucide-react';
import { type MapStyleKey } from './Map';
import { theme } from '../styles/theme';

interface LayerSwitcherProps {
  currentStyle: MapStyleKey;
  onStyleChange: (style: MapStyleKey) => void;
}

const styles: { key: MapStyleKey; label: string; emoji: string }[] = [
  { key: 'dark', label: 'Dark', emoji: '🌙' },
  { key: 'streets', label: 'Streets', emoji: '🗺' },
  { key: 'satellite', label: 'Satellite', emoji: '🛰' },
];

export default function LayerSwitcher({ currentStyle, onStyleChange }: LayerSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.sm,
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          color: theme.colors.textPrimary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: theme.transitions.smooth,
          boxShadow: theme.shadows.card,
        }}
      >
        <Layers size={20} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            right: 0,
            background: theme.colors.panel,
            borderRadius: theme.radius.md,
            border: theme.glass.border,
            boxShadow: theme.shadows.panel,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 140,
            zIndex: 100,
          }}
        >
          {styles.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => {
                onStyleChange(key);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: theme.radius.sm,
                border: 'none',
                background: currentStyle === key ? theme.colors.accent : 'transparent',
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: currentStyle === key ? 600 : 400,
                transition: theme.transitions.smooth,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span style={{ fontSize: 18 }}>{emoji}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
