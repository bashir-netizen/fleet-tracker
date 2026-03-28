import AsyncStorage from '@react-native-async-storage/async-storage';
import { tripsCol, doc, setDoc, updateDoc } from './supabase';
import { randomUUID } from 'expo-crypto';

const ACTIVE_SHIFT_KEY = '@fleet_active_shift';

export interface ActiveShift {
  id: string;
  agent_id: string;
  started_at: string;
  start_lat: number;
  start_lng: number;
}

export async function startShift(
  agentId: string,
  startLat: number,
  startLng: number,
): Promise<ActiveShift | null> {
  try {
    const shiftId = randomUUID();
    const now = new Date().toISOString();
    const shift: ActiveShift = {
      id: shiftId,
      agent_id: agentId,
      started_at: now,
      start_lat: startLat,
      start_lng: startLng,
    };

    await setDoc(doc(tripsCol, shiftId), {
      id: shiftId,
      agent_id: agentId,
      route_name: new Date().toISOString().split('T')[0], // "2026-03-28"
      started_at: now,
      ended_at: null,
      start_lat: startLat,
      start_lng: startLng,
      created_at: now,
    });

    await AsyncStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(shift));
    return shift;
  } catch (err) {
    console.error('Start shift error:', err);
    return null;
  }
}

export async function endShift(): Promise<void> {
  const shift = await getActiveShift();
  if (!shift) return;

  try {
    await updateDoc(doc(tripsCol, shift.id), { ended_at: new Date().toISOString() });
  } catch (err) {
    console.error('End shift error:', err);
  }
  await AsyncStorage.removeItem(ACTIVE_SHIFT_KEY);
}

export async function getActiveShift(): Promise<ActiveShift | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_SHIFT_KEY);
  return raw ? JSON.parse(raw) : null;
}
