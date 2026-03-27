import { useState } from 'react';
import { Check, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Alert } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { severityColor, eventTypeLabel } from '../lib/formatters';
import { formatLocalTime, formatTimeAgo } from '../lib/geo';
import { theme } from '../styles/theme';

interface AlertPanelProps {
  alerts: Alert[];
  visible: boolean;
  onClose: () => void;
  onAcknowledge: (alertId: string) => void;
}

type FilterTab = 'all' | 'critical' | 'warning';

export default function AlertPanel({ alerts, visible, onClose, onAcknowledge }: AlertPanelProps) {
  const [filter, setFilter] = useState<FilterTab>('all');

  if (!visible) return null;

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter(a => a.severity === filter);

  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;
  const warningCount = alerts.filter(a => a.severity === 'warning' && !a.acknowledged).length;

  async function handleAcknowledge(alertId: string) {
    await supabase.from('alerts').update({ acknowledged: true }).eq('id', alertId);
    onAcknowledge(alertId);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 16, left: 16,
        bottom: 16,
        width: 380,
        zIndex: 60,
        background: theme.glass.background,
        backdropFilter: theme.glass.backdropFilter,
        border: theme.glass.border,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.panel,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slide-down 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: theme.colors.textPrimary }}>
          Alerts
        </h2>
        <button
          onClick={onClose}
          style={{
            padding: '6px 14px', borderRadius: theme.radius.sm,
            border: 'none', background: theme.colors.card,
            color: theme.colors.textSecondary, fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 24px' }}>
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({alerts.length})
        </FilterButton>
        <FilterButton active={filter === 'critical'} onClick={() => setFilter('critical')}>
          Critical ({criticalCount})
        </FilterButton>
        <FilterButton active={filter === 'warning'} onClick={() => setFilter('warning')}>
          Warnings ({warningCount})
        </FilterButton>
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 16px' }} className="hide-scrollbar">
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: theme.colors.textMuted, fontSize: 13 }}>
            No alerts
          </div>
        ) : (
          filtered.map(alert => {
            const color = severityColor(alert.severity);
            const isCritical = alert.severity === 'critical';

            return (
              <div
                key={alert.id}
                style={{
                  padding: '14px 0',
                  borderBottom: `1px solid ${theme.colors.border}`,
                  display: 'flex',
                  gap: 12,
                  opacity: alert.acknowledged ? 0.5 : 1,
                }}
              >
                {isCritical ? (
                  <ShieldAlert size={18} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={18} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: 4 }}>
                    {eventTypeLabel(alert.alert_type)}
                  </div>
                  {alert.message && (
                    <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 }}>
                      {alert.message}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
                    {formatLocalTime(alert.timestamp)} &middot; {formatTimeAgo(alert.timestamp)}
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    style={{
                      width: 32, height: 32,
                      borderRadius: '50%', border: 'none',
                      background: `${color}22`,
                      color, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, alignSelf: 'center',
                    }}
                    title="Acknowledge"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: theme.radius.full,
        border: 'none',
        background: active ? theme.colors.accent : theme.colors.card,
        color: active ? '#fff' : theme.colors.textSecondary,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: theme.transitions.smooth,
      }}
    >
      {children}
    </button>
  );
}
