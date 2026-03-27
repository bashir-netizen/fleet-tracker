import { useState, useCallback, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import Map, { type MapStyleKey } from './components/Map';
import TopBar, { type ViewMode } from './components/TopBar';
import SidePanel from './components/SidePanel';
import LayerSwitcher from './components/LayerSwitcher';
import BottomSheet from './components/BottomSheet';
import { Crosshair, Bell } from 'lucide-react';
import { theme } from './styles/theme';
import './index.css';

// Djibouti City center
const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];

export default function App() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const [mode, setMode] = useState<ViewMode>('live');
  const [alertCount] = useState(0);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);

  const handleRecenter = useCallback(() => {
    mapRef.current?.easeTo({
      center: DEFAULT_CENTER,
      zoom: 13,
      duration: 1000,
    });
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Full-screen map */}
      <Map style={mapStyle} onMapReady={handleMapReady} />

      {/* Top bar — mode toggle + trip name */}
      <TopBar
        mode={mode}
        onModeChange={setMode}
        tripName={mode === 'live' ? 'PK13 to Port' : undefined}
      />

      {/* Alert bell — top left */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 50 }}>
        <button
          style={{
            position: 'relative',
            width: 44,
            height: 44,
            borderRadius: theme.radius.sm,
            background: theme.glass.background,
            backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: theme.shadows.card,
          }}
        >
          <Bell size={20} />
          {alertCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: theme.colors.red,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            >
              {alertCount}
            </span>
          )}
        </button>
      </div>

      {/* Layer switcher — top right (offset for side panel) */}
      <div style={{ position: 'absolute', top: 16, right: 412, zIndex: 50 }}>
        <LayerSwitcher currentStyle={mapStyle} onStyleChange={setMapStyle} />
      </div>

      {/* Re-center button — bottom right (offset for side panel) */}
      <div style={{ position: 'absolute', bottom: 32, right: 412, zIndex: 50 }}>
        <button
          onClick={handleRecenter}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.sm,
            background: theme.glass.background,
            backdropFilter: theme.glass.backdropFilter,
            border: theme.glass.border,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: theme.shadows.card,
            transition: theme.transitions.smooth,
          }}
        >
          <Crosshair size={20} />
        </button>
      </div>

      {/* Side panel */}
      <SidePanel title={mode === 'live' ? 'Live Tracking' : 'Trip Replay'}>
        {/* Agent card placeholder */}
        <div
          style={{
            background: theme.colors.card,
            borderRadius: theme.radius.md,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: theme.colors.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              M
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Agent Moussa</div>
              <div style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                +253 77 00 00 01
              </div>
            </div>
            <div
              style={{
                marginLeft: 'auto',
                padding: '4px 10px',
                borderRadius: theme.radius.full,
                background: 'rgba(5, 163, 87, 0.15)',
                color: theme.colors.green,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Online
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StatBox label="Speed" value="--" unit="km/h" />
            <StatBox label="Battery" value="--" unit="%" />
            <StatBox label="Distance" value="--" unit="km" />
            <StatBox label="Duration" value="--" unit="" />
          </div>
        </div>

        {/* Stop log placeholder */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: theme.colors.textSecondary,
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Stops
          </div>
          <div
            style={{
              color: theme.colors.textMuted,
              fontSize: 13,
              textAlign: 'center',
              padding: 40,
            }}
          >
            No stops recorded yet
          </div>
        </div>
      </SidePanel>

      {/* Bottom sheet — replay mode only */}
      <BottomSheet visible={mode === 'replay'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Play button */}
          <button
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: theme.colors.accent,
              border: 'none',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: theme.shadows.glow(theme.colors.accentGlow),
            }}
          >
            ▶
          </button>

          {/* Slider */}
          <div style={{ flex: 1 }}>
            <input
              type="range"
              className="replay-slider"
              min={0}
              max={100}
              defaultValue={0}
              style={{ width: '100%' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: theme.colors.textMuted,
                marginTop: 4,
              }}
            >
              <span>00:00:00</span>
              <span style={{ color: theme.colors.textPrimary, fontWeight: 600 }}>--:--:--</span>
              <span>00:00:00</span>
            </div>
          </div>

          {/* Speed pills */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {['5x', '10x', '25x', '50x'].map((speed, i) => (
              <button
                key={speed}
                style={{
                  padding: '6px 10px',
                  borderRadius: theme.radius.full,
                  border: 'none',
                  background: i === 0 ? theme.colors.accent : theme.colors.card,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: theme.transitions.smooth,
                }}
              >
                {speed}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      style={{
        background: theme.colors.bg,
        borderRadius: theme.radius.sm,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="animate-number" style={{ fontSize: 24, fontWeight: 700 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 12, color: theme.colors.textSecondary }}>{unit}</span>
        )}
      </div>
    </div>
  );
}
