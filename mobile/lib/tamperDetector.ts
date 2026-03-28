import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { queueEvent, type QueuedEvent } from './offlineQueue';

let agentId = '';
let tripId: string | null = null;
let locationCheckInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let highAccuracyStart = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

function createEvent(eventType: string, metadata?: Record<string, unknown>): QueuedEvent {
  return {
    id: randomUUID(),
    agent_id: agentId,
    trip_id: tripId,
    event_type: eventType,
    metadata: metadata || null,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

// ── 1. Location Services Toggle ─────────────────────────────────

let lastLocationEnabled = true;

async function checkLocationServices() {
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled && lastLocationEnabled) {
    await queueEvent(createEvent('location_disabled'));
  } else if (enabled && !lastLocationEnabled) {
    await queueEvent(createEvent('location_enabled'));
  }
  lastLocationEnabled = enabled;
}

// ── 2. Network Connectivity ─────────────────────────────────────

let lastNetworkConnected = true;

function startNetworkMonitor() {
  netInfoUnsubscribe = NetInfo.addEventListener(state => {
    const connected = !!state.isConnected;
    if (!connected && lastNetworkConnected) {
      queueEvent(createEvent('network_lost', { type: state.type }));
    } else if (connected && !lastNetworkConnected) {
      queueEvent(createEvent('network_restored', { type: state.type }));
    }
    lastNetworkConnected = connected;
  });
}

// ── 3. App State (Background/Foreground/Kill) ───────────────────

function startAppStateMonitor() {
  let lastState: AppStateStatus = AppState.currentState;

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (lastState === 'active' && nextState === 'background') {
      queueEvent(createEvent('app_backgrounded'));
    } else if (lastState !== 'active' && nextState === 'active') {
      queueEvent(createEvent('app_foregrounded'));
    }
    lastState = nextState;
  });
}

// ── 4. Mock Location Detection ──────────────────────────────────

export async function checkMockLocation(location: Location.LocationObject): Promise<boolean> {
  // @ts-ignore — mocked flag exists on Android
  const isMocked = location.mocked || location.coords?.mocked;
  if (isMocked) {
    await queueEvent(createEvent('mock_location_detected', {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    }));
    return true;
  }
  return false;
}

// ── 5. Battery Monitor ──────────────────────────────────────────

let batteryAlertSent = false;

async function checkBattery() {
  try {
    const level = await Battery.getBatteryLevelAsync();
    const pct = Math.round(level * 100);
    if (pct < 10 && !batteryAlertSent) {
      batteryAlertSent = true;
      await queueEvent(createEvent('battery_critical', { battery: pct }));
    } else if (pct >= 15) {
      batteryAlertSent = false; // Reset when charged above 15
    }
  } catch { /* ok */ }
}

// ── 6. GPS Signal Quality ───────────────────────────────────────

export function checkGpsQuality(accuracy: number) {
  if (accuracy > 100) {
    if (highAccuracyStart === 0) {
      highAccuracyStart = Date.now();
    } else if (Date.now() - highAccuracyStart > 30000) {
      queueEvent(createEvent('gps_signal_lost', { accuracy }));
      highAccuracyStart = 0; // Reset to avoid spam
    }
  } else {
    highAccuracyStart = 0;
  }
}

// ── 7. Heartbeat ────────────────────────────────────────────────

async function sendHeartbeat() {
  const battery = Math.round((await Battery.getBatteryLevelAsync().catch(() => 0)) * 100);
  const netState = await NetInfo.fetch();
  const gpsOn = await Location.hasServicesEnabledAsync().catch(() => false);
  await queueEvent(createEvent('heartbeat', {
    battery,
    network: netState.isConnected,
    networkType: netState.type,
    gps_enabled: gpsOn,
  }));
}

// ── Start / Stop All Monitors ───────────────────────────────────

export function startAllMonitors(agent: string, trip: string | null) {
  agentId = agent;
  tripId = trip;

  // Location services: poll every 5s
  locationCheckInterval = setInterval(() => {
    checkLocationServices();
    checkBattery();
  }, 5000);

  // Network
  startNetworkMonitor();

  // App state
  startAppStateMonitor();

  // Heartbeat every 30s — tighter monitoring
  heartbeatInterval = setInterval(sendHeartbeat, 30000);
}

export function stopAllMonitors() {
  if (locationCheckInterval) clearInterval(locationCheckInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (netInfoUnsubscribe) netInfoUnsubscribe();
  if (appStateSubscription) appStateSubscription.remove();

  locationCheckInterval = null;
  heartbeatInterval = null;
  netInfoUnsubscribe = null;
  appStateSubscription = null;
}

export function updateTripId(newTripId: string | null) {
  tripId = newTripId;
}
