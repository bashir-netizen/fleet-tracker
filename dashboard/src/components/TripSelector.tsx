import { useState, useEffect } from 'react';
import { Clock, MapPin, Radio } from 'lucide-react';
import { tripsCol, query, orderBy, limit, getDocs, snapToArray, type Trip } from '../lib/firebase';
import { formatDuration, formatLocalDate, formatLocalTime } from '../lib/geo';
import { theme } from '../styles/theme';

interface TripSelectorProps {
  onSelectTrip: (trip: Trip) => void;
  selectedTripId?: string;
}

export default function TripSelector({ onSelectTrip, selectedTripId }: TripSelectorProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    setLoading(true);
    try {
      const q = query(tripsCol, orderBy('started_at', 'desc'), limit(20));
      const snap = await getDocs(q);
      setTrips(snapToArray<Trip>(snap));
    } catch (err) {
      console.error('Failed to load trips:', err);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: theme.radius.md }} />
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: theme.colors.textMuted, fontSize: 14 }}>
        No trips recorded yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {trips.map(trip => {
        const isActive = !trip.ended_at;
        const isSelected = trip.id === selectedTripId;
        const duration = trip.ended_at
          ? new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()
          : Date.now() - new Date(trip.started_at).getTime();

        return (
          <button
            key={trip.id}
            onClick={() => onSelectTrip(trip)}
            style={{
              background: isSelected ? theme.colors.card : theme.colors.bg,
              border: isSelected ? `1px solid ${theme.colors.accent}` : `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: theme.transitions.smooth,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {isActive && (
              <div style={{
                position: 'absolute', top: 12, right: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: theme.radius.full,
                background: 'rgba(5, 163, 87, 0.15)',
                color: theme.colors.green, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              }}>
                <Radio size={10} style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                Live
              </div>
            )}

            <div style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={14} color={theme.colors.accent} />
              {trip.route_name || 'Unnamed Trip'}
            </div>

            <div style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 }}>
              {formatLocalDate(trip.started_at)} &middot; {formatLocalTime(trip.started_at)}
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: theme.colors.textMuted }}>
                <Clock size={12} />
                {formatDuration(duration)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
