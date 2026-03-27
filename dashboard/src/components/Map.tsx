import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export const MAP_STYLES = {
  dark: `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_TOKEN}`,
  streets: `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${MAPBOX_TOKEN}`,
  satellite: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${MAPBOX_TOKEN}`,
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

// Djibouti City center
const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];
const DEFAULT_ZOOM = 13;

interface MapProps {
  onMapReady?: (map: maplibregl.Map) => void;
  style?: MapStyleKey;
}

export default function Map({ onMapReady, style = 'dark' }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[style],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      onMapReady?.(map);
    });

    mapRef.current = map;
  }, [onMapReady, style]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initMap]);

  // Handle style changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentStyle = MAP_STYLES[style];
    map.setStyle(currentStyle);
  }, [style]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}

export function useMapInstance() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const setMap = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
  }, []);
  return { mapRef, setMap };
}
