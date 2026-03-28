import { ChevronLeft, ChevronRight } from 'lucide-react';
import { theme } from '../styles/theme';

interface TopBarProps {
  selectedDate: string; // "2026-03-28"
  onDateChange: (date: string) => void;
  isToday: boolean;
}

export default function TopBar({ selectedDate, onDateChange, isToday }: TopBarProps) {
  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  function changeDay(offset: number) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    onDateChange(d.toISOString().split('T')[0]);
  }

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
        gap: 8,
        background: theme.glass.background,
        backdropFilter: theme.glass.backdropFilter,
        border: theme.glass.border,
        borderRadius: theme.radius.full,
        padding: '6px 8px',
        boxShadow: theme.shadows.panel,
      }}
    >
      <button onClick={() => changeDay(-1)} style={navBtnStyle}>
        <ChevronLeft size={16} />
      </button>

      <div style={{ padding: '6px 16px', fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary, whiteSpace: 'nowrap' }}>
        {displayDate}
        {isToday && (
          <span style={{
            marginLeft: 8,
            padding: '2px 8px',
            borderRadius: theme.radius.full,
            background: 'rgba(5, 163, 87, 0.15)',
            color: theme.colors.green,
            fontSize: 11,
            fontWeight: 700,
          }}>
            LIVE
          </span>
        )}
      </div>

      <button
        onClick={() => changeDay(1)}
        disabled={isToday}
        style={{ ...navBtnStyle, opacity: isToday ? 0.3 : 1, cursor: isToday ? 'default' : 'pointer' }}
      >
        <ChevronRight size={16} />
      </button>

      {!isToday && (
        <button
          onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
          style={{
            padding: '6px 12px',
            borderRadius: theme.radius.full,
            border: 'none',
            background: theme.colors.accent,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Today
        </button>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%',
  border: 'none', background: 'rgba(255,255,255,0.06)',
  color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
