import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { randomUUID } from 'expo-crypto';
import { queuePing, type QueuedPing } from './offlineQueue';

const LOCATION_TASK = 'fleet-background-location';
const ACCURACY_THRESHOLD = 50; // meters — discard above this
const MAX_SPEED_KMH = 120; // discard GPS teleportation

let lastLat = 0;
let lastLng = 0;
let lastTimestamp = 0;

// ── Background Task Definition ──────────────────────────────────

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    for (const loc of locations) {
      await processLocation(loc);
    }
  }
});

// ── Process a single location update ────────────────────────────

async function processLocation(loc: Location.LocationObject): Promise<void> {
  const accuracy = loc.coords.accuracy ?? 999;
  if (accuracy > ACCURACY_THRESHOLD) return; // Junk — discard

  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  const now = loc.timestamp;

  // Check for GPS teleportation
  if (lastLat !== 0 && lastTimestamp > 0) {
    const dt = (now - lastTimestamp) / 1000; // seconds
    if (dt > 0) {
      const dlat = lat - lastLat;
      const dlng = lng - lastLng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111; // rough km
      const impliedSpeed = (dist / dt) * 3600; // km/h
      if (impliedSpeed > MAX_SPEED_KMH) return; // Teleportation — discard
    }
  }

  lastLat = lat;
  lastLng = lng;
  lastTimestamp = now;

  // Get battery level
  let batteryLevel: number | null = null;
  try {
    batteryLevel = Math.round((await Battery.getBatteryLevelAsync()) * 100);
  } catch { /* ok */ }

  // Speed: m/s to km/h
  const speedKmh = loc.coords.speed != null ? Math.max(0, loc.coords.speed * 3.6) : null;

  const ping: QueuedPing = {
    id: randomUUID(),
    agent_id: '', // Set by caller
    trip_id: '', // Set by caller
    lat,
    lng,
    speed: speedKmh ? Math.round(speedKmh * 10) / 10 : null,
    accuracy: Math.round(accuracy * 10) / 10,
    battery_level: batteryLevel,
    heading: loc.coords.heading ?? null,
    timestamp: new Date(now).toISOString(),
    created_at: new Date(now).toISOString(),
  };

  // Try direct upload, fall back to queue
  await queuePing(ping);
}

// ── Start/Stop Tracking ─────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

export async function startTracking(): Promise<boolean> {
  const hasPerms = await requestPermissions();
  if (!hasPerms) return false;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000, // 10 seconds
    distanceInterval: 5, // 5 meters minimum
    foregroundService: {
      notificationTitle: 'Fleet Tracker',
      notificationBody: 'Tracking active',
      notificationColor: '#276EF1',
    },
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
  });

  return true;
}

export async function stopTracking(): Promise<void> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isLocationEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}
