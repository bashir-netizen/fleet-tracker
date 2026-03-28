import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { type MapStyleKey } from './components/Map';
import TopBar from './components/TopBar';
import SidePanel from './components/SidePanel';
import LayerSwitcher from './components/LayerSwitcher';
import StopMarkers from './components/StopMarkers';
import StopLog from './components/StopLog';
import LiveTracker, { type LiveStats } from './components/LiveTracker';
import AlertBanner from './components/AlertBanner';
import AlertPanel from './components/AlertPanel';
import TamperTimeline from './components/TamperTimeline';
import { detectStops, type Stop, LONG_STOP_THRESHOLD_MS } from './components/StopDetector';
import AgentDot from './components/AgentDot';
import {
  db, agentsCol, alertsCol, eventsCol, pingsCol, doc, updateDoc,
  query, where, orderBy, limit, getDocs, onSnapshot, snapToArray,
  type Trip, type LocationPing, type Alert, type AgentEvent,
} from './lib/firebase';
import { formatDuration, formatSpeed, formatDistance, formatTimeAgo, totalDistance } from './lib/geo';
import { getSpeedColor, theme } from './styles/theme';
import { batteryColor } from './lib/formatters';
import { Crosshair, Bell, Battery, Gauge, Route, Clock } from 'lucide-react';
import './index.css';

const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function dayRange(dateStr: string): { start: string; end: string } {
  const start = dateStr + 'T00:00:00.000Z';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  const end = d.toISOString().split('T')[0] + 'T00:00:00.000Z';
  return { start, end };
}

export default function App() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [agentId, setAgentId] = useState<string | null>(null);
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const isToday = selectedDate === todayStr();

  // Load agent on mount
  useEffect(() => {
    async function init() {
      const snap = await getDocs(query(agentsCol, limit(1)));
      const agents = snapToArray<{ id: string }>(snap);
      if (agents.length > 0) setAgentId(agents[0].id);
    }
    init();
  }, []);

  // Load data for selected date
  useEffect(() => {
    if (!agentId) return;
    const { start, end } = dayRange(selectedDate);

    async function loadDay() {
      // Load pings
      const pingsQ = query(pingsCol, where('agent_id', '==', agentId), where('timestamp', '>=', start), where('timestamp', '<', end), orderBy('timestamp', 'asc'));
      const pingsSnap = await getDocs(pingsQ);
      const dayPings = snapToArray<LocationPing>(pingsSnap);
      setPings(dayPings);

      // Load alerts
      const alertsQ = query(alertsCol, where('agent_id', '==', agentId), where('timestamp', '>=', start), where('timestamp', '<', end), orderBy('timestamp', 'desc'));
      const alertsSnap = await getDocs(alertsQ);
      setAlerts(snapToArray<Alert>(alertsSnap));

      // Load events
      const eventsQ = query(eventsCol, where('agent_id', '==', agentId), where('timestamp', '>=', start), where('timestamp', '<', end), orderBy('timestamp', 'desc'));
      const eventsSnap = await getDocs(eventsQ);
      setEvents(snapToArray<AgentEvent>(eventsSnap));

      // Fit map to pings
      if (mapRef.current && dayPings.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        dayPings.forEach(p => bounds.extend([p.lng, p.lat]));
        mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
      }
    }
    loadDay();

    // Realtime for today
    if (isToday) {
      const pingsQ = query(pingsCol, where('agent_id', '==', agentId), orderBy('timestamp', 'desc'), limit(1));
      const unsub = onSnapshot(pingsQ, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const ping = { ...change.doc.data(), id: change.doc.id } as LocationPing;
            setPings(prev => {
              if (prev.find(p => p.id === ping.id)) return prev;
              return [...prev, ping];
            });
          }
        });
      });
      return () => unsub();
    }
  }, [agentId, selectedDate]);

  // Draw trail on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pings.length < 2) return;

    const drawTrail = () => {
      try {
        if (map.getLayer('day-trail-glow')) map.removeLayer('day-trail-glow');
        if (map.getLayer('day-trail')) map.removeLayer('day-trail');
        if (map.getSource('day-trail')) map.removeSource('day-trail');
      } catch { /* ok */ }

      const features: GeoJSON.Feature[] = pings.slice(0, -1).map((p1, i) => ({
        type: 'Feature',
        properties: { color: getSpeedColor(p1.speed ?? 0) },
        geometry: { type: 'LineString', coordinates: [[p1.lng, p1.lat], [pings[i + 1].lng, pings[i + 1].lat]] },
      }));

      map.addSource('day-trail', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'day-trail-glow', type: 'line', source: 'day-trail',
        paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.3, 'line-blur': 8 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'day-trail', type: 'line', source: 'day-trail',
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    };

    if (map.isStyleLoaded()) drawTrail();
    else map.on('style.load', drawTrail);

    return () => {
      try {
        if (map.getLayer('day-trail-glow')) map.removeLayer('day-trail-glow');
        if (map.getLayer('day-trail')) map.removeLayer('day-trail');
        if (map.getSource('day-trail')) map.removeSource('day-trail');
      } catch { /* ok */ }
    };
  }, [pings]);

  // Compute stops (only >3 min for display)
  const allStops = useMemo(() => detectStops(pings), [pings]);
  const longStops = useMemo(() => allStops.filter(s => s.durationMs >= LONG_STOP_THRESHOLD_MS), [allStops]);

  // Shift integrity
  const shiftIntegrity = useMemo(() => {
    if (pings.length < 2) return null;
    const shiftStart = new Date(pings[0].timestamp).getTime();
    const shiftEnd = new Date(pings[pings.length - 1].timestamp).getTime();
    const totalMs = shiftEnd - shiftStart;
    if (totalMs <= 0) return null;
    const expectedHeartbeats = Math.floor(totalMs / 30000);
    const heartbeats = events.filter(e => e.event_type === 'heartbeat').length;
    const score = expectedHeartbeats > 0 ? Math.min(100, Math.round((heartbeats / expectedHeartbeats) * 100)) : 100;
    return { score, totalMs, distance: totalDistance(pings), pingCount: pings.length, stopCount: longStops.length };
  }, [pings, events, longStops]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => { mapRef.current = map; }, []);
  const handleRecenter = useCallback(() => {
    if (pings.length > 0 && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds();
      pings.forEach(p => bounds.extend([p.lng, p.lat]));
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
    } else {
      mapRef.current?.easeTo({ center: DEFAULT_CENTER, zoom: 13, duration: 1000 });
    }
  }, [pings]);
  const handleDismissAlert = useCallback((alertId: string) => {
    updateDoc(doc(alertsCol, alertId), { acknowledged: true }).catch(console.error);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  const unackedAlertCount = alerts.filter(a => !a.acknowledged).length;
  const lastPing = pings.length > 0 ? pings[pings.length - 1] : null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Map style={mapStyle} onMapReady={handleMapReady} />

      <TopBar selectedDate={selectedDate} onDateChange={setSelectedDate} isToday={isToday} />

      <AlertBanner alerts={alerts} onDismiss={handleDismissAlert} />

      {/* Alert bell */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50 }}>
        <button onClick={() => setAlertPanelOpen(!alertPanelOpen)} style={{
          position: 'relative', width: 44, height: 44, borderRadius: theme.radius.sm,
          background: theme.glass.background, backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border, color: theme.colors.textPrimary,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: theme.shadows.card,
        }}>
          <Bell size={20} />
          {unackedAlertCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%',
              background: theme.colors.red, color: '#fff', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}>{unackedAlertCount}</span>
          )}
        </button>
      </div>

      <AlertPanel alerts={alerts} visible={alertPanelOpen} onClose={() => setAlertPanelOpen(false)} onAcknowledge={handleDismissAlert} />

      {/* Layer switcher */}
      <div style={{ position: 'absolute', top: 16, right: 412, zIndex: 50 }}>
        <LayerSwitcher currentStyle={mapStyle} onStyleChange={setMapStyle} />
      </div>

      {/* Re-center */}
      <div style={{ position: 'absolute', bottom: 32, right: 412, zIndex: 50 }}>
        <button onClick={handleRecenter} style={{
          width: 44, height: 44, borderRadius: theme.radius.sm,
          background: theme.glass.background, backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border, color: theme.colors.textPrimary,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: theme.shadows.card,
        }}>
          <Crosshair size={20} />
        </button>
      </div>

      {/* Stop markers (>3 min only) */}
      <StopMarkers map={mapRef.current} stops={longStops} />

      {/* Side panel */}
      <SidePanel title="Shift Overview">
        {/* Agent card */}
        <div style={{ background: theme.colors.card, borderRadius: theme.radius.md, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: theme.colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>M</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Agent Moussa</div>
              <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>+253 77 00 00 01</div>
            </div>
            {isToday && (
              <div style={{
                marginLeft: 'auto', padding: '4px 10px', borderRadius: theme.radius.full,
                background: 'rgba(5, 163, 87, 0.15)', color: theme.colors.green, fontSize: 12, fontWeight: 600,
              }}>Live</div>
            )}
          </div>

          {/* Day summary stats */}
          {shiftIntegrity ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <StatBox label="Distance" value={formatDistance(shiftIntegrity.distance)} icon={<Route size={12} />} />
              <StatBox label="Duration" value={formatDuration(shiftIntegrity.totalMs)} icon={<Clock size={12} />} />
              <StatBox label="Stops" value={String(shiftIntegrity.stopCount)} icon={<Gauge size={12} />} />
              <StatBox
                label="Integrity"
                value={`${shiftIntegrity.score}%`}
                valueColor={shiftIntegrity.score >= 90 ? theme.colors.green : shiftIntegrity.score >= 70 ? theme.colors.amber : theme.colors.red}
                icon={<Battery size={12} />}
              />
            </div>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
              No shift data for this day
            </div>
          )}
        </div>

        {/* Tamper timeline */}
        {pings.length > 0 && events.length > 0 && (
          <TamperTimeline
            events={events}
            tripStartTime={pings[0].timestamp}
            tripEndTime={pings[pings.length - 1].timestamp}
          />
        )}

        {/* Stop log (>3 min) */}
        <div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: theme.colors.textSecondary,
            marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Stops ({'>'}3 min)
          </div>
          <StopLog stops={longStops} map={mapRef.current} />
        </div>
      </SidePanel>
    </div>
  );
}

function StatBox({ label, value, icon, valueColor }: {
  label: string; value: string; icon?: React.ReactNode; valueColor?: string;
}) {
  return (
    <div style={{ background: theme.colors.bg, borderRadius: theme.radius.sm, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: valueColor || theme.colors.textPrimary }}>{value}</div>
    </div>
  );
}
