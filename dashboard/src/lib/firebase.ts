import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc,
  query, where, orderBy, limit, getDocs, onSnapshot,
  Timestamp, type DocumentData, type QuerySnapshot,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDYUdZC13fXfuqzGZ1ZJAwnXdg3uI3Q-0E",
  authDomain: "agent-tracker-d07ed.firebaseapp.com",
  projectId: "agent-tracker-d07ed",
  storageBucket: "agent-tracker-d07ed.firebasestorage.app",
  messagingSenderId: "72283536064",
  appId: "1:72283536064:web:dc7c72c3af7f8a55b1cb25",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Collection refs ─────────────────────────────────────────────
export const agentsCol = collection(db, 'agents');
export const tripsCol = collection(db, 'trips');
export const pingsCol = collection(db, 'location_pings');
export const eventsCol = collection(db, 'agent_events');
export const alertsCol = collection(db, 'alerts');

// ── Types (same as before) ──────────────────────────────────────
export interface Agent {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  agent_id: string;
  route_name: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface LocationPing {
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

export interface AgentEvent {
  id: string;
  agent_id: string;
  trip_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  created_at: string;
}

export interface Alert {
  id: string;
  agent_id: string;
  trip_id: string | null;
  alert_type: string;
  severity: 'warning' | 'critical';
  message: string | null;
  acknowledged: boolean;
  timestamp: string;
  created_at: string;
}

// ── Helper: doc to typed object ─────────────────────────────────
function docToObj<T>(doc: DocumentData): T {
  const data = doc.data();
  return { ...data, id: doc.id } as T;
}

export function snapToArray<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map(d => docToObj<T>(d));
}

// ── Re-exports for convenience ──────────────────────────────────
export {
  query, where, orderBy, limit, getDocs, onSnapshot,
  doc, addDoc, setDoc, updateDoc, collection,
  Timestamp,
};
