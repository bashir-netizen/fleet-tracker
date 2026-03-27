import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing — running in demo mode');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Types matching our schema
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
