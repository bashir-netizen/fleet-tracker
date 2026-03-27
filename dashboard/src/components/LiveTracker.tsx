import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { supabase, type LocationPing, type Trip, type AgentEvent } from '../lib/supabase';
import { lerpCoords, bearing, totalDistance, formatDuration, formatSpeed, formatDistance, formatTimeAgo } from '../lib/geo';
import { getSpeedColor, theme } from '../styles/theme';
import { batteryColor } from '../lib/formatters';
import AgentDot from './AgentDot';
import { processPing, createDetectorState, type StopDetectorState, type Stop } from './StopDetector';

interface LiveTrackerProps {
  map: maplibregl.Map | null;
  agentId: string | null;
  onStopsChange?: (stops: Stop[]) => void;
  onStatsChange?: (stats: LiveStats) => void;
}

export interface LiveStats {
  speed: number;
  battery: number | null;
  accuracy: number | null;
  distance: number;
  duration: number;
  pingCount: number;
  lastPingTime: string | null;
  isStopped: boolean;
  stoppedDuration: number;
}

export default function LiveTracker({ map, agentId, onStopsChange, onStatsChange }: LiveTrackerProps) {
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [agentStatus, setAgentStatus] = useState<'normal' | 'warning' | 'critical' | 'offline'>('offline');
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  const detectorRef = useRef<StopDetectorState>(createDetectorState());
  const animRef = useRef<number>(0);
  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const targetPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animStartRef = useRef<number>(0);

  // Find active trip for agent
  useEffect(() => {
    if (!agentId) return;

    async function findActiveTrip() {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('agent_id', agentId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setActiveTrip(data[0]);
      }
    }

    findActiveTrip();
  }, [agentId]);

  // Load existing pings + subscribe to realtime
  useEffect(() => {
    if (!agentId || !activeTrip) return;

    // Snapshot: load existing pings
    async function loadExisting() {
      const { data } = await supabase
        .from('location_pings')
        .select('*')
        .eq('trip_id', activeTrip!.id)
        .order('timestamp', { ascending: true });

      if (data && data.length > 0) {
        setPings(data);

        // Run all through detector
        let state = createDetectorState();
        for (const p of data) {
          const result = processPing(state, p);
          state = result.state;
        }
        detectorRef.current = state;

        const allStops = [...state.completedStops];
        if (state.currentStop) allStops.push(state.currentStop);
        onStopsChange?.(allStops);

        // Set initial position
        const last = data[data.length - 1];
        setCurrentPos({ lat: last.lat, lng: last.lng });
        setCurrentHeading(last.heading);
        setAgentStatus('normal');
      }
    }

    loadExisting();

    // Realtime subscription
    const channel = supabase
      .channel(`pings-${activeTrip.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_pings',
          filter: `trip_id=eq.${activeTrip.id}`,
        },
        (payload) => {
          const newPing = payload.new as LocationPing;
          handleNewPing(newPing);
        }
      )
      .subscribe();

    // Events subscription
    const eventsChannel = supabase
      .channel(`events-${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_events',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          const event = payload.new as AgentEvent;
          handleNewEvent(event);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(eventsChannel);
    };
  }, [agentId, activeTrip?.id]);

  // Handle new ping — smooth interpolation
  const handleNewPing = useCallback((ping: LocationPing) => {
    setPings(prev => [...prev, ping]);

    // Update detector
    const result = processPing(detectorRef.current, ping);
    detectorRef.current = result.state;

    const allStops = [...result.state.completedStops];
    if (result.state.currentStop) allStops.push(result.state.currentStop);
    onStopsChange?.(allStops);

    // Smooth interpolation target
    prevPosRef.current = targetPosRef.current || { lat: ping.lat, lng: ping.lng };
    targetPosRef.current = { lat: ping.lat, lng: ping.lng };
    animStartRef.current = performance.now();

    if (ping.heading !== null) setCurrentHeading(ping.heading);
    setAgentStatus('normal');

    // Start interpolation
    cancelAnimationFrame(animRef.current);
    function animate(now: number) {
      const elapsed = now - animStartRef.current;
      const t = Math.min(elapsed / 1000, 1); // 1 second interpolation
      const prev = prevPosRef.current!;
      const target = targetPosRef.current!;
      const [lat, lng] = lerpCoords(prev.lat, prev.lng, target.lat, target.lng, t);
      setCurrentPos({ lat, lng });

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    }
    animRef.current = requestAnimationFrame(animate);
  }, [onStopsChange]);

  const handleNewEvent = useCallback((event: AgentEvent) => {
    const critical = ['location_disabled', 'app_killed', 'mock_location_detected'];
    const warning = ['network_lost', 'app_backgrounded', 'battery_critical', 'gps_signal_lost'];

    if (critical.includes(event.event_type)) {
      setAgentStatus('critical');
    } else if (warning.includes(event.event_type)) {
      setAgentStatus('warning');
    } else if (event.event_type === 'network_restored' || event.event_type === 'app_foregrounded' || event.event_type === 'location_enabled') {
      setAgentStatus('normal');
    }
  }, []);

  // Update trail on map
  useEffect(() => {
    if (!map || pings.length < 2) return;

    const setupTrail = () => {
      try {
        if (map.getLayer('live-trail-glow')) map.removeLayer('live-trail-glow');
        if (map.getLayer('live-trail')) map.removeLayer('live-trail');
        if (map.getSource('live-trail')) map.removeSource('live-trail');
      } catch { /* ok */ }

      const features: GeoJSON.Feature[] = [];
      for (let i = 0; i < pings.length - 1; i++) {
        const p1 = pings[i];
        const p2 = pings[i + 1];
        features.push({
          type: 'Feature',
          properties: { color: getSpeedColor(p1.speed ?? 0) },
          geometry: {
            type: 'LineString',
            coordinates: [[p1.lng, p1.lat], [p2.lng, p2.lat]],
          },
        });
      }

      map.addSource('live-trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'live-trail-glow',
        type: 'line',
        source: 'live-trail',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 10,
          'line-opacity': 0.3,
          'line-blur': 8,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'live-trail',
        type: 'line',
        source: 'live-trail',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    };

    if (map.isStyleLoaded()) {
      setupTrail();
    } else {
      map.on('style.load', setupTrail);
    }

    return () => {
      try {
        if (map.getLayer('live-trail-glow')) map.removeLayer('live-trail-glow');
        if (map.getLayer('live-trail')) map.removeLayer('live-trail');
        if (map.getSource('live-trail')) map.removeSource('live-trail');
      } catch { /* ok */ }
    };
  }, [map, pings]);

  // Auto-follow
  useEffect(() => {
    if (currentPos && map) {
      map.easeTo({
        center: [currentPos.lng, currentPos.lat],
        duration: 1000,
      });
    }
  }, [currentPos?.lat, currentPos?.lng]);

  // Compute stats
  useEffect(() => {
    if (pings.length === 0) return;

    const last = pings[pings.length - 1];
    const first = pings[0];
    const dist = totalDistance(pings);
    const dur = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();

    const detector = detectorRef.current;
    const isStopped = detector.mode === 'STOPPED';
    const stoppedDuration = isStopped && detector.currentStop
      ? Date.now() - new Date(detector.currentStop.arrivalTime).getTime()
      : 0;

    onStatsChange?.({
      speed: last.speed ?? 0,
      battery: last.battery_level,
      accuracy: last.accuracy,
      distance: dist,
      duration: dur,
      pingCount: pings.length,
      lastPingTime: last.timestamp,
      isStopped,
      stoppedDuration,
    });
  }, [pings, onStatsChange]);

  return (
    <AgentDot
      map={map}
      lat={currentPos?.lat ?? 0}
      lng={currentPos?.lng ?? 0}
      heading={currentHeading}
      status={agentStatus}
      visible={!!currentPos}
    />
  );
}
