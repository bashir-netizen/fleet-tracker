import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { theme } from '../styles/theme';

type AgentStatus = 'normal' | 'warning' | 'critical' | 'offline';

interface AgentDotProps {
  map: mapboxgl.Map | null;
  lat: number;
  lng: number;
  heading: number | null;
  status: AgentStatus;
  visible: boolean;
}

function statusRingColor(status: AgentStatus): string {
  switch (status) {
    case 'normal': return theme.colors.green;
    case 'warning': return theme.colors.amber;
    case 'critical': return theme.colors.red;
    case 'offline': return '#5E5E63';
  }
}

export default function AgentDot({ map, lat, lng, heading, status, visible }: AgentDotProps) {
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map || !visible) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const container = document.createElement('div');
      container.style.cssText = `
        width: 48px; height: 48px;
        position: relative;
        display: flex; align-items: center; justify-content: center;
      `;

      // Pulsing outer ring
      const ring = document.createElement('div');
      ring.className = 'agent-ring';
      ring.style.cssText = `
        position: absolute; inset: 0;
        border-radius: 50%;
        border: 2px solid ${statusRingColor(status)};
        animation: pulse-ring 2s ease-in-out infinite;
      `;
      container.appendChild(ring);

      // Inner dot
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 20px; height: 20px;
        border-radius: 50%;
        background: ${theme.colors.accent};
        border: 3px solid #FFFFFF;
        box-shadow: 0 0 16px ${theme.colors.accentGlow};
        z-index: 1;
      `;
      container.appendChild(dot);

      // Heading arrow
      const arrow = document.createElement('div');
      arrow.className = 'agent-arrow';
      arrow.style.cssText = `
        position: absolute;
        top: -4px; left: 50%;
        transform: translateX(-50%) rotate(${heading ?? 0}deg);
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 10px solid ${theme.colors.accent};
        transform-origin: center 28px;
        transition: transform 0.5s ease;
      `;
      container.appendChild(arrow);

      elRef.current = container;
      markerRef.current = new mapboxgl.Marker({ element: container })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      // Smooth position update via CSS transition
      markerRef.current.setLngLat([lng, lat]);
    }

    // Update heading arrow
    const arrow = elRef.current?.querySelector('.agent-arrow') as HTMLElement | null;
    if (arrow && heading !== null) {
      arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`;
    }

    // Update ring color
    const ring = elRef.current?.querySelector('.agent-ring') as HTMLElement | null;
    if (ring) {
      ring.style.borderColor = statusRingColor(status);
      if (status === 'critical') {
        ring.style.animation = 'pulse-glow 1s ease-in-out infinite';
      } else {
        ring.style.animation = 'pulse-ring 2s ease-in-out infinite';
      }
    }

    return () => {
      // Don't remove on every render — only on unmount
    };
  }, [map, lat, lng, heading, status, visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, []);

  return null;
}
