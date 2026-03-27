-- Fleet Tracker — Initial Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- TABLE: agents
-- ============================================
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: trips
-- ============================================
CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  route_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: location_pings
-- ============================================
CREATE TABLE location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  trip_id uuid NOT NULL REFERENCES trips(id),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed real,
  accuracy real,
  battery_level real,
  heading real,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: agent_events (Anti-Tampering)
-- ============================================
CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  trip_id uuid REFERENCES trips(id),
  event_type text NOT NULL,
  metadata jsonb,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: alerts (Dashboard Notifications)
-- ============================================
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  trip_id uuid REFERENCES trips(id),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  message text,
  acknowledged boolean DEFAULT false,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_pings_trip_time ON location_pings(trip_id, timestamp);
CREATE INDEX idx_pings_agent_time ON location_pings(agent_id, timestamp);
CREATE INDEX idx_events_agent_time ON agent_events(agent_id, timestamp);
CREATE INDEX idx_alerts_agent_ack_time ON alerts(agent_id, acknowledged, timestamp);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- agents: read-only from anon
CREATE POLICY "agents_select" ON agents FOR SELECT TO anon USING (true);

-- trips: insert + select from anon
CREATE POLICY "trips_select" ON trips FOR SELECT TO anon USING (true);
CREATE POLICY "trips_insert" ON trips FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "trips_update" ON trips FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- location_pings: insert from mobile, select from dashboard
CREATE POLICY "pings_select" ON location_pings FOR SELECT TO anon USING (true);
CREATE POLICY "pings_insert" ON location_pings FOR INSERT TO anon WITH CHECK (true);

-- agent_events: insert from mobile, select from dashboard
CREATE POLICY "events_select" ON agent_events FOR SELECT TO anon USING (true);
CREATE POLICY "events_insert" ON agent_events FOR INSERT TO anon WITH CHECK (true);

-- alerts: insert + select + update(acknowledge) from anon
CREATE POLICY "alerts_select" ON alerts FOR SELECT TO anon USING (true);
CREATE POLICY "alerts_insert" ON alerts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "alerts_update" ON alerts FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE location_pings;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;

-- ============================================
-- SEED: Default agent
-- ============================================
INSERT INTO agents (name, phone) VALUES ('Agent Moussa', '+253 77 00 00 01');
