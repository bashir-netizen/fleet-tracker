import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, tripsCol, doc, setDoc, updateDoc, getDocs, query, where, orderBy, limit } from './supabase';
import { randomUUID } from 'expo-crypto';

const ACTIVE_TRIP_KEY = '@fleet_active_trip';

export interface ActiveTrip {
  id: string;
  agent_id: string;
  route_name: string;
  started_at: string;
}

export async function startTrip(agentId: string, routeName: string): Promise<ActiveTrip | null> {
  try {
    const tripId = randomUUID();
    const trip: ActiveTrip = {
      id: tripId,
      agent_id: agentId,
      route_name: routeName,
      started_at: new Date().toISOString(),
    };

    await setDoc(doc(tripsCol, tripId), {
      ...trip,
      ended_at: null,
      created_at: new Date().toISOString(),
    });

    await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));
    return trip;
  } catch (err) {
    console.error('Start trip error:', err);
    return null;
  }
}

export async function endTrip(): Promise<void> {
  const trip = await getActiveTrip();
  if (!trip) return;

  try {
    await updateDoc(doc(tripsCol, trip.id), { ended_at: new Date().toISOString() });
  } catch (err) {
    console.error('End trip error:', err);
  }
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
}

export async function getActiveTrip(): Promise<ActiveTrip | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
  return raw ? JSON.parse(raw) : null;
}
