/**
 * Seed script — generates a realistic Djibouti City motorcycle route
 * Run: npx tsx scripts/seed.ts
 *
 * Creates: 1 agent (if not exists), 1 trip, ~500 pings, events, alerts
 * Route: Boulevard de la Republique → Rue de Marseille → PK13 → Port
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── Config ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Realistic Djibouti City waypoints ──────────────────────────────
// Each waypoint: [lat, lng, target_speed_kmh, description]
const WAYPOINTS: [number, number, number, string][] = [
  // Start: Boulevard de la Republique (city center)
  [11.5880, 43.1456, 0, 'Start — Blvd de la Republique'],
  [11.5875, 43.1462, 15, 'Heading east on Blvd'],
  [11.5868, 43.1475, 25, 'Blvd de la Republique'],
  [11.5860, 43.1490, 30, 'Approaching roundabout'],
  [11.5855, 43.1498, 10, 'Roundabout slowdown'],
  [11.5852, 43.1505, 0, 'Stop 1 — Delivery at shop'], // STOP 1 (3 min)

  // Rue de Marseille
  [11.5848, 43.1512, 20, 'Rue de Marseille south'],
  [11.5840, 43.1525, 30, 'Rue de Marseille'],
  [11.5832, 43.1538, 35, 'Rue de Marseille'],
  [11.5825, 43.1550, 25, 'Approaching market area'],
  [11.5820, 43.1558, 5, 'Market traffic'],
  [11.5818, 43.1562, 0, 'Stop 2 — Market delivery'], // STOP 2 (5 min)

  // Toward PK13
  [11.5810, 43.1570, 25, 'Leaving market'],
  [11.5795, 43.1585, 40, 'Main road to PK13'],
  [11.5775, 43.1605, 45, 'Open road'],
  [11.5750, 43.1630, 50, 'Highway stretch'],
  [11.5720, 43.1660, 50, 'Highway stretch'],
  [11.5690, 43.1685, 45, 'Approaching PK13'],
  [11.5670, 43.1700, 30, 'PK13 area'],
  [11.5660, 43.1710, 10, 'PK13 intersection'],
  [11.5655, 43.1715, 0, 'Stop 3 — PK13 delivery'], // STOP 3 (7 min)

  // Heading to port
  [11.5660, 43.1720, 20, 'Leaving PK13'],
  [11.5680, 43.1735, 35, 'Road to port'],
  [11.5700, 43.1750, 40, 'Port road'],
  [11.5720, 43.1760, 35, 'Port road'],
  [11.5740, 43.1770, 25, 'Port area approaching'],
  [11.5755, 43.1778, 15, 'Port gate area'],
  [11.5760, 43.1780, 0, 'Stop 4 — Port delivery'], // STOP 4 (2 min)

  // Return toward city
  [11.5770, 43.1775, 20, 'Leaving port'],
  [11.5790, 43.1760, 35, 'Return road'],
  [11.5810, 43.1740, 40, 'Return road'],
  [11.5830, 43.1720, 35, 'Return road'],
  [11.5845, 43.1700, 30, 'Approaching city'],
  [11.5855, 43.1685, 0, 'Stop 5 — Quick drop'], // STOP 5 (1.5 min)

  // Final stretch
  [11.5860, 43.1675, 20, 'Back in city'],
  [11.5868, 43.1660, 25, 'City streets'],
  [11.5875, 43.1645, 20, 'Final approach'],
  [11.5880, 43.1635, 10, 'Parking'],
  [11.5882, 43.1630, 0, 'End — Base return'],
];

// ── Helpers ────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function jitter(val: number, amount: number): number {
  return val + (Math.random() - 0.5) * 2 * amount;
}

function generatePings(
  agentId: string,
  tripId: string,
  startTime: Date,
): { pings: any[]; events: any[]; alerts: any[] } {
  const pings: any[] = [];
  const events: any[] = [];
  const alerts: any[] = [];
  let currentTime = new Date(startTime);
  let battery = 87;
  const pingInterval = 10; // seconds between pings

  for (let w = 0; w < WAYPOINTS.length - 1; w++) {
    const [lat1, lng1, speed1, desc1] = WAYPOINTS[w];
    const [lat2, lng2, speed2] = WAYPOINTS[w + 1];
    const isStop = speed1 === 0 && w > 0;

    // Determine how many pings for this segment
    let segmentPings: number;
    if (isStop) {
      // Stop duration based on position
      const stopDurations: Record<number, number> = {
        5: 180,   // Stop 1: 3 min
        11: 300,  // Stop 2: 5 min
        20: 420,  // Stop 3: 7 min
        27: 120,  // Stop 4: 2 min
        32: 90,   // Stop 5: 1.5 min
      };
      const stopSec = stopDurations[w] || 120;
      segmentPings = Math.floor(stopSec / pingInterval);
    } else {
      // Moving: 3-8 pings per segment
      segmentPings = 3 + Math.floor(Math.random() * 6);
    }

    for (let p = 0; p < segmentPings; p++) {
      const t = p / segmentPings;
      const lat = isStop ? jitter(lat1, 0.00002) : lerp(lat1, lat2, t);
      const lng = isStop ? jitter(lng1, 0.00002) : lerp(lng1, lng2, t);
      const speed = isStop
        ? jitter(0.5, 0.5)
        : jitter(lerp(speed1 || speed2, speed2, t), 3);

      battery -= Math.random() * 0.08;
      const accuracy = jitter(8, 5);
      const heading = isStop ? null : (Math.atan2(lng2 - lng1, lat2 - lat1) * 180) / Math.PI;

      pings.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000,
        speed: Math.max(0, Math.round(speed * 10) / 10),
        accuracy: Math.max(2, Math.round(Math.abs(accuracy) * 10) / 10),
        battery_level: Math.round(battery * 10) / 10,
        heading: heading ? Math.round(((heading % 360) + 360) % 360) : null,
        timestamp: currentTime.toISOString(),
      });

      currentTime = new Date(currentTime.getTime() + pingInterval * 1000);
    }

    // Add tampering events at certain stops
    if (w === 11) {
      // Stop 2: simulate app backgrounded
      events.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        event_type: 'app_backgrounded',
        metadata: { battery: Math.round(battery) },
        timestamp: currentTime.toISOString(),
      });
      // Restore after 30s
      const restoreTime = new Date(currentTime.getTime() + 30000);
      events.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        event_type: 'app_foregrounded',
        metadata: { battery: Math.round(battery) },
        timestamp: restoreTime.toISOString(),
      });

      alerts.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        alert_type: 'app_backgrounded',
        severity: 'warning',
        message: 'App was backgrounded during stop at market',
        acknowledged: false,
        timestamp: currentTime.toISOString(),
      });
    }

    if (w === 20) {
      // Stop 3: simulate network loss
      events.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        event_type: 'network_lost',
        metadata: { battery: Math.round(battery) },
        timestamp: currentTime.toISOString(),
      });
      const restoreTime = new Date(currentTime.getTime() + 45000);
      events.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        event_type: 'network_restored',
        metadata: { battery: Math.round(battery) },
        timestamp: restoreTime.toISOString(),
      });

      alerts.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        alert_type: 'network_lost',
        severity: 'warning',
        message: 'Network connectivity lost near PK13',
        acknowledged: false,
        timestamp: currentTime.toISOString(),
      });
    }

    if (battery < 15 && !events.find(e => e.event_type === 'battery_critical')) {
      events.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        event_type: 'battery_critical',
        metadata: { battery: Math.round(battery) },
        timestamp: currentTime.toISOString(),
      });

      alerts.push({
        id: randomUUID(),
        agent_id: agentId,
        trip_id: tripId,
        alert_type: 'battery_critical',
        severity: 'warning',
        message: `Battery at ${Math.round(battery)}%`,
        acknowledged: true,
        timestamp: currentTime.toISOString(),
      });
    }
  }

  return { pings, events, alerts };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('🏍️  Fleet Tracker — Seeding Djibouti City route...\n');

  // Get or create agent
  const { data: agents } = await supabase.from('agents').select('id').limit(1);
  let agentId: string;

  if (agents && agents.length > 0) {
    agentId = agents[0].id;
    console.log(`Using existing agent: ${agentId}`);
  } else {
    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({ name: 'Agent Moussa', phone: '+253 77 00 00 01' })
      .select('id')
      .single();
    if (error) throw error;
    agentId = newAgent!.id;
    console.log(`Created agent: ${agentId}`);
  }

  // Create trip
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - 1); // Started 1 hour ago

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      agent_id: agentId,
      route_name: 'PK13 to Port',
      started_at: startTime.toISOString(),
      ended_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (tripErr) throw tripErr;
  const tripId = trip!.id;
  console.log(`Created trip: ${tripId} — "PK13 to Port"`);

  // Generate data
  const { pings, events, alerts } = generatePings(agentId, tripId, startTime);
  console.log(`Generated: ${pings.length} pings, ${events.length} events, ${alerts.length} alerts`);

  // Insert in batches (Supabase limit)
  const BATCH = 500;
  for (let i = 0; i < pings.length; i += BATCH) {
    const batch = pings.slice(i, i + BATCH);
    const { error } = await supabase.from('location_pings').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Ping batch ${i} error:`, error.message);
    } else {
      console.log(`  Inserted pings ${i + 1}–${Math.min(i + BATCH, pings.length)}`);
    }
  }

  if (events.length > 0) {
    const { error } = await supabase.from('agent_events').upsert(events, { onConflict: 'id' });
    if (error) console.error('Events error:', error.message);
    else console.log(`  Inserted ${events.length} events`);
  }

  if (alerts.length > 0) {
    const { error } = await supabase.from('alerts').upsert(alerts, { onConflict: 'id' });
    if (error) console.error('Alerts error:', error.message);
    else console.log(`  Inserted ${alerts.length} alerts`);
  }

  console.log('\nDone! Route: Blvd de la Republique → Rue de Marseille → PK13 → Port → Return');
  console.log(`Trip ID: ${tripId}`);
  console.log(`Pings: ${pings.length} over ~${Math.round(pings.length * 10 / 60)} minutes`);
  console.log(`Stops: 5 (3min, 5min, 7min, 2min, 1.5min)`);
}

main().catch(console.error);
