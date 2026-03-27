import { useEffect, useState } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import type { Alert } from '../lib/supabase';
import { severityColor, eventTypeLabel } from '../lib/formatters';
import { formatLocalTime } from '../lib/geo';
import { theme } from '../styles/theme';

interface AlertBannerProps {
  alerts: Alert[];
  onDismiss: (alertId: string) => void;
}

export default function AlertBanner({ alerts, onDismiss }: AlertBannerProps) {
  const [visibleAlerts, setVisibleAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    // Show new unacknowledged alerts
    const unacked = alerts.filter(a => !a.acknowledged);
    setVisibleAlerts(unacked.slice(0, 3)); // Max 3 banners

    // Auto-dismiss warnings after 10s
    const timers = unacked
      .filter(a => a.severity === 'warning')
      .map(a =>
        setTimeout(() => {
          setVisibleAlerts(prev => prev.filter(p => p.id !== a.id));
        }, 10000)
      );

    return () => timers.forEach(clearTimeout);
  }, [alerts]);

  if (visibleAlerts.length === 0) return null;

  return (
    <div style={{ position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, width: 500, maxWidth: '90vw' }}>
      {visibleAlerts.map(alert => {
        const color = severityColor(alert.severity);
        const isCritical = alert.severity === 'critical';

        return (
          <div
            key={alert.id}
            style={{
              background: theme.colors.panel,
              border: `1px solid ${color}44`,
              borderLeft: `4px solid ${color}`,
              borderRadius: theme.radius.md,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 12px ${color}33`,
              animation: 'slide-down 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              ...(isCritical ? { animation: 'slide-down 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), pulse-glow 2s ease-in-out infinite' } : {}),
            }}
          >
            {isCritical ? (
              <ShieldAlert size={20} color={color} style={{ flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={20} color={color} style={{ flexShrink: 0 }} />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary }}>
                {eventTypeLabel(alert.alert_type)}
              </div>
              <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                {alert.message || alert.alert_type} &middot; {formatLocalTime(alert.timestamp)}
              </div>
            </div>

            <button
              onClick={() => {
                onDismiss(alert.id);
                setVisibleAlerts(prev => prev.filter(a => a.id !== alert.id));
              }}
              style={{
                width: 28, height: 28,
                borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.06)',
                color: theme.colors.textSecondary,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
