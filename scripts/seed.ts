/**
 * Seed script — generates a realistic Djibouti City motorcycle route
 * Run: npx tsx scripts/seed.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, query, limit } from 'firebase/firestore';
import { randomUUID } from 'crypto';

const firebaseConfig = {
  apiKey: "AIzaSyDYUdZC13fXfuqzGZ1ZJAwnXdg3uI3Q-0E",
  authDomain: "agent-tracker-d07ed.firebaseapp.com",
  projectId: "agent-tracker-d07ed",
  storageBucket: "agent-tracker-d07ed.firebasestorage.app",
  messagingSenderId: "72283536064",
  appId: "1:72283536064:web:dc7c72c3af7f8a55b1cb25",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Waypoints ──────────────────────────────────────────────────
const WAYPOINTS: [number, number, number, string][] = [
  [11.5880, 43.1456, 0, 'Start — Blvd de la Republique'],
  [11.5875, 43.1462, 15, 'Heading east on Blvd'],
  [11.5868, 43.1475, 25, 'Blvd de la Republique'],
  [11.5860, 43.1490, 30, 'Approaching roundabout'],
  [11.5855, 43.1498, 10, 'Roundabout slowdown'],
  [11.5852, 43.1505, 0, 'Stop 1 — Delivery at shop'],
  [11.5848, 43.1512, 20, 'Rue de Marseille south'],
  [11.5840, 43.1525, 30, 'Rue de Marseille'],
  [11.5832, 43.1538, 35, 'Rue de Marseille'],
  [11.5825, 43.1550, 25, 'Approaching market area'],
  [11.5820, 43.1558, 5, 'Market traffic'],
  [11.5818, 43.1562, 0, 'Stop 2 — Market delivery'],
  [11.5810, 43.1570, 25, 'Leaving market'],
  [11.5795, 43.1585, 40, 'Main road to PK13'],
  [11.5775, 43.1605, 45, 'Open road'],
  [11.5750, 43.1630, 50, 'Highway stretch'],
  [11.5720, 43.1660, 50, 'Highway stretch'],
  [11.5690, 43.1685, 45, 'Approaching PK13'],
  [11.5670, 43.1700, 30, 'PK13 area'],
  [11.5660, 43.1710, 10, 'PK13 intersection'],
  [11.5655, 43.1715, 0, 'Stop 3 — PK13 delivery'],
  [11.5660, 43.1710, 20, 'Leaving PK13'],
  [11.5675, 43.1700, 35, 'Road south toward port area'],
  [11.5690, 43.1685, 40, 'Main road south'],
  [11.5710, 43.1670, 35, 'Approaching port district'],
  [11.5725, 43.1660, 25, 'Port district streets'],
  [11.5735, 43.1650, 15, 'Port gate area'],
  [11.5740, 43.1645, 0, 'Stop 4 — Port district delivery'],
  [11.5745, 43.1650, 20, 'Leaving port district'],
  [11.5760, 43.1640, 35, 'Return road north'],
  [11.5780, 43.1620, 40, 'Return road'],
  [11.5800, 43.1600, 35, 'Return road'],
  [11.5820, 43.1580, 30, 'Approaching city center'],
  [11.5835, 43.1565, 0, 'Stop 5 — Quick drop'],
  [11.5845, 43.1555, 20, 'Back in city'],
  [11.5855, 43.1540, 25, 'City streets'],
  [11.5865, 43.1510, 20, 'Final approach'],
  [11.5875, 43.1480, 10, 'Parking'],
  [11.5880, 43.1460, 0, 'End — Base return'],
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function jitter(val: number, amount: number) { return val + (Math.random() - 0.5) * 2 * amount; }

async function main() {
  console.log('Fleet Tracker — Seeding Djibouti City route...\n');

  // Get or create agent
  const agentsRef = collection(db, 'agents');
  const agentSnap = await getDocs(query(agentsRef, limit(1)));
  let agentId: string;

  if (!agentSnap.empty) {
    agentId = agentSnap.docs[0].id;
    console.log(`Using existing agent: ${agentId}`);
  } else {
    agentId = randomUUID();
    await setDoc(doc(agentsRef, agentId), {
      id: agentId,
      name: 'Agent Moussa',
      phone: '+253 77 00 00 01',
      is_active: true,
      created_at: new Date().toISOString(),
    });
    console.log(`Created agent: ${agentId}`);
  }

  // Create trip
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - 1);
  const tripId = randomUUID();

  await setDoc(doc(collection(db, 'trips'), tripId), {
    id: tripId,
    agent_id: agentId,
    route_name: 'PK13 to Port',
    started_at: startTime.toISOString(),
    ended_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  console.log(`Created trip: ${tripId} — "PK13 to Port"`);

  // Generate pings
  const pingsRef = collection(db, 'location_pings');
  const eventsRef = collection(db, 'agent_events');
  const alertsRef = collection(db, 'alerts');

  let currentTime = new Date(startTime);
  let battery = 87;
  let pingCount = 0;
  const pingInterval = 10;

  for (let w = 0; w < WAYPOINTS.length - 1; w++) {
    const [lat1, lng1, speed1] = WAYPOINTS[w];
    const [lat2, lng2, speed2] = WAYPOINTS[w + 1];
    const isStop = speed1 === 0 && w > 0;

    const stopDurations: Record<number, number> = { 5: 180, 11: 300, 20: 420, 27: 120, 33: 90 };
    const segmentPings = isStop
      ? Math.floor((stopDurations[w] || 120) / pingInterval)
      : 3 + Math.floor(Math.random() * 6);

    for (let p = 0; p < segmentPings; p++) {
      const t = p / segmentPings;
      const lat = isStop ? jitter(lat1, 0.00002) : lerp(lat1, lat2, t);
      const lng = isStop ? jitter(lng1, 0.00002) : lerp(lng1, lng2, t);
      const speed = isStop ? jitter(0.5, 0.5) : jitter(lerp(speed1 || speed2, speed2, t), 3);
      battery -= Math.random() * 0.08;
      const accuracy = jitter(8, 5);
      const heading = isStop ? null : (Math.atan2(lng2 - lng1, lat2 - lat1) * 180) / Math.PI;

      const pingId = randomUUID();
      await setDoc(doc(pingsRef, pingId), {
        id: pingId,
        agent_id: agentId,
        trip_id: tripId,
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000,
        speed: Math.max(0, Math.round(speed * 10) / 10),
        accuracy: Math.max(2, Math.round(Math.abs(accuracy) * 10) / 10),
        battery_level: Math.round(battery * 10) / 10,
        heading: heading ? Math.round(((heading % 360) + 360) % 360) : null,
        timestamp: currentTime.toISOString(),
        created_at: currentTime.toISOString(),
      });

      pingCount++;
      currentTime = new Date(currentTime.getTime() + pingInterval * 1000);
    }

    // Tampering events
    if (w === 11) {
      const eid1 = randomUUID();
      await setDoc(doc(eventsRef, eid1), {
        id: eid1, agent_id: agentId, trip_id: tripId,
        event_type: 'app_backgrounded', metadata: { battery: Math.round(battery) },
        timestamp: currentTime.toISOString(), created_at: currentTime.toISOString(),
      });
      const eid2 = randomUUID();
      await setDoc(doc(eventsRef, eid2), {
        id: eid2, agent_id: agentId, trip_id: tripId,
        event_type: 'app_foregrounded', metadata: { battery: Math.round(battery) },
        timestamp: new Date(currentTime.getTime() + 30000).toISOString(),
        created_at: new Date(currentTime.getTime() + 30000).toISOString(),
      });
      const aid = randomUUID();
      await setDoc(doc(alertsRef, aid), {
        id: aid, agent_id: agentId, trip_id: tripId,
        alert_type: 'app_backgrounded', severity: 'warning',
        message: 'App was backgrounded during stop at market',
        acknowledged: false, timestamp: currentTime.toISOString(),
        created_at: currentTime.toISOString(),
      });
    }

    if (w === 20) {
      const eid1 = randomUUID();
      await setDoc(doc(eventsRef, eid1), {
        id: eid1, agent_id: agentId, trip_id: tripId,
        event_type: 'network_lost', metadata: { battery: Math.round(battery) },
        timestamp: currentTime.toISOString(), created_at: currentTime.toISOString(),
      });
      const eid2 = randomUUID();
      await setDoc(doc(eventsRef, eid2), {
        id: eid2, agent_id: agentId, trip_id: tripId,
        event_type: 'network_restored', metadata: { battery: Math.round(battery) },
        timestamp: new Date(currentTime.getTime() + 45000).toISOString(),
        created_at: new Date(currentTime.getTime() + 45000).toISOString(),
      });
      const aid = randomUUID();
      await setDoc(doc(alertsRef, aid), {
        id: aid, agent_id: agentId, trip_id: tripId,
        alert_type: 'network_lost', severity: 'warning',
        message: 'Network connectivity lost near PK13',
        acknowledged: false, timestamp: currentTime.toISOString(),
        created_at: currentTime.toISOString(),
      });
    }

    if (pingCount % 50 === 0) console.log(`  ${pingCount} pings written...`);
  }

  console.log(`\nDone! ${pingCount} pings, route: Blvd Republique -> Marseille -> PK13 -> Port -> Return`);
  console.log(`Trip ID: ${tripId}`);
  console.log(`5 stops (3min, 5min, 7min, 2min, 1.5min)`);
  process.exit(0);
}

main().catch(console.error);
