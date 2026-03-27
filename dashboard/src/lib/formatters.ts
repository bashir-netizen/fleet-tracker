export function batteryColor(level: number | null): string {
  if (level === null) return '#5E5E63';
  if (level > 50) return '#05A357';
  if (level > 20) return '#FF9500';
  return '#E11900';
}

export function batteryIcon(level: number | null): string {
  if (level === null) return 'battery';
  if (level > 75) return 'battery-full';
  if (level > 50) return 'battery-medium';
  if (level > 20) return 'battery-low';
  return 'battery-warning';
}

export function severityColor(severity: 'warning' | 'critical'): string {
  return severity === 'critical' ? '#E11900' : '#FF9500';
}

export function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    location_disabled: 'Location Disabled',
    location_enabled: 'Location Enabled',
    network_lost: 'Network Lost',
    network_restored: 'Network Restored',
    app_killed: 'App Killed',
    app_backgrounded: 'App Backgrounded',
    app_foregrounded: 'App Foregrounded',
    battery_critical: 'Battery Critical',
    gps_signal_lost: 'GPS Signal Lost',
    mock_location_detected: 'Mock Location',
    ping_gap: 'Ping Gap',
  };
  return labels[type] || type;
}

export function eventSeverity(type: string): 'warning' | 'critical' {
  const critical = ['location_disabled', 'app_killed', 'mock_location_detected'];
  return critical.includes(type) ? 'critical' : 'warning';
}
