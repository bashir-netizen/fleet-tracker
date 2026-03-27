import { theme } from '../styles/theme';

export type ViewMode = 'live' | 'replay';

interface TopBarProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  tripName?: string;
}

export default function TopBar({ mode, onModeChange, tripName }: TopBarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* Mode Pill Toggle */}
      <div
        style={{
          display: 'flex',
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          borderRadius: theme.radius.full,
          padding: 4,
          boxShadow: theme.shadows.panel,
        }}
      >
        <PillButton active={mode === 'live'} onClick={() => onModeChange('live')}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: mode === 'live' ? theme.colors.green : theme.colors.textMuted,
              display: 'inline-block',
              marginRight: 6,
              animation: mode === 'live' ? 'pulse-dot 2s ease-in-out infinite' : 'none',
            }}
          />
          Live
        </PillButton>
        <PillButton active={mode === 'replay'} onClick={() => onModeChange('replay')}>
          Replay
        </PillButton>
      </div>

      {/* Trip Name */}
      {tripName && (
        <div
          style={{
            background: theme.glass.background,
            backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border,
            borderRadius: theme.radius.full,
            padding: '8px 20px',
            color: theme.colors.textPrimary,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: theme.shadows.card,
            whiteSpace: 'nowrap',
          }}
        >
          {tripName}
        </div>
      )}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 20px',
        borderRadius: theme.radius.full,
        border: 'none',
        background: active ? theme.colors.accent : 'transparent',
        color: active ? '#FFFFFF' : theme.colors.textSecondary,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: theme.transitions.smooth,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}
