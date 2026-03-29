import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { type MapStyleKey } from './components/Map';
import TopBar from './components/TopBar';
import SidePanel from './components/SidePanel';
import LayerSwitcher from './components/LayerSwitcher';
import StopMarkers from './components/StopMarkers';
import StopLog from './components/StopLog';
import ShiftCard from './components/ShiftCard';
import AlertBanner from './components/AlertBanner';
import AlertPanel from './components/AlertPanel';
import TamperTimeline from './components/TamperTimeline';
import { detectStops, type Stop, LONG_STOP_THRESHOLD_MS } from './components/StopDetector';
import {
  agentsCol, alertsCol, eventsCol, pingsCol, tripsCol, doc, updateDoc,
  query, where, orderBy, limit, getDocs, onSnapshot, snapToArray,
  type Trip, type LocationPing, type Alert, type AgentEvent,
} from './lib/firebase';
import { formatDuration, formatDistance, totalDistance, cleanTrailPings } from './lib/geo';
import { getSpeedColor, theme } from './styles/theme';
import { Crosshair, Bell, Battery, Gauge, Route, Clock } from 'lucide-react';
import './index.css';

const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];

function todayStr(): string { return new Date().toISOString().split('T')[0]; }

function dayRange(dateStr: string): { start: string; end: string } {
  const start = dateStr + 'T00:00:00.000Z';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return { start, end: d.toISOString().split('T')[0] + 'T00:00:00.000Z' };
}

interface ShiftData {
  shift: Trip;
  pings: LocationPing[];
  stops: Stop[];
  longStops: Stop[];
}

export default function App() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [agentId, setAgentId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [selectedShiftIdx, setSelectedShiftIdx] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const isToday = selectedDate === todayStr();

  // Load agent
  useEffect(() => {
    async function init() {
      const snap = await getDocs(query(agentsCol, limit(1)));
      const agents = snapToArray<{ id: string }>(snap);
      if (agents.length > 0) setAgentId(agents[0].id);
    }
    init();
  }, []);

  // Load shifts + pings for selected date
  useEffect(() => {
    if (!agentId) return;
    const { start, end } = dayRange(selectedDate);

    async function loadDay() {
      // 1. Get all shifts for this day
      const shiftsQ = query(tripsCol, where('agent_id', '==', agentId), where('started_at', '>=', start), where('started_at', '<', end), orderBy('started_at', 'asc'));
      const shiftsSnap = await getDocs(shiftsQ);
      const dayShifts = snapToArray<Trip>(shiftsSnap);

      // 2. Load pings for each shift
      const shiftDataArr: ShiftData[] = [];
      let globalStopNum = 1;

      for (const shift of dayShifts) {
        const pingsQ = query(pingsCol, where('trip_id', '==', shift.id), orderBy('timestamp', 'asc'));
        const pingsSnap = await getDocs(pingsQ);
        const shiftPings = snapToArray<LocationPing>(pingsSnap);

        // Detect stops for this shift independently
        const stops = detectStops(shiftPings);

        // Close open final stop if shift is ended
        if (shift.ended_at && stops.length > 0) {
          const lastStop = stops[stops.length - 1];
          if (!lastStop.departureTime && shiftPings.length > 0) {
            lastStop.departureTime = shiftPings[shiftPings.length - 1].timestamp;
            lastStop.durationMs = new Date(lastStop.departureTime).getTime() - new Date(lastStop.arrivalTime).getTime();
          }
        }

        // Renumber stops globally across shifts
        stops.forEach(s => { s.number = globalStopNum++; });

        const longStops = stops.filter(s => s.durationMs >= LONG_STOP_THRESHOLD_MS);
        shiftDataArr.push({ shift, pings: shiftPings, stops, longStops });
      }

      setShifts(shiftDataArr);
      setSelectedShiftIdx(shiftDataArr.length > 0 ? shiftDataArr.length - 1 : 0); // Select latest shift

      // 3. Load alerts + events for the day
      const alertsQ = query(alertsCol, where('agent_id', '==', agentId), where('timestamp', '>=', start), where('timestamp', '<', end), orderBy('timestamp', 'desc'));
      setAlerts(snapToArray<Alert>(await getDocs(alertsQ)));

      const eventsQ = query(eventsCol, where('agent_id', '==', agentId), where('timestamp', '>=', start), where('timestamp', '<', end), orderBy('timestamp', 'desc'));
      setEvents(snapToArray<AgentEvent>(await getDocs(eventsQ)));

      // Fit map to all pings
      const allPings = shiftDataArr.flatMap(s => s.pings);
      if (mapRef.current && allPings.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        allPings.forEach(p => bounds.extend([p.lng, p.lat]));
        mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
      }
    }
    loadDay();

    // Realtime for today — listen for new pings on active shift
    if (isToday) {
      const pingsQ = query(pingsCol, where('agent_id', '==', agentId), orderBy('timestamp', 'desc'), limit(1));
      const unsub = onSnapshot(pingsQ, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const ping = { ...change.doc.data(), id: change.doc.id } as LocationPing;
            setShifts(prev => {
              if (prev.length === 0) return prev;
              // Add to the shift that matches this ping's trip_id
              return prev.map(sd => {
                if (sd.shift.id !== ping.trip_id) return sd;
                if (sd.pings.find(p => p.id === ping.id)) return sd;
                const newPings = [...sd.pings, ping];
                const newStops = detectStops(newPings);
                const newLongStops = newStops.filter(s => s.durationMs >= LONG_STOP_THRESHOLD_MS);
                return { ...sd, pings: newPings, stops: newStops, longStops: newLongStops };
              });
            });
          }
        });
      });

      // Also listen for new shifts starting
      const shiftsQ = query(tripsCol, where('agent_id', '==', agentId), where('started_at', '>=', dayRange(selectedDate).start), orderBy('started_at', 'desc'), limit(1));
      const unsubShifts = onSnapshot(shiftsQ, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const newShift = { ...change.doc.data(), id: change.doc.id } as Trip;
            setShifts(prev => {
              if (prev.find(s => s.shift.id === newShift.id)) return prev;
              const newData: ShiftData = { shift: newShift, pings: [], stops: [], longStops: [] };
              const updated = [...prev, newData];
              setSelectedShiftIdx(updated.length - 1);
              return updated;
            });
          }
        });
      });

      return () => { unsub(); unsubShifts(); };
    }
  }, [agentId, selectedDate]);

  // Draw trails for ALL shifts on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawTrails = () => {
      // Remove old layers
      shifts.forEach((_, i) => {
        try {
          if (map.getLayer(`trail-glow-${i}`)) map.removeLayer(`trail-glow-${i}`);
          if (map.getLayer(`trail-${i}`)) map.removeLayer(`trail-${i}`);
          if (map.getSource(`trail-${i}`)) map.removeSource(`trail-${i}`);
        } catch { /* ok */ }
      });
      // Also clean up any extras from previous render
      for (let i = shifts.length; i < shifts.length + 5; i++) {
        try {
          if (map.getLayer(`trail-glow-${i}`)) map.removeLayer(`trail-glow-${i}`);
          if (map.getLayer(`trail-${i}`)) map.removeLayer(`trail-${i}`);
          if (map.getSource(`trail-${i}`)) map.removeSource(`trail-${i}`);
        } catch { /* ok */ }
      }

      shifts.forEach((sd, i) => {
        if (sd.pings.length < 2) return;
        const clean = cleanTrailPings(sd.pings);
        const features: GeoJSON.Feature[] = clean.slice(0, -1).map((p1, j) => ({
          type: 'Feature',
          properties: { color: getSpeedColor(p1.speed ?? 0) },
          geometry: { type: 'LineString', coordinates: [[p1.lng, p1.lat], [clean[j + 1].lng, clean[j + 1].lat]] },
        }));

        map.addSource(`trail-${i}`, { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: `trail-glow-${i}`, type: 'line', source: `trail-${i}`,
          paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-opacity': 0.3, 'line-blur': 8 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: `trail-${i}`, type: 'line', source: `trail-${i}`,
          paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      });
    };

    if (map.isStyleLoaded()) drawTrails();
    else map.on('style.load', drawTrails);

    return () => {
      shifts.forEach((_, i) => {
        try {
          if (map.getLayer(`trail-glow-${i}`)) map.removeLayer(`trail-glow-${i}`);
          if (map.getLayer(`trail-${i}`)) map.removeLayer(`trail-${i}`);
          if (map.getSource(`trail-${i}`)) map.removeSource(`trail-${i}`);
        } catch { /* ok */ }
      });
    };
  }, [shifts]);

  // Aggregate data
  const allPings = useMemo(() => shifts.flatMap(s => s.pings), [shifts]);
  const allLongStops = useMemo(() => shifts.flatMap(s => s.longStops), [shifts]);
  const selectedShift = shifts[selectedShiftIdx] || null;

  const daySummary = useMemo(() => {
    if (allPings.length < 2) return null;
    const totalMs = shifts.reduce((sum, sd) => {
      const end = sd.shift.ended_at ? new Date(sd.shift.ended_at).getTime() : Date.now();
      return sum + (end - new Date(sd.shift.started_at).getTime());
    }, 0);
    return {
      totalMs,
      distance: totalDistance(allPings),
      stopCount: allLongStops.length,
      shiftCount: shifts.length,
      pingCount: allPings.length,
    };
  }, [shifts, allPings, allLongStops]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => { mapRef.current = map; setMapInstance(map); }, []);
  const handleRecenter = useCallback(() => {
    if (allPings.length > 0 && mapRef.current) {
      const bounds = new mapboxgl.LngLatBounds();
      allPings.forEach(p => bounds.extend([p.lng, p.lat]));
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
    } else {
      mapRef.current?.easeTo({ center: DEFAULT_CENTER, zoom: 13, duration: 1000 });
    }
  }, [allPings]);
  const handleDismissAlert = useCallback((alertId: string) => {
    updateDoc(doc(alertsCol, alertId), { acknowledged: true }).catch(console.error);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  const unackedAlertCount = alerts.filter(a => !a.acknowledged).length;

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

      <div style={{ position: 'absolute', top: 16, right: 412, zIndex: 50 }}>
        <LayerSwitcher currentStyle={mapStyle} onStyleChange={setMapStyle} />
      </div>

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

      {/* Stop markers for all shifts */}
      <StopMarkers map={mapInstance} stops={allLongStops} />

      {/* Side panel */}
      <SidePanel title="Shift Overview">
        {/* Agent card + day summary */}
        <div style={{ background: theme.colors.card, borderRadius: theme.radius.md, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: theme.colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>M</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Agent Moussa</div>
              <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>+253 77 00 00 01</div>
            </div>
          </div>

          {daySummary ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <StatBox label="Distance" value={formatDistance(daySummary.distance)} icon={<Route size={12} />} />
              <StatBox label="Total Time" value={formatDuration(daySummary.totalMs)} icon={<Clock size={12} />} />
              <StatBox label="Stops" value={String(daySummary.stopCount)} icon={<Gauge size={12} />} />
              <StatBox label="Shifts" value={String(daySummary.shiftCount)} icon={<Battery size={12} />} />
            </div>
          ) : (
            <div style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>
              No shift data for this day
            </div>
          )}
        </div>

        {/* Shift cards */}
        {shifts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Shifts
            </div>
            {shifts.map((sd, i) => (
              <ShiftCard
                key={sd.shift.id}
                shift={sd.shift}
                pings={sd.pings}
                stopCount={sd.longStops.length}
                isActive={!sd.shift.ended_at}
                isSelected={i === selectedShiftIdx}
                onSelect={() => {
                  setSelectedShiftIdx(i);
                  if (sd.pings.length > 0 && mapRef.current) {
                    const bounds = new mapboxgl.LngLatBounds();
                    sd.pings.forEach(p => bounds.extend([p.lng, p.lat]));
                    mapRef.current.fitBounds(bounds, { padding: 80, duration: 1000 });
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Tamper timeline for selected shift */}
        {selectedShift && selectedShift.pings.length > 0 && events.length > 0 && (
          <TamperTimeline
            events={events.filter(e => e.trip_id === selectedShift.shift.id)}
            tripStartTime={selectedShift.shift.started_at}
            tripEndTime={selectedShift.shift.ended_at}
          />
        )}

        {/* Stops for selected shift */}
        {selectedShift && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stops ({'>'}3 min)
            </div>
            <StopLog stops={selectedShift.longStops} map={mapInstance} />
          </div>
        )}
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
