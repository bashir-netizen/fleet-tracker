import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PINGS_KEY = '@fleet_offline_pings';
const EVENTS_KEY = '@fleet_offline_events';

export interface QueuedPing {
  id: string;
  agent_id: string;
  trip_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  battery_level: number | null;
  heading: number | null;
  timestamp: string;
}

export interface QueuedEvent {
  id: string;
  agent_id: string;
  trip_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

// ── Queue Management ────────────────────────────────────────────

export async function queuePing(ping: QueuedPing): Promise<void> {
  const existing = await getQueuedPings();
  existing.push(ping);
  await AsyncStorage.setItem(PINGS_KEY, JSON.stringify(existing));
}

export async function queueEvent(event: QueuedEvent): Promise<void> {
  const existing = await getQueuedEvents();
  existing.push(event);
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(existing));
}

export async function getQueuedPings(): Promise<QueuedPing[]> {
  const raw = await AsyncStorage.getItem(PINGS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getQueuedEvents(): Promise<QueuedEvent[]> {
  const raw = await AsyncStorage.getItem(EVENTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getQueuedCount(): Promise<number> {
  const pings = await getQueuedPings();
  const events = await getQueuedEvents();
  return pings.length + events.length;
}

// ── Flush (Upload) ──────────────────────────────────────────────

export async function flushQueue(): Promise<{ flushedPings: number; flushedEvents: number }> {
  let flushedPings = 0;
  let flushedEvents = 0;

  // Flush pings in batches of 100
  const pings = await getQueuedPings();
  if (pings.length > 0) {
    const BATCH = 100;
    const remaining: QueuedPing[] = [];

    for (let i = 0; i < pings.length; i += BATCH) {
      const batch = pings.slice(i, i + BATCH);
      const { error } = await supabase
        .from('location_pings')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        // Keep failed pings in queue
        remaining.push(...batch);
        console.error('Flush pings error:', error.message);
      } else {
        flushedPings += batch.length;
      }
    }

    await AsyncStorage.setItem(PINGS_KEY, JSON.stringify(remaining));
  }

  // Flush events
  const events = await getQueuedEvents();
  if (events.length > 0) {
    const { error } = await supabase
      .from('agent_events')
      .upsert(events, { onConflict: 'id' });

    if (error) {
      console.error('Flush events error:', error.message);
    } else {
      flushedEvents = events.length;
      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify([]));
    }
  }

  return { flushedPings, flushedEvents };
}
