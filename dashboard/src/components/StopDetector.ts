/**
 * Stop Detection — Pure Function State Machine
 *
 * Two states: MOVING and STOPPED
 * Stop begins: speed < 2 km/h for 3+ consecutive pings (~30s)
 * Stop ends: speed > 2 km/h for 2+ consecutive pings (prevents false departure)
 *
 * Same function powers both live (incremental) and replay (batch) modes.
 */

import type { LocationPing } from '../lib/firebase';

const STOP_SPEED_THRESHOLD = 2; // km/h
const STOP_START_COUNT = 3; // consecutive slow pings to trigger stop
const STOP_END_COUNT = 2; // consecutive fast pings to end stop
export const LONG_STOP_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes — only these get pins/log entries

export interface Stop {
  number: number;
  centerLat: number;
  centerLng: number;
  arrivalTime: string;
  departureTime: string | null; // null = still stopped
  durationMs: number;
  pingCount: number;
  pings: LocationPing[];
}

export type DetectorState = 'MOVING' | 'STOPPED';

export interface StopDetectorState {
  mode: DetectorState;
  slowCount: number; // consecutive slow pings while MOVING
  fastCount: number; // consecutive fast pings while STOPPED
  currentStop: Stop | null;
  completedStops: Stop[];
  stopCounter: number;
  slowBuffer: LocationPing[]; // buffer of slow pings before stop confirmed
}

export function createDetectorState(): StopDetectorState {
  return {
    mode: 'MOVING',
    slowCount: 0,
    fastCount: 0,
    currentStop: null,
    completedStops: [],
    stopCounter: 0,
    slowBuffer: [],
  };
}

export interface DetectorEvent {
  type: 'stop_start' | 'stop_end';
  stop: Stop;
}

/**
 * Process a single ping — pure function (returns new state + events)
 */
export function processPing(
  state: StopDetectorState,
  ping: LocationPing,
): { state: StopDetectorState; events: DetectorEvent[] } {
  const speed = ping.speed ?? 0;
  const isSlow = speed < STOP_SPEED_THRESHOLD;
  const events: DetectorEvent[] = [];

  // Clone state
  const next: StopDetectorState = {
    ...state,
    slowBuffer: [...state.slowBuffer],
    completedStops: [...state.completedStops],
    currentStop: state.currentStop ? { ...state.currentStop, pings: [...state.currentStop.pings] } : null,
  };

  if (next.mode === 'MOVING') {
    if (isSlow) {
      next.slowCount++;
      next.slowBuffer.push(ping);

      if (next.slowCount >= STOP_START_COUNT) {
        // Start a new stop
        next.stopCounter++;
        const allSlowPings = next.slowBuffer;
        const avgLat = allSlowPings.reduce((s, p) => s + p.lat, 0) / allSlowPings.length;
        const avgLng = allSlowPings.reduce((s, p) => s + p.lng, 0) / allSlowPings.length;

        next.currentStop = {
          number: next.stopCounter,
          centerLat: avgLat,
          centerLng: avgLng,
          arrivalTime: allSlowPings[0].timestamp,
          departureTime: null,
          durationMs: new Date(ping.timestamp).getTime() - new Date(allSlowPings[0].timestamp).getTime(),
          pingCount: allSlowPings.length,
          pings: allSlowPings,
        };
        next.mode = 'STOPPED';
        next.fastCount = 0;

        events.push({ type: 'stop_start', stop: { ...next.currentStop } });
      }
    } else {
      next.slowCount = 0;
      next.slowBuffer = [];
    }
  } else {
    // STOPPED
    if (isSlow) {
      next.fastCount = 0;
      if (next.currentStop) {
        next.currentStop.pings.push(ping);
        next.currentStop.pingCount++;
        next.currentStop.durationMs =
          new Date(ping.timestamp).getTime() - new Date(next.currentStop.arrivalTime).getTime();

        // Update center (running average)
        const pings = next.currentStop.pings;
        next.currentStop.centerLat = pings.reduce((s, p) => s + p.lat, 0) / pings.length;
        next.currentStop.centerLng = pings.reduce((s, p) => s + p.lng, 0) / pings.length;
      }
    } else {
      next.fastCount++;

      if (next.fastCount >= STOP_END_COUNT) {
        // End the stop
        if (next.currentStop) {
          next.currentStop.departureTime = ping.timestamp;
          next.currentStop.durationMs =
            new Date(ping.timestamp).getTime() - new Date(next.currentStop.arrivalTime).getTime();

          const completed = { ...next.currentStop };
          next.completedStops.push(completed);
          events.push({ type: 'stop_end', stop: completed });
          next.currentStop = null;
        }
        next.mode = 'MOVING';
        next.slowCount = 0;
        next.slowBuffer = [];
        next.fastCount = 0;
      }
    }
  }

  return { state: next, events };
}

/**
 * Batch mode — process all pings at once (for replay)
 */
export function detectStops(pings: LocationPing[]): Stop[] {
  let state = createDetectorState();

  for (const ping of pings) {
    const result = processPing(state, ping);
    state = result.state;
  }

  // Include current (ongoing) stop if any
  const stops = [...state.completedStops];
  if (state.currentStop) {
    stops.push(state.currentStop);
  }

  return stops;
}

/**
 * Get all stops visible up to a given ping index (for progressive replay)
 */
export function detectStopsUpTo(pings: LocationPing[], upToIndex: number): Stop[] {
  let state = createDetectorState();

  for (let i = 0; i <= upToIndex && i < pings.length; i++) {
    const result = processPing(state, pings[i]);
    state = result.state;
  }

  const stops = [...state.completedStops];
  if (state.currentStop) {
    stops.push(state.currentStop);
  }
  return stops;
}
