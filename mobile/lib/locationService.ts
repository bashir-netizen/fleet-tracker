import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { queuePing, flushQueue, type QueuedPing } from './offlineQueue';

const LOCATION_TASK = 'fleet-background-location';
const ACCURACY_THRESHOLD = 50;
const MAX_SPEED_KMH = 120;
const STATIONARY_SPEED = 2; // km/h — below this = not moving
const MIN_DISTANCE_M = 10; // meters — skip pings closer than this when slow
const TRACKING_IDS_KEY = '@fleet_tracking_ids';

let lastLat = 0;
let lastLng = 0;
let lastTimestamp = 0;
let lastRecordedLat = 0;
let lastRecordedLng = 0;

// Stationary lock — when not moving, lock position to prevent jitter
let stationaryLock: { lat: number; lng: number } | null = null;

// Simple Kalman filter state
let kalmanLat = 0;
let kalmanLng = 0;
let kalmanVariance = 1000; // start with high uncertainty
let kalmanInitialized = false;

// ── Tracking IDs ────────────────────────────────────────────────

export async function setTrackingIds(agentId: string, shiftId: string): Promise<void> {
  await AsyncStorage.setItem(TRACKING_IDS_KEY, JSON.stringify({ agentId, shiftId }));
}

async function getTrackingIds(): Promise<{ agentId: string; shiftId: string } | null> {
  const raw = await AsyncStorage.getItem(TRACKING_IDS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearTrackingIds(): Promise<void> {
  await AsyncStorage.removeItem(TRACKING_IDS_KEY);
}

// ── Kalman Filter ───────────────────────────────────────────────

function kalmanUpdate(measurement: number, accuracy: number, prev: number, variance: number): { estimate: number; variance: number } {
  const measurementVariance = accuracy * accuracy; // accuracy in meters squared
  const gain = variance / (variance + measurementVariance);
  const newEstimate = prev + gain * (measurement - prev);
  const newVariance = (1 - gain) * variance;
  return { estimate: newEstimate, variance: newVariance };
}

function applyKalman(lat: number, lng: number, accuracy: number): { lat: number; lng: number } {
  if (!kalmanInitialized) {
    kalmanLat = lat;
    kalmanLng = lng;
    kalmanVariance = accuracy * accuracy;
    kalmanInitialized = true;
    return { lat, lng };
  }

  // Process noise — how much we expect position to change between pings
  // Higher = more responsive but less smooth
  kalmanVariance += 2; // ~2m² per ping interval

  const latResult = kalmanUpdate(lat, accuracy, kalmanLat, kalmanVariance);
  const lngResult = kalmanUpdate(lng, accuracy, kalmanLng, kalmanVariance);

  kalmanLat = latResult.estimate;
  kalmanLng = lngResult.estimate;
  kalmanVariance = latResult.variance;

  return { lat: kalmanLat, lng: kalmanLng };
}

// ── Haversine distance in meters ────────────────────────────────

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Background Task ─────────────────────────────────────────────

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) { console.error('Location task error:', error); return; }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    for (const loc of locations) {
      await processLocation(loc);
    }
    try { await flushQueue(); } catch { /* ok */ }
  }
});

// ── Process Location ────────────────────────────────────────────

async function processLocation(loc: Location.LocationObject): Promise<void> {
  const accuracy = loc.coords.accuracy ?? 999;
  if (accuracy > ACCURACY_THRESHOLD) return;

  const ids = await getTrackingIds();
  if (!ids) return;

  let lat = loc.coords.latitude;
  let lng = loc.coords.longitude;
  const now = loc.timestamp;
  const speedKmh = loc.coords.speed != null ? Math.max(0, loc.coords.speed * 3.6) : 0;

  // ── Layer 1: Teleportation filter ──
  if (lastLat !== 0 && lastTimestamp > 0) {
    const dt = (now - lastTimestamp) / 1000;
    if (dt > 0) {
      const dist = distanceMeters(lastLat, lastLng, lat, lng);
      const impliedSpeed = (dist / dt) * 3.6; // km/h
      if (impliedSpeed > MAX_SPEED_KMH) return;
    }
  }
  lastLat = lat;
  lastLng = lng;
  lastTimestamp = now;

  // ── Layer 2: Kalman filter — smooth the raw GPS ──
  const smoothed = applyKalman(lat, lng, accuracy);
  lat = smoothed.lat;
  lng = smoothed.lng;

  // ── Layer 3: Stationary lock — eliminate jitter when not moving ──
  if (speedKmh < STATIONARY_SPEED) {
    if (!stationaryLock) {
      stationaryLock = { lat, lng };
    }
    // Use locked position
    lat = stationaryLock.lat;
    lng = stationaryLock.lng;
  } else {
    stationaryLock = null;
  }

  // ── Layer 4: Minimum distance filter — skip micro-movements ──
  if (lastRecordedLat !== 0) {
    const distFromLast = distanceMeters(lastRecordedLat, lastRecordedLng, lat, lng);
    if (distFromLast < MIN_DISTANCE_M && speedKmh < 5) return;
  }
  lastRecordedLat = lat;
  lastRecordedLng = lng;

  // ── Build ping ──
  let batteryLevel: number | null = null;
  try { batteryLevel = Math.round((await Battery.getBatteryLevelAsync()) * 100); } catch { /* ok */ }

  const ping: QueuedPing = {
    id: randomUUID(),
    agent_id: ids.agentId,
    trip_id: ids.shiftId,
    lat: Math.round(lat * 1000000) / 1000000,
    lng: Math.round(lng * 1000000) / 1000000,
    speed: Math.round(speedKmh * 10) / 10,
    accuracy: Math.round(accuracy * 10) / 10,
    battery_level: batteryLevel,
    heading: loc.coords.heading ?? null,
    timestamp: new Date(now).toISOString(),
    created_at: new Date(now).toISOString(),
  };

  await queuePing(ping);
}

// ── Start/Stop ──────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

export async function startTracking(): Promise<boolean> {
  const hasPerms = await requestPermissions();
  if (!hasPerms) return false;

  // Reset filters
  stationaryLock = null;
  kalmanInitialized = false;
  lastRecordedLat = 0;
  lastRecordedLng = 0;

  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isTracking) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000,
    distanceInterval: 5,
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
  if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await clearTrackingIds();
  stationaryLock = null;
  kalmanInitialized = false;
}

export async function isLocationEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}
