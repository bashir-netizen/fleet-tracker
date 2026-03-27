import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, TextInput,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { agentsCol, getDocs, query, limit } from './lib/supabase';
import { startTracking, stopTracking, isLocationEnabled } from './lib/locationService';
import { startTrip, endTrip, getActiveTrip, type ActiveTrip } from './lib/tripManager';
import { getQueuedCount, flushQueue } from './lib/offlineQueue';
import { startAllMonitors, stopAllMonitors, updateTripId } from './lib/tamperDetector';

const COLORS = {
  bg: '#0F1117',
  panel: '#1A1D27',
  card: '#242837',
  accent: '#276EF1',
  green: '#05A357',
  amber: '#FF9500',
  red: '#E11900',
  text: '#FFFFFF',
  muted: '#8E8E93',
  dim: '#5E5E63',
};

export default function App() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [speed, setSpeed] = useState(0);
  const [battery, setBattery] = useState(100);
  const [connected, setConnected] = useState(true);
  const [locationOn, setLocationOn] = useState(true);
  const [pingCount, setPingCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');

  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init: get agent, check for stale trip
  useEffect(() => {
    async function init() {
      // Get agent
      const snap = await getDocs(query(agentsCol, limit(1)));
      if (!snap.empty) {
        setAgentId(snap.docs[0].id);
      }

      // Check for active trip from previous session
      const trip = await getActiveTrip();
      if (trip) {
        setActiveTrip(trip);
        setTracking(true);
        startAllMonitors(trip.agent_id, trip.id);
      }

      // Check initial states
      setBattery(Math.round((await Battery.getBatteryLevelAsync()) * 100));
      setLocationOn(await isLocationEnabled());
    }
    init();

    // Network listener
    const unsub = NetInfo.addEventListener(state => {
      setConnected(!!state.isConnected);
      if (state.isConnected) {
        flushQueue().then(({ flushedPings }) => {
          if (flushedPings > 0) setPingCount(c => c + flushedPings);
        });
      }
    });

    return () => {
      unsub();
      if (statsInterval.current) clearInterval(statsInterval.current);
    };
  }, []);

  // Poll stats while tracking
  useEffect(() => {
    if (!tracking) {
      if (statsInterval.current) clearInterval(statsInterval.current);
      return;
    }

    statsInterval.current = setInterval(async () => {
      setBattery(Math.round((await Battery.getBatteryLevelAsync()) * 100));
      setLocationOn(await isLocationEnabled());
      setQueuedCount(await getQueuedCount());
    }, 5000);

    return () => {
      if (statsInterval.current) clearInterval(statsInterval.current);
    };
  }, [tracking]);

  const handleStartTrip = useCallback(async () => {
    if (!agentId) {
      Alert.alert('Error', 'No agent configured');
      return;
    }
    if (!routeName.trim()) {
      Alert.alert('Route Name', 'Please enter a route name');
      return;
    }

    const trip = await startTrip(agentId, routeName.trim());
    if (!trip) {
      Alert.alert('Error', 'Failed to create trip');
      return;
    }

    setActiveTrip(trip);
    updateTripId(trip.id);

    const started = await startTracking();
    if (started) {
      setTracking(true);
      startAllMonitors(agentId, trip.id);
    } else {
      Alert.alert('Permission Required', 'Location permission is needed for tracking');
    }
  }, [agentId, routeName]);

  const handleStopTrip = useCallback(async () => {
    Alert.alert('End Trip', 'Are you sure you want to end this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Trip',
        style: 'destructive',
        onPress: async () => {
          await stopTracking();
          await endTrip();
          stopAllMonitors();

          // Flush remaining
          await flushQueue();

          setTracking(false);
          setActiveTrip(null);
          setSpeed(0);
          setPingCount(0);
          setRouteName('');
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Tracker</Text>
        <View style={styles.statusRow}>
          <StatusDot color={connected ? COLORS.green : COLORS.red} label={connected ? 'Online' : 'Offline'} />
          <StatusDot color={locationOn ? COLORS.green : COLORS.red} label={locationOn ? 'GPS On' : 'GPS Off'} />
        </View>
      </View>

      {/* Speed display */}
      <View style={styles.speedContainer}>
        <Text style={styles.speedValue}>{Math.round(speed)}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
        {tracking && (
          <View style={[styles.trackingBadge, { backgroundColor: COLORS.green + '22' }]}>
            <View style={[styles.pulseDot, { backgroundColor: COLORS.green }]} />
            <Text style={[styles.badgeText, { color: COLORS.green }]}>TRACKING</Text>
          </View>
        )}
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard
          label="Battery"
          value={`${battery}%`}
          color={battery > 50 ? COLORS.green : battery > 20 ? COLORS.amber : COLORS.red}
        />
        <StatCard label="Pings" value={String(pingCount)} color={COLORS.accent} />
        <StatCard
          label="Last Ping"
          value={lastPing ? timeSince(lastPing) : '--'}
          color={COLORS.muted}
        />
        <StatCard
          label="Queued"
          value={String(queuedCount)}
          color={queuedCount > 0 ? COLORS.amber : COLORS.dim}
        />
      </View>

      {/* Active trip info */}
      {activeTrip && (
        <View style={styles.tripCard}>
          <Text style={styles.tripLabel}>Active Trip</Text>
          <Text style={styles.tripName}>{activeTrip.route_name}</Text>
          <Text style={styles.tripTime}>
            Started {new Date(activeTrip.started_at).toLocaleTimeString()}
          </Text>
        </View>
      )}

      {/* Trip controls */}
      <View style={styles.controls}>
        {!tracking ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Route name (e.g. PK13 to Port)"
              placeholderTextColor={COLORS.dim}
              value={routeName}
              onChangeText={setRouteName}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.green }]}
              onPress={handleStartTrip}
            >
              <Text style={styles.buttonText}>Start Trip</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: COLORS.red }]}
            onPress={handleStopTrip}
          >
            <Text style={styles.buttonText}>End Trip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Agent ID: {agentId ? agentId.substring(0, 8) + '...' : 'Loading...'}
      </Text>
    </SafeAreaView>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.statusDot}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function timeSince(timestamp: string): string {
  const sec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  speedContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  speedValue: {
    fontSize: 96,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 100,
  },
  speedUnit: {
    fontSize: 18,
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: -4,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    width: '47%',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  tripCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  tripLabel: {
    fontSize: 11,
    color: COLORS.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tripName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  tripTime: {
    fontSize: 13,
    color: COLORS.muted,
  },
  controls: {
    gap: 12,
    marginBottom: 24,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.card,
  },
  button: {
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.dim,
    marginTop: 'auto',
    paddingBottom: 12,
  },
});
