import type { AgentEvent } from '../lib/firebase';
import { theme } from '../styles/theme';
import { eventSeverity } from '../lib/formatters';

interface TamperTimelineProps {
  events: AgentEvent[];
  tripStartTime: string;
  tripEndTime: string | null; // null = ongoing
}

export default function TamperTimeline({ events, tripStartTime, tripEndTime }: TamperTimelineProps) {
  const start = new Date(tripStartTime).getTime();
  const end = tripEndTime ? new Date(tripEndTime).getTime() : Date.now();
  const totalMs = end - start;

  if (totalMs <= 0) return null;

  // Build segments from events
  const segments: { startPct: number; endPct: number; color: string }[] = [];
  let lastEventEnd = start;

  // Sort events by timestamp
  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Pair events: lost/disabled → restored/enabled
  const pairMap: Record<string, string> = {
    network_lost: 'network_restored',
    location_disabled: 'location_enabled',
    app_backgrounded: 'app_foregrounded',
    gps_signal_lost: 'gps_signal_lost', // self-resolving
    app_killed: 'app_foregrounded',
  };

  const openEvents: Map<string, AgentEvent> = new Map();

  for (const event of sorted) {
    // Check if this resolves an open event
    for (const [key, openEvent] of openEvents) {
      if (pairMap[openEvent.event_type] === event.event_type) {
        const eStart = new Date(openEvent.timestamp).getTime();
        const eEnd = new Date(event.timestamp).getTime();
        const severity = eventSeverity(openEvent.event_type);
        segments.push({
          startPct: ((eStart - start) / totalMs) * 100,
          endPct: ((eEnd - start) / totalMs) * 100,
          color: severity === 'critical' ? theme.colors.red : theme.colors.amber,
        });
        openEvents.delete(key);
        break;
      }
    }

    // Open new event if it's a "start" type
    if (pairMap[event.event_type]) {
      openEvents.set(event.id, event);
    }
  }

  // Still-open events extend to now
  for (const [, openEvent] of openEvents) {
    const eStart = new Date(openEvent.timestamp).getTime();
    const severity = eventSeverity(openEvent.event_type);
    segments.push({
      startPct: ((eStart - start) / totalMs) * 100,
      endPct: 100,
      color: severity === 'critical' ? theme.colors.red : theme.colors.amber,
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, color: theme.colors.textMuted,
        textTransform: 'uppercase', marginBottom: 8,
        letterSpacing: '0.5px',
      }}>
        Trip Integrity
      </div>

      {/* Timeline bar */}
      <div style={{
        position: 'relative',
        height: 8,
        borderRadius: 4,
        background: theme.colors.green + '33',
        overflow: 'hidden',
      }}>
        {/* Green base = normal */}
        <div style={{
          position: 'absolute', inset: 0,
          background: theme.colors.green,
          opacity: 0.4,
          borderRadius: 4,
        }} />

        {/* Colored segments for issues */}
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${seg.startPct}%`,
              width: `${Math.max(seg.endPct - seg.startPct, 0.5)}%`,
              top: 0, bottom: 0,
              background: seg.color,
              opacity: 0.9,
              borderRadius: seg.startPct === 0 ? '4px 0 0 4px' : seg.endPct >= 99.5 ? '0 4px 4px 0' : '0',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: theme.colors.textMuted }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: theme.colors.green, opacity: 0.6 }} />
          Normal
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: theme.colors.amber }} />
          Warning
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: theme.colors.red }} />
          Critical
        </div>
      </div>
    </div>
  );
}
