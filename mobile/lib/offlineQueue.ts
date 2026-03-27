import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, pingsCol, eventsCol, doc, setDoc } from './supabase';

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
  created_at: string;
}

export interface QueuedEvent {
  id: string;
  agent_id: string;
  trip_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  created_at: string;
}

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

export async function flushQueue(): Promise<{ flushedPings: number; flushedEvents: number }> {
  let flushedPings = 0;
  let flushedEvents = 0;

  // Flush pings
  const pings = await getQueuedPings();
  const failedPings: QueuedPing[] = [];

  for (const ping of pings) {
    try {
      await setDoc(doc(pingsCol, ping.id), ping);
      flushedPings++;
    } catch {
      failedPings.push(ping);
    }
  }
  await AsyncStorage.setItem(PINGS_KEY, JSON.stringify(failedPings));

  // Flush events
  const events = await getQueuedEvents();
  const failedEvents: QueuedEvent[] = [];

  for (const event of events) {
    try {
      await setDoc(doc(eventsCol, event.id), event);
      flushedEvents++;
    } catch {
      failedEvents.push(event);
    }
  }
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(failedEvents));

  return { flushedPings, flushedEvents };
}
