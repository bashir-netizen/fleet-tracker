import type { LocationPing } from './firebase';

const R = 6371; // Earth radius in km

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function totalDistance(pings: LocationPing[]): number {
  let dist = 0;
  for (let i = 1; i < pings.length; i++) {
    dist += haversine(pings[i - 1].lat, pings[i - 1].lng, pings[i].lat, pings[i].lng);
  }
  return dist;
}

export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function lerpCoords(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  t: number
): [number, number] {
  return [lerp(lat1, lat2, t), lerp(lng1, lng2, t)];
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatSpeed(kmh: number): string {
  return `${Math.round(kmh)} km/h`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function formatLocalTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    timeZone: 'Africa/Djibouti',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatLocalDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'Africa/Djibouti',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Clean trail pings — collapse stationary clusters into single points
 * and remove micro-jitter. This fixes zigzag lines when stationary.
 */
export function cleanTrailPings(pings: LocationPing[]): LocationPing[] {
  if (pings.length < 2) return pings;

  const cleaned: LocationPing[] = [];
  let i = 0;

  while (i < pings.length) {
    const speed = pings[i].speed ?? 0;

    if (speed < 2) {
      // Stationary cluster — find all consecutive stationary pings
      let j = i;
      while (j < pings.length && (pings[j].speed ?? 0) < 2) j++;

      // Average the cluster to a single point
      const cluster = pings.slice(i, j);
      const avgLat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;

      // Emit one ping for the cluster (first one with averaged coords)
      cleaned.push({ ...cluster[0], lat: avgLat, lng: avgLng });
      // Also emit the last one so the trail connects to the next moving segment
      if (cluster.length > 1) {
        cleaned.push({ ...cluster[cluster.length - 1], lat: avgLat, lng: avgLng });
      }
      i = j;
    } else {
      // Moving — keep but apply minimum distance filter
      if (cleaned.length > 0) {
        const last = cleaned[cleaned.length - 1];
        const dist = haversine(last.lat, last.lng, pings[i].lat, pings[i].lng) * 1000; // meters
        if (dist < 5) { i++; continue; } // Skip micro-jitter
      }
      cleaned.push(pings[i]);
      i++;
    }
  }

  return cleaned;
}
