import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import Map, { type MapStyleKey } from './components/Map';
import TopBar, { type ViewMode } from './components/TopBar';
import SidePanel from './components/SidePanel';
import LayerSwitcher from './components/LayerSwitcher';
import BottomSheet from './components/BottomSheet';
import RouteReplay from './components/RouteReplay';
import TripSelector from './components/TripSelector';
import StopMarkers from './components/StopMarkers';
import StopLog from './components/StopLog';
import LiveTracker, { type LiveStats } from './components/LiveTracker';
import AlertBanner from './components/AlertBanner';
import AlertPanel from './components/AlertPanel';
import TamperTimeline from './components/TamperTimeline';
import { detectStopsUpTo, detectStops, type Stop } from './components/StopDetector';
import {
  db, agentsCol, alertsCol, eventsCol, doc, updateDoc,
  query, where, orderBy, limit, getDocs, onSnapshot, snapToArray,
  type Trip, type LocationPing, type Alert, type AgentEvent,
} from './lib/firebase';
import { formatDuration, formatSpeed, formatDistance, formatTimeAgo } from './lib/geo';
import { batteryColor } from './lib/formatters';
import { Crosshair, Bell, List, Battery, Wifi, Gauge, Route, Clock, Zap } from 'lucide-react';
import { theme } from './styles/theme';
import './index.css';

const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];

type SidePanelTab = 'info' | 'trips';

export default function App() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const [mode, setMode] = useState<ViewMode>('live');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [replayPings, setReplayPings] = useState<LocationPing[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [sideTab, setSideTab] = useState<SidePanelTab>('info');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [liveStops, setLiveStops] = useState<Stop[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [alertPanelOpen, setAlertPanelOpen] = useState(false);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  // Load agent + alerts on mount
  useEffect(() => {
    async function init() {
      const agentSnap = await getDocs(query(agentsCol, limit(1)));
      const agentsList = snapToArray<{ id: string }>(agentSnap);
      if (agentsList.length > 0) {
        const id = agentsList[0].id;
        setAgentId(id);

        // Load alerts
        const alertSnap = await getDocs(query(alertsCol, where('agent_id', '==', id), orderBy('timestamp', 'desc'), limit(50)));
        setAlerts(snapToArray<Alert>(alertSnap));

        // Load events
        const eventSnap = await getDocs(query(eventsCol, where('agent_id', '==', id), orderBy('timestamp', 'desc'), limit(100)));
        setEvents(snapToArray<AgentEvent>(eventSnap));
      }
    }
    init();

    // Subscribe to new alerts (Firestore realtime)
    const alertQuery = query(alertsCol, orderBy('timestamp', 'desc'), limit(1));
    const unsubAlerts = onSnapshot(alertQuery, (snap) => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const alert = { ...change.doc.data(), id: change.doc.id } as Alert;
          setAlerts(prev => {
            if (prev.find(a => a.id === alert.id)) return prev;
            return [alert, ...prev];
          });
        }
      });
    });

    return () => { unsubAlerts(); };
  }, []);

  // Ping gap detection for live mode
  useEffect(() => {
    if (mode !== 'live' || !liveStats?.lastPingTime || !agentId) return;

    const interval = setInterval(() => {
      const gap = Date.now() - new Date(liveStats.lastPingTime!).getTime();
      if (gap > 180000) {
        // 3+ min — critical (only alert once)
        // In production this would insert to Supabase
      } else if (gap > 60000) {
        // 1+ min — warning
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [mode, liveStats?.lastPingTime, agentId]);

  const handleMapReady = useCallback((map: mapboxgl.Map) => { mapRef.current = map; }, []);
  const handleRecenter = useCallback(() => {
    mapRef.current?.easeTo({ center: DEFAULT_CENTER, zoom: 13, duration: 1000 });
  }, []);
  const handleSelectTrip = useCallback((trip: Trip) => {
    setSelectedTrip(trip);
    setMode('replay');
    setSideTab('info');
  }, []);
  const handleModeChange = useCallback((newMode: ViewMode) => {
    setMode(newMode);
    if (newMode === 'live') { setSelectedTrip(null); setReplayPings([]); }
  }, []);
  const handleDismissAlert = useCallback((alertId: string) => {
    updateDoc(doc(alertsCol, alertId), { acknowledged: true }).catch(console.error);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  // Stops for current view
  const stops = useMemo(() => {
    if (mode === 'live') return liveStops;
    if (replayPings.length > 0) return detectStopsUpTo(replayPings, replayIndex);
    return [];
  }, [mode, liveStops, replayPings, replayIndex]);

  const unackedAlertCount = alerts.filter(a => !a.acknowledged).length;

  // Current trip for tamper timeline
  const currentTripForTimeline = mode === 'live' ? null : selectedTrip;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Map style={mapStyle} onMapReady={handleMapReady} />

      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        tripName={selectedTrip?.route_name || (mode === 'live' ? 'Live Tracking' : undefined)}
      />

      {/* Alert banners */}
      <AlertBanner alerts={alerts} onDismiss={handleDismissAlert} />

      {/* Alert bell */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50 }}>
        <button
          onClick={() => setAlertPanelOpen(!alertPanelOpen)}
          style={{
            position: 'relative', width: 44, height: 44,
            borderRadius: theme.radius.sm,
            background: theme.glass.background,
            backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: theme.shadows.card,
          }}
        >
          <Bell size={20} />
          {unackedAlertCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              width: 20, height: 20, borderRadius: '50%',
              background: theme.colors.red, color: '#fff',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}>
              {unackedAlertCount}
            </span>
          )}
        </button>
      </div>

      {/* Alert panel overlay */}
      <AlertPanel
        alerts={alerts}
        visible={alertPanelOpen}
        onClose={() => setAlertPanelOpen(false)}
        onAcknowledge={handleDismissAlert}
      />

      {/* Layer switcher */}
      <div style={{ position: 'absolute', top: 16, right: 412, zIndex: 50 }}>
        <LayerSwitcher currentStyle={mapStyle} onStyleChange={setMapStyle} />
      </div>

      {/* Re-center */}
      <div style={{ position: 'absolute', bottom: mode === 'replay' ? 140 : 32, right: 412, zIndex: 50, transition: theme.transitions.smooth }}>
        <button
          onClick={handleRecenter}
          style={{
            width: 44, height: 44, borderRadius: theme.radius.sm,
            background: theme.glass.background, backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border, color: theme.colors.textPrimary,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: theme.shadows.card, transition: theme.transitions.smooth,
          }}
        >
          <Crosshair size={20} />
        </button>
      </div>

      {/* Live tracker (invisible — manages map + data) */}
      {mode === 'live' && (
        <LiveTracker
          map={mapRef.current}
          agentId={agentId}
          onStopsChange={setLiveStops}
          onStatsChange={setLiveStats}
        />
      )}

      {/* Stop markers */}
      <StopMarkers map={mapRef.current} stops={stops} />

      {/* Side panel */}
      <SidePanel title={mode === 'live' ? 'Live Tracking' : 'Trip Replay'}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <TabButton active={sideTab === 'info'} onClick={() => setSideTab('info')}>Info</TabButton>
          <TabButton active={sideTab === 'trips'} onClick={() => setSideTab('trips')}>
            <List size={14} style={{ marginRight: 4 }} /> Trips
          </TabButton>
        </div>

        {sideTab === 'trips' ? (
          <TripSelector onSelectTrip={handleSelectTrip} selectedTripId={selectedTrip?.id} />
        ) : (
          <>
            {/* Agent card */}
            <div style={{ background: theme.colors.card, borderRadius: theme.radius.md, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: theme.colors.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700,
                }}>M</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Agent Moussa</div>
                  <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>+253 77 00 00 01</div>
                </div>
                <div style={{
                  marginLeft: 'auto', padding: '4px 10px', borderRadius: theme.radius.full,
                  background: mode === 'live' ? 'rgba(5, 163, 87, 0.15)' : 'rgba(142, 142, 147, 0.15)',
                  color: mode === 'live' ? theme.colors.green : theme.colors.textSecondary,
                  fontSize: 12, fontWeight: 600,
                }}>
                  {mode === 'live' ? 'Online' : 'Replay'}
                </div>
              </div>

              {/* Stats grid */}
              {mode === 'live' && liveStats ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <StatBox
                    label="Speed"
                    value={formatSpeed(liveStats.speed).replace(' km/h', '')}
                    unit="km/h"
                    icon={<Gauge size={12} />}
                  />
                  <StatBox
                    label="Battery"
                    value={liveStats.battery !== null ? `${Math.round(liveStats.battery)}` : '--'}
                    unit="%"
                    valueColor={batteryColor(liveStats.battery)}
                    icon={<Battery size={12} />}
                  />
                  <StatBox
                    label="Distance"
                    value={formatDistance(liveStats.distance).replace(' km', '').replace(' m', '')}
                    unit={liveStats.distance >= 1 ? 'km' : 'm'}
                    icon={<Route size={12} />}
                  />
                  <StatBox
                    label="Last Ping"
                    value={liveStats.lastPingTime ? formatTimeAgo(liveStats.lastPingTime).replace(' ago', '') : '--'}
                    unit="ago"
                    valueColor={liveStats.lastPingTime && (Date.now() - new Date(liveStats.lastPingTime).getTime() > 60000) ? theme.colors.red : undefined}
                    icon={<Clock size={12} />}
                  />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <StatBox label="Speed" value="--" unit="km/h" icon={<Gauge size={12} />} />
                  <StatBox label="Battery" value="--" unit="%" icon={<Battery size={12} />} />
                  <StatBox label="Distance" value="--" unit="km" icon={<Route size={12} />} />
                  <StatBox label="Duration" value="--" unit="" icon={<Clock size={12} />} />
                </div>
              )}

              {/* Stopped banner */}
              {mode === 'live' && liveStats?.isStopped && (
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  borderRadius: theme.radius.sm,
                  background: `${theme.colors.red}15`,
                  border: `1px solid ${theme.colors.red}33`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: theme.colors.red,
                    animation: 'pulse-dot 1s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: theme.colors.red }}>
                    STOPPED — {formatDuration(liveStats.stoppedDuration)}
                  </span>
                </div>
              )}
            </div>

            {/* Tamper timeline */}
            {currentTripForTimeline && events.length > 0 && (
              <TamperTimeline
                events={events.filter(e => e.trip_id === currentTripForTimeline.id)}
                tripStartTime={currentTripForTimeline.started_at}
                tripEndTime={currentTripForTimeline.ended_at}
              />
            )}

            {/* Stops section */}
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: theme.colors.textSecondary,
                marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Stops
              </div>
              <StopLog stops={stops} map={mapRef.current} />
            </div>
          </>
        )}
      </SidePanel>

      {/* Bottom sheet — replay */}
      <BottomSheet visible={mode === 'replay'}>
        <RouteReplay
          map={mapRef.current}
          trip={selectedTrip}
          onPingsLoaded={setReplayPings}
          onCurrentIndex={setReplayIndex}
        />
      </BottomSheet>
    </div>
  );
}

function StatBox({ label, value, unit, icon, valueColor }: {
  label: string; value: string; unit: string;
  icon?: React.ReactNode; valueColor?: string;
}) {
  return (
    <div style={{ background: theme.colors.bg, borderRadius: theme.radius.sm, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="animate-number" style={{ fontSize: 24, fontWeight: 700, color: valueColor || theme.colors.textPrimary }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: theme.colors.textSecondary }}>{unit}</span>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 12px', borderRadius: theme.radius.sm, border: 'none',
        background: active ? theme.colors.accent : theme.colors.bg,
        color: active ? '#fff' : theme.colors.textSecondary,
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: theme.transitions.smooth,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
