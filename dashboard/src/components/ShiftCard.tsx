import { Radio } from 'lucide-react';
import type { Trip, LocationPing } from '../lib/firebase';
import { formatDuration, formatDistance, formatLocalTime, totalDistance } from '../lib/geo';
import { theme } from '../styles/theme';

interface ShiftCardProps {
  shift: Trip;
  pings: LocationPing[];
  stopCount: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ShiftCard({ shift, pings, stopCount, isActive, isSelected, onSelect }: ShiftCardProps) {
  const startTime = formatLocalTime(shift.started_at);
  const endTime = shift.ended_at ? formatLocalTime(shift.ended_at) : null;
  const duration = shift.ended_at
    ? new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()
    : Date.now() - new Date(shift.started_at).getTime();
  const distance = totalDistance(pings);

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        background: isSelected ? theme.colors.card : theme.colors.bg,
        border: isSelected ? `1px solid ${theme.colors.accent}` : `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        padding: '14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: theme.transitions.smooth,
        position: 'relative',
        marginBottom: 8,
      }}
    >
      {/* Active badge */}
      {isActive && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: theme.radius.full,
          background: 'rgba(5, 163, 87, 0.15)',
          color: theme.colors.green, fontSize: 10, fontWeight: 700,
        }}>
          <Radio size={8} style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
          LIVE
        </div>
      )}

      {/* Time range */}
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: 6 }}>
        {startTime} — {isActive ? 'Now' : endTime}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: theme.colors.textSecondary }}>
        <span>{formatDuration(duration)}</span>
        <span>{formatDistance(distance)}</span>
        <span>{stopCount} stop{stopCount !== 1 ? 's' : ''}</span>
        <span>{pings.length} pings</span>
      </div>
    </button>
  );
}
