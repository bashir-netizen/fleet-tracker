import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
// @ts-ignore - mapbox-gl types

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

export const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

// Djibouti City center
const DEFAULT_CENTER: [number, number] = [43.1456, 11.5880];
const DEFAULT_ZOOM = 13;

interface MapProps {
  onMapReady?: (map: mapboxgl.Map) => void;
  style?: MapStyleKey;
}

export default function Map({ onMapReady, style = 'dark' }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[style],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setMap = useCallback((map: mapboxgl.Map) => {
    mapRef.current = map;
  }, []);
  return { mapRef, setMap };
}
