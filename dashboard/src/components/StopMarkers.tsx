import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Stop } from './StopDetector';
import { formatDuration, formatLocalTime } from '../lib/geo';
import { theme } from '../styles/theme';

interface StopMarkersProps {
  map: maplibregl.Map | null;
  stops: Stop[];
}

function stopColor(durationMs: number): string {
  const min = durationMs / 60000;
  if (min < 2) return theme.colors.green;
  if (min < 5) return theme.colors.amber;
  return theme.colors.red;
}

function stopSize(durationMs: number): number {
  const min = durationMs / 60000;
  if (min < 2) return 28;
  if (min < 5) return 36;
  return 44;
}

export default function StopMarkers({ map, stops }: StopMarkersProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!map || stops.length === 0) return;

    stops.forEach((stop, i) => {
      const color = stopColor(stop.durationMs);
      const size = stopSize(stop.durationMs);
      const isOngoing = !stop.departureTime;

      const el = document.createElement('div');
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${theme.colors.bg};
        border: 3px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #FFFFFF;
        font-size: ${size > 36 ? 16 : 13}px;
        font-weight: 700;
        font-family: 'Inter', sans-serif;
        cursor: pointer;
        animation: fade-in-scale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        box-shadow: 0 0 12px ${color}44;
        ${isOngoing ? 'animation: pulse-glow 2s ease-in-out infinite;' : ''}
      `;
      el.textContent = String(stop.number);

      const popup = new maplibregl.Popup({
        offset: size / 2 + 8,
        closeButton: false,
        className: 'stop-popup',
      }).setHTML(`
        <div style="
          background: ${theme.colors.panel};
          border: 1px solid ${theme.colors.border};
          border-radius: 12px;
          padding: 16px;
          color: #FFFFFF;
          font-family: 'Inter', sans-serif;
          min-width: 200px;
        ">
          <div style="display: flex; align-items: center; gap: 8; margin-bottom: 12px;">
            <div style="
              width: 28px; height: 28px; border-radius: 50%;
              background: ${color}22; border: 2px solid ${color};
              display: flex; align-items: center; justify-content: center;
              font-size: 13px; font-weight: 700;
            ">${stop.number}</div>
            <div style="font-size: 15px; font-weight: 600;">Stop #${stop.number}</div>
          </div>
          <div style="display: grid; gap: 8; font-size: 13px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #8E8E93;">Arrival</span>
              <span style="font-weight: 500;">${formatLocalTime(stop.arrivalTime)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #8E8E93;">Departure</span>
              <span style="font-weight: 500; ${isOngoing ? `color: ${theme.colors.red};` : ''}">${
                isOngoing ? 'Still here' : formatLocalTime(stop.departureTime!)
              }</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #8E8E93;">Duration</span>
              <span style="font-weight: 700; color: ${color};">${formatDuration(stop.durationMs)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #8E8E93;">Coords</span>
              <span style="font-size: 11px; color: #5E5E63;">${stop.centerLat.toFixed(4)}, ${stop.centerLng.toFixed(4)}</span>
            </div>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.centerLng, stop.centerLat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
    };
  }, [map, stops]);

  return null;
}
