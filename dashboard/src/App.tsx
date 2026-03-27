import { useState, useCallback, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import Map, { type MapStyleKey } from './components/Map';
import TopBar, { type ViewMode } from './components/TopBar';
import SidePanel from './components/SidePanel';
import LayerSwitcher from './components/LayerSwitcher';
import BottomSheet from './components/BottomSheet';
import RouteReplay from './components/RouteReplay';
import TripSelector from './components/TripSelector';
import StopMarkers from './components/StopMarkers';
import StopLog from './components/StopLog';
import { detectStopsUpTo, detectStops } from './components/StopDetector';
import { Crosshair, Bell, List } from 'lucide-react';
import { theme } from './styles/theme';
import type { Trip, LocationPing } from './lib/supabase';
import './index.css';

const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];

type SidePanelTab = 'info' | 'trips';

export default function App() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const [mode, setMode] = useState<ViewMode>('live');
  const [alertCount] = useState(0);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [replayPings, setReplayPings] = useState<LocationPing[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [sideTab, setSideTab] = useState<SidePanelTab>('info');
  const mapRef = useRef<maplibregl.Map | null>(null);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

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
    if (newMode === 'live') {
      setSelectedTrip(null);
      setReplayPings([]);
    }
  }, []);

  // Compute stops based on mode
  const stops = useMemo(() => {
    if (mode === 'replay' && replayPings.length > 0) {
      return detectStopsUpTo(replayPings, replayIndex);
    }
    if (replayPings.length > 0) {
      return detectStops(replayPings);
    }
    return [];
  }, [mode, replayPings, replayIndex]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Map style={mapStyle} onMapReady={handleMapReady} />

      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        tripName={selectedTrip?.route_name || (mode === 'live' ? 'Live' : undefined)}
      />

      {/* Alert bell */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50 }}>
        <button
          style={{
            position: 'relative',
            width: 44, height: 44,
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
          {alertCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              width: 20, height: 20, borderRadius: '50%',
              background: theme.colors.red, color: '#fff',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}>
              {alertCount}
            </span>
          )}
        </button>
      </div>

      {/* Layer switcher */}
      <div style={{ position: 'absolute', top: 16, right: 412, zIndex: 50 }}>
        <LayerSwitcher currentStyle={mapStyle} onStyleChange={setMapStyle} />
      </div>

      {/* Re-center */}
      <div style={{ position: 'absolute', bottom: mode === 'replay' ? 140 : 32, right: 412, zIndex: 50, transition: theme.transitions.smooth }}>
        <button
          onClick={handleRecenter}
          style={{
            width: 44, height: 44,
            borderRadius: theme.radius.sm,
            background: theme.glass.background,
            backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: theme.shadows.card,
            transition: theme.transitions.smooth,
          }}
        >
          <Crosshair size={20} />
        </button>
      </div>

      {/* Stop markers on map */}
      <StopMarkers map={mapRef.current} stops={stops} />

      {/* Side panel */}
      <SidePanel title={mode === 'live' ? 'Live Tracking' : 'Trip Replay'}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <TabButton active={sideTab === 'info'} onClick={() => setSideTab('info')}>
            Info
          </TabButton>
          <TabButton active={sideTab === 'trips'} onClick={() => setSideTab('trips')}>
            <List size={14} style={{ marginRight: 4 }} />
            Trips
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
                }}>
                  M
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Agent Moussa</div>
                  <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>+253 77 00 00 01</div>
                </div>
                <div style={{
                  marginLeft: 'auto',
                  padding: '4px 10px', borderRadius: theme.radius.full,
                  background: mode === 'live' ? 'rgba(5, 163, 87, 0.15)' : 'rgba(142, 142, 147, 0.15)',
                  color: mode === 'live' ? theme.colors.green : theme.colors.textSecondary,
                  fontSize: 12, fontWeight: 600,
                }}>
                  {mode === 'live' ? 'Online' : 'Replay'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <StatBox label="Speed" value="--" unit="km/h" />
                <StatBox label="Battery" value="--" unit="%" />
                <StatBox label="Distance" value="--" unit="km" />
                <StatBox label="Duration" value="--" unit="" />
              </div>
            </div>

            {/* Stop log */}
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

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ background: theme.colors.bg, borderRadius: theme.radius.sm, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="animate-number" style={{ fontSize: 24, fontWeight: 700 }}>{value}</span>
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
        flex: 1, padding: '8px 12px',
        borderRadius: theme.radius.sm, border: 'none',
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
