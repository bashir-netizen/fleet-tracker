import { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  db, pingsCol, eventsCol, tripsCol,
  query, where, orderBy, limit, getDocs, onSnapshot, snapToArray,
  type LocationPing, type Trip, type AgentEvent,
} from '../lib/firebase';
import { lerpCoords, bearing, totalDistance } from '../lib/geo';
import { getSpeedColor, theme } from '../styles/theme';
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

  // Find active trip
  useEffect(() => {
    if (!agentId) return;
    async function findActiveTrip() {
      const q = query(tripsCol, where('agent_id', '==', agentId), where('ended_at', '==', null), orderBy('started_at', 'desc'), limit(1));
      const snap = await getDocs(q);
      const trips = snapToArray<Trip>(snap);
      if (trips.length > 0) setActiveTrip(trips[0]);
    }
    findActiveTrip();
  }, [agentId]);

  // Load existing pings + subscribe to realtime
  useEffect(() => {
    if (!agentId || !activeTrip) return;

    // Load existing
    async function loadExisting() {
      const q = query(pingsCol, where('trip_id', '==', activeTrip!.id), orderBy('timestamp', 'asc'));
      const snap = await getDocs(q);
      const data = snapToArray<LocationPing>(snap);
      if (data.length > 0) {
        setPings(data);
        let state = createDetectorState();
        for (const p of data) { state = processPing(state, p).state; }
        detectorRef.current = state;
        const allStops = [...state.completedStops];
        if (state.currentStop) allStops.push(state.currentStop);
        onStopsChange?.(allStops);

        const last = data[data.length - 1];
        setCurrentPos({ lat: last.lat, lng: last.lng });
        setCurrentHeading(last.heading);
        setAgentStatus('normal');
      }
    }
    loadExisting();

    // Realtime listener for new pings
    const pingsQuery = query(pingsCol, where('trip_id', '==', activeTrip.id), orderBy('timestamp', 'desc'), limit(1));
    const unsubPings = onSnapshot(pingsQuery, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const ping = { ...change.doc.data(), id: change.doc.id } as LocationPing;
          handleNewPing(ping);
        }
      });
    });

    // Realtime listener for events
    const eventsQuery = query(eventsCol, where('agent_id', '==', agentId), orderBy('timestamp', 'desc'), limit(1));
    const unsubEvents = onSnapshot(eventsQuery, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const event = { ...change.doc.data(), id: change.doc.id } as AgentEvent;
          handleNewEvent(event);
        }
      });
    });

    return () => { unsubPings(); unsubEvents(); };
  }, [agentId, activeTrip?.id]);

  const handleNewPing = useCallback((ping: LocationPing) => {
    setPings(prev => {
      if (prev.find(p => p.id === ping.id)) return prev; // dedupe
      return [...prev, ping];
    });

    const result = processPing(detectorRef.current, ping);
    detectorRef.current = result.state;
    const allStops = [...result.state.completedStops];
    if (result.state.currentStop) allStops.push(result.state.currentStop);
    onStopsChange?.(allStops);

    prevPosRef.current = targetPosRef.current || { lat: ping.lat, lng: ping.lng };
    targetPosRef.current = { lat: ping.lat, lng: ping.lng };
    animStartRef.current = performance.now();
    if (ping.heading !== null) setCurrentHeading(ping.heading);
    setAgentStatus('normal');

    cancelAnimationFrame(animRef.current);
    function animate(now: number) {
      const t = Math.min((now - animStartRef.current) / 1000, 1);
      const prev = prevPosRef.current!, target = targetPosRef.current!;
      const [lat, lng] = lerpCoords(prev.lat, prev.lng, target.lat, target.lng, t);
      setCurrentPos({ lat, lng });
      if (t < 1) animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
  }, [onStopsChange]);

  const handleNewEvent = useCallback((event: AgentEvent) => {
    const critical = ['location_disabled', 'app_killed', 'mock_location_detected'];
    const warning = ['network_lost', 'app_backgrounded', 'battery_critical', 'gps_signal_lost'];
    const restore = ['network_restored', 'app_foregrounded', 'location_enabled'];
    if (critical.includes(event.event_type)) setAgentStatus('critical');
    else if (warning.includes(event.event_type)) setAgentStatus('warning');
    else if (restore.includes(event.event_type)) setAgentStatus('normal');
  }, []);

  // Update trail
  useEffect(() => {
    if (!map || pings.length < 2) return;
    const setupTrail = () => {
      try {
        if (map.getLayer('live-trail-glow')) map.removeLayer('live-trail-glow');
        if (map.getLayer('live-trail')) map.removeLayer('live-trail');
        if (map.getSource('live-trail')) map.removeSource('live-trail');
      } catch { /* ok */ }
      const features: GeoJSON.Feature[] = pings.slice(0, -1).map((p1, i) => ({
        type: 'Feature', properties: { color: getSpeedColor(p1.speed ?? 0) },
        geometry: { type: 'LineString', coordinates: [[p1.lng, p1.lat], [pings[i + 1].lng, pings[i + 1].lat]] },
      }));
      map.addSource('live-trail', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({ id: 'live-trail-glow', type: 'line', source: 'live-trail', paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.3, 'line-blur': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'live-trail', type: 'line', source: 'live-trail', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    };
    if (map.isStyleLoaded()) setupTrail(); else map.on('style.load', setupTrail);
    return () => { try { if (map.getLayer('live-trail-glow')) map.removeLayer('live-trail-glow'); if (map.getLayer('live-trail')) map.removeLayer('live-trail'); if (map.getSource('live-trail')) map.removeSource('live-trail'); } catch {} };
  }, [map, pings]);

  // Auto-follow
  useEffect(() => {
    if (currentPos && map) map.easeTo({ center: [currentPos.lng, currentPos.lat], duration: 1000 });
  }, [currentPos?.lat, currentPos?.lng]);

  // Compute stats
  useEffect(() => {
    if (pings.length === 0) return;
    const last = pings[pings.length - 1], first = pings[0];
    const dist = totalDistance(pings);
    const dur = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
    const detector = detectorRef.current;
    const isStopped = detector.mode === 'STOPPED';
    const stoppedDuration = isStopped && detector.currentStop ? Date.now() - new Date(detector.currentStop.arrivalTime).getTime() : 0;
    onStatsChange?.({ speed: last.speed ?? 0, battery: last.battery_level, accuracy: last.accuracy, distance: dist, duration: dur, pingCount: pings.length, lastPingTime: last.timestamp, isStopped, stoppedDuration });
  }, [pings, onStatsChange]);

  return (
    <AgentDot map={map} lat={currentPos?.lat ?? 0} lng={currentPos?.lng ?? 0}
      heading={currentHeading} status={agentStatus} visible={!!currentPos} />
  );
}
