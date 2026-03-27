import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const ACTIVE_TRIP_KEY = '@fleet_active_trip';

export interface ActiveTrip {
  id: string;
  agent_id: string;
  route_name: string;
  started_at: string;
}

export async function startTrip(agentId: string, routeName: string): Promise<ActiveTrip | null> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      agent_id: agentId,
      route_name: routeName,
      started_at: new Date().toISOString(),
    })
    .select('id, agent_id, route_name, started_at')
    .single();

  if (error) {
    console.error('Start trip error:', error.message);
    return null;
  }

  const trip: ActiveTrip = data;
  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));
  return trip;
}

export async function endTrip(): Promise<void> {
  const trip = await getActiveTrip();
  if (!trip) return;

  await supabase
    .from('trips')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', trip.id);

  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
}

export async function getActiveTrip(): Promise<ActiveTrip | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function hasStaleTrip(): Promise<{ stale: boolean; trip: ActiveTrip | null }> {
  const trip = await getActiveTrip();
  if (!trip) return { stale: false, trip: null };

  // Check if trip is still marked as active in Supabase
  const { data } = await supabase
    .from('trips')
    .select('ended_at')
    .eq('id', trip.id)
    .single();

  if (data?.ended_at) {
    // Trip was ended elsewhere
    await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
    return { stale: false, trip: null };
  }

  return { stale: true, trip };
}
