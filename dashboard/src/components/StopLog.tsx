import { useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapPin } from 'lucide-react';
import type { Stop } from './StopDetector';
import { formatDuration, formatLocalTime } from '../lib/geo';
import { theme } from '../styles/theme';

interface StopLogProps {
  stops: Stop[];
  map: mapboxgl.Map | null;
}

function stopColor(durationMs: number): string {
  const min = durationMs / 60000;
  if (min < 2) return theme.colors.green;
  if (min < 5) return theme.colors.amber;
  return theme.colors.red;
}

export default function StopLog({ stops, map }: StopLogProps) {
  const [liveDurations, setLiveDurations] = useState<Record<number, number>>({});

  // Live timer for ongoing stops
  useEffect(() => {
    const ongoingStops = stops.filter(s => !s.departureTime);
    if (ongoingStops.length === 0) return;

    const interval = setInterval(() => {
      const durations: Record<number, number> = {};
      ongoingStops.forEach(s => {
        durations[s.number] = Date.now() - new Date(s.arrivalTime).getTime();
      });
      setLiveDurations(durations);
    }, 1000);

    return () => clearInterval(interval);
  }, [stops]);

  const totalIdleMs = stops.reduce((sum, s) => sum + (s.departureTime ? s.durationMs : (liveDurations[s.number] || s.durationMs)), 0);

  function panToStop(stop: Stop) {
    map?.easeTo({
      center: [stop.centerLng, stop.centerLat],
      zoom: 16,
      duration: 1000,
    });
  }

  return (
    <div>
      {/* Summary */}
      <div
        style={{
          background: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary }}>
          {stops.length} stop{stops.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
          Total idle: <strong style={{ color: theme.colors.amber }}>{formatDuration(totalIdleMs)}</strong>
        </span>
      </div>

      {/* Timeline */}
      {stops.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: theme.colors.textMuted, fontSize: 13 }}>
          No stops detected
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div
            style={{
              position: 'absolute',
              left: 17,
              top: 20,
              bottom: 20,
              width: 2,
              background: theme.colors.border,
            }}
          />

          {stops.map((stop) => {
            const color = stopColor(stop.durationMs);
            const isOngoing = !stop.departureTime;
            const duration = isOngoing ? (liveDurations[stop.number] || stop.durationMs) : stop.durationMs;

            return (
              <button
                key={stop.number}
                onClick={() => panToStop(stop)}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '12px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: theme.transitions.smooth,
                  position: 'relative',
                }}
              >
                {/* Numbered badge */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: theme.colors.bg,
                    border: `2px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                    zIndex: 1,
                    boxShadow: isOngoing ? `0 0 12px ${color}66` : 'none',
                    animation: isOngoing ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {stop.number}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                      {formatLocalTime(stop.arrivalTime)}
                      {' → '}
                      {isOngoing ? (
                        <span style={{ color: theme.colors.red, fontWeight: 600, animation: 'pulse-dot 2s ease-in-out infinite' }}>
                          Now
                        </span>
                      ) : (
                        formatLocalTime(stop.departureTime!)
                      )}
                    </span>
                  </div>

                  {/* Duration — large */}
                  <div
                    className="animate-number"
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color,
                      marginBottom: 4,
                    }}
                  >
                    {formatDuration(duration)}
                  </div>

                  {/* Coords */}
                  <div style={{ fontSize: 11, color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={10} />
                    {stop.centerLat.toFixed(4)}, {stop.centerLng.toFixed(4)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
