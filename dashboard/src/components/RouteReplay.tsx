import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { supabase, type LocationPing, type Trip } from '../lib/supabase';
import { lerpCoords, bearing, totalDistance, formatDuration, formatSpeed, formatDistance } from '../lib/geo';
import { getSpeedColor, theme } from '../styles/theme';

interface RouteReplayProps {
  map: maplibregl.Map | null;
  trip: Trip | null;
  onPingsLoaded?: (pings: LocationPing[]) => void;
  onCurrentIndex?: (index: number) => void;
}

const SPEED_OPTIONS = [5, 10, 25, 50];

export default function RouteReplay({ map, trip, onPingsLoaded, onCurrentIndex }: RouteReplayProps) {
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [currentIndex, setCurrentIndex] = useState(0);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const indexRef = useRef(0);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Load pings when trip changes
  useEffect(() => {
    if (!trip) return;
    loadPings(trip.id);
    return () => {
      cleanup();
    };
  }, [trip?.id]);

  // Notify parent of current index
  useEffect(() => {
    onCurrentIndex?.(currentIndex);
  }, [currentIndex, onCurrentIndex]);

  async function loadPings(tripId: string) {
    setLoading(true);
    setPlaying(false);
    setCurrentIndex(0);
    indexRef.current = 0;

    const { data, error } = await supabase
      .from('location_pings')
      .select('*')
      .eq('trip_id', tripId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Failed to load pings:', error.message);
      setLoading(false);
      return;
    }

    const loadedPings = data || [];
    setPings(loadedPings);
    onPingsLoaded?.(loadedPings);
    setLoading(false);

    // Fit map to route
    if (map && loadedPings.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      loadedPings.forEach(p => bounds.extend([p.lng, p.lat]));
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    }
  }

  function cleanup() {
    cancelAnimationFrame(animRef.current);
    markerRef.current?.remove();
    markerRef.current = null;
    removeMapLayers();
  }

  function removeMapLayers() {
    if (!map) return;
    try {
      if (map.getLayer('replay-trail-glow')) map.removeLayer('replay-trail-glow');
      if (map.getLayer('replay-trail')) map.removeLayer('replay-trail');
      if (map.getSource('replay-trail')) map.removeSource('replay-trail');
    } catch { /* layers may not exist */ }
  }

  // Setup trail source/layers
  useEffect(() => {
    if (!map || pings.length === 0) return;

    map.on('style.load', () => setupTrailLayers());
    setupTrailLayers();

    return () => removeMapLayers();
  }, [map, pings]);

  function setupTrailLayers() {
    if (!map) return;
    removeMapLayers();

    map.addSource('replay-trail', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Glow layer (wider, semi-transparent)
    map.addLayer({
      id: 'replay-trail-glow',
      type: 'line',
      source: 'replay-trail',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 10,
        'line-opacity': 0.3,
        'line-blur': 8,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Main trail
    map.addLayer({
      id: 'replay-trail',
      type: 'line',
      source: 'replay-trail',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4,
        'line-opacity': 0.9,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
  }

  // Update trail up to current index
  const updateTrail = useCallback((upToIndex: number) => {
    if (!map || pings.length < 2) return;

    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < upToIndex && i < pings.length - 1; i++) {
      const p1 = pings[i];
      const p2 = pings[i + 1];
      const speedKmh = p1.speed ?? 0;

      features.push({
        type: 'Feature',
        properties: { color: getSpeedColor(speedKmh) },
        geometry: {
          type: 'LineString',
          coordinates: [[p1.lng, p1.lat], [p2.lng, p2.lat]],
        },
      });
    }

    const source = map.getSource('replay-trail') as maplibregl.GeoJSONSource;
    source?.setData({ type: 'FeatureCollection', features });
  }, [map, pings]);

  // Create/update replay marker
  const updateMarker = useCallback((lat: number, lng: number, headingDeg: number | null) => {
    if (!map) return;

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%;
        background: #9B59B6; border: 3px solid #FFFFFF;
        box-shadow: 0 0 12px rgba(155, 89, 182, 0.6);
        transition: transform 0.1s linear;
      `;
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, [map]);

  // Animation loop
  useEffect(() => {
    if (!playing || pings.length < 2) return;

    lastFrameRef.current = performance.now();

    function frame(now: number) {
      const dt = (now - lastFrameRef.current) / 1000; // seconds
      lastFrameRef.current = now;

      // Advance time: each ping is ~10s apart, speed multiplier scales this
      const pingsToAdvance = dt * speed / 10;
      indexRef.current = Math.min(indexRef.current + pingsToAdvance, pings.length - 1);

      const idx = Math.floor(indexRef.current);
      const frac = indexRef.current - idx;

      // Interpolate position
      if (idx < pings.length - 1) {
        const [lat, lng] = lerpCoords(
          pings[idx].lat, pings[idx].lng,
          pings[idx + 1].lat, pings[idx + 1].lng,
          frac
        );
        const head = bearing(pings[idx].lat, pings[idx].lng, pings[idx + 1].lat, pings[idx + 1].lng);
        updateMarker(lat, lng, head);
      } else {
        updateMarker(pings[idx].lat, pings[idx].lng, null);
      }

      updateTrail(idx + 1);
      setCurrentIndex(idx);

      if (indexRef.current >= pings.length - 1) {
        setPlaying(false);
        return;
      }

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, pings, updateMarker, updateTrail]);

  // Slider seek
  function handleSeek(value: number) {
    indexRef.current = value;
    setCurrentIndex(value);
    if (pings[value]) {
      updateMarker(pings[value].lat, pings[value].lng, null);
      updateTrail(value + 1);
    }
  }

  function togglePlay() {
    if (currentIndex >= pings.length - 1) {
      // Reset to start
      indexRef.current = 0;
      setCurrentIndex(0);
    }
    setPlaying(!playing);
  }

  if (!trip) return null;
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
        <div className="skeleton" style={{ flex: 1, height: 6 }} />
      </div>
    );
  }

  const currentPing = pings[currentIndex];
  const tripDuration = pings.length > 0
    ? new Date(pings[pings.length - 1].timestamp).getTime() - new Date(pings[0].timestamp).getTime()
    : 0;
  const currentTime = currentPing
    ? new Date(currentPing.timestamp).getTime() - new Date(pings[0].timestamp).getTime()
    : 0;
  const dist = totalDistance(pings.slice(0, currentIndex + 1));

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: theme.colors.accent,
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: theme.shadows.glow(theme.colors.accentGlow),
            transition: theme.transitions.smooth,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* Slider + times */}
        <div style={{ flex: 1 }}>
          <input
            type="range"
            className="replay-slider"
            min={0}
            max={Math.max(pings.length - 1, 0)}
            value={currentIndex}
            onChange={e => handleSeek(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              marginTop: 4,
            }}
          >
            <span style={{ color: theme.colors.textMuted }}>
              {pings.length > 0 ? formatDuration(0) : '--'}
            </span>
            <span style={{ color: theme.colors.textPrimary, fontWeight: 600, fontSize: 14 }}>
              {formatDuration(currentTime)}
            </span>
            <span style={{ color: theme.colors.textMuted }}>
              {formatDuration(tripDuration)}
            </span>
          </div>
        </div>

        {/* Speed pills */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {SPEED_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: '6px 10px',
                borderRadius: theme.radius.full,
                border: 'none',
                background: speed === s ? theme.colors.accent : theme.colors.card,
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: theme.transitions.smooth,
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Trip summary stats */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 16,
          padding: '12px 0',
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        <MiniStat label="Speed" value={currentPing ? formatSpeed(currentPing.speed ?? 0) : '--'} />
        <MiniStat label="Distance" value={formatDistance(dist)} />
        <MiniStat label="Pings" value={`${currentIndex + 1}/${pings.length}`} />
        <MiniStat label="Battery" value={currentPing ? `${Math.round(currentPing.battery_level ?? 0)}%` : '--'} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: theme.colors.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div className="animate-number" style={{ fontSize: 15, fontWeight: 600, color: theme.colors.textPrimary }}>
        {value}
      </div>
    </div>
  );
}
