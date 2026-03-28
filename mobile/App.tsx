import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { agentsCol, getDocs, query, limit } from './lib/supabase';
import { startTracking, stopTracking, isLocationEnabled } from './lib/locationService';
import { startShift, endShift, getActiveShift, type ActiveShift } from './lib/shiftManager';
import { getQueuedCount, flushQueue } from './lib/offlineQueue';
import { startAllMonitors, stopAllMonitors, updateTripId } from './lib/tamperDetector';

const COLORS = {
  bg: '#0F1117', panel: '#1A1D27', card: '#242837', accent: '#276EF1',
  green: '#05A357', amber: '#FF9500', red: '#E11900',
  text: '#FFFFFF', muted: '#8E8E93', dim: '#5E5E63',
};

type AppScreen = 'idle' | 'confirming' | 'tracking';

export default function App() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>('idle');
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [speed, setSpeed] = useState(0);
  const [battery, setBattery] = useState(100);
  const [connected, setConnected] = useState(true);
  const [locationOn, setLocationOn] = useState(true);
  const [pingCount, setPingCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [confirmLat, setConfirmLat] = useState<number | null>(null);
  const [confirmLng, setConfirmLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function init() {
      const snap = await getDocs(query(agentsCol, limit(1)));
      if (!snap.empty) setAgentId(snap.docs[0].id);
      const shift = await getActiveShift();
      if (shift) { setActiveShift(shift); setScreen('tracking'); startAllMonitors(shift.agent_id, shift.id); }
      setBattery(Math.round((await Battery.getBatteryLevelAsync()) * 100));
      setLocationOn(await isLocationEnabled());
    }
    init();
    const unsub = NetInfo.addEventListener(state => {
      setConnected(!!state.isConnected);
      if (state.isConnected) flushQueue().then(({ flushedPings }) => { if (flushedPings > 0) setPingCount(c => c + flushedPings); });
    });
    return () => { unsub(); if (statsInterval.current) clearInterval(statsInterval.current); };
  }, []);

  useEffect(() => {
    if (screen !== 'tracking') { if (statsInterval.current) clearInterval(statsInterval.current); return; }
    statsInterval.current = setInterval(async () => {
      setBattery(Math.round((await Battery.getBatteryLevelAsync()) * 100));
      setLocationOn(await isLocationEnabled());
      setQueuedCount(await getQueuedCount());
    }, 5000);
    return () => { if (statsInterval.current) clearInterval(statsInterval.current); };
  }, [screen]);

  const handleStartShiftTap = useCallback(async () => {
    if (!agentId) { Alert.alert('Error', 'No agent configured'); return; }
    setGettingLocation(true); setScreen('confirming');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Location permission is needed'); setScreen('idle'); setGettingLocation(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setConfirmLat(loc.coords.latitude); setConfirmLng(loc.coords.longitude);
    } catch { Alert.alert('GPS Error', 'Could not get your location. Make sure GPS is enabled.'); setScreen('idle'); }
    setGettingLocation(false);
  }, [agentId]);

  const handleConfirmStart = useCallback(async () => {
    if (!agentId || confirmLat === null || confirmLng === null) return;
    const shift = await startShift(agentId, confirmLat, confirmLng);
    if (!shift) { Alert.alert('Error', 'Failed to start shift'); setScreen('idle'); return; }
    setActiveShift(shift); updateTripId(shift.id);
    const started = await startTracking();
    if (started) { setScreen('tracking'); startAllMonitors(agentId, shift.id); }
    else { Alert.alert('Permission Required', 'Background location permission is needed'); setScreen('idle'); }
  }, [agentId, confirmLat, confirmLng]);

  const handleEndShift = useCallback(async () => {
    Alert.alert('End Shift', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Shift', style: 'destructive', onPress: async () => {
        await stopTracking(); await endShift(); stopAllMonitors(); await flushQueue();
        setScreen('idle'); setActiveShift(null); setSpeed(0); setPingCount(0);
        setConfirmLat(null); setConfirmLng(null);
      }},
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Tracker</Text>
        <View style={styles.statusRow}>
          <StatusDot color={connected ? COLORS.green : COLORS.red} label={connected ? 'Online' : 'Offline'} />
          <StatusDot color={locationOn ? COLORS.green : COLORS.red} label={locationOn ? 'GPS On' : 'GPS Off'} />
        </View>
      </View>

      {screen === 'idle' && (
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>🏍️</Text>
          <Text style={styles.idleTitle}>Ready to start</Text>
          <Text style={styles.idleSubtitle}>Tap below to begin your shift</Text>
          <TouchableOpacity style={[styles.bigButton, { backgroundColor: COLORS.green }]} onPress={handleStartShiftTap}>
            <Text style={styles.bigButtonText}>Start Shift</Text>
          </TouchableOpacity>
        </View>
      )}

      {screen === 'confirming' && (
        <View style={styles.centerContent}>
          {gettingLocation ? (
            <>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={[styles.idleTitle, { marginTop: 20 }]}>Getting your location...</Text>
            </>
          ) : confirmLat !== null && confirmLng !== null ? (
            <>
              <Text style={styles.confirmTitle}>Confirm your location</Text>
              <View style={styles.locationCard}>
                <Text style={styles.locationLabel}>📍 You are at:</Text>
                <Text style={styles.locationCoords}>{confirmLat.toFixed(5)}, {confirmLng.toFixed(5)}</Text>
              </View>
              <TouchableOpacity style={[styles.bigButton, { backgroundColor: COLORS.green }]} onPress={handleConfirmStart}>
                <Text style={styles.bigButtonText}>Confirm & Start Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ padding: 12, marginTop: 12 }} onPress={() => { setScreen('idle'); setConfirmLat(null); setConfirmLng(null); }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.muted }}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}

      {screen === 'tracking' && (
        <>
          <View style={styles.speedContainer}>
            <Text style={styles.speedValue}>{Math.round(speed)}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
            <View style={[styles.trackingBadge, { backgroundColor: COLORS.green + '22' }]}>
              <View style={[styles.pulseDot, { backgroundColor: COLORS.green }]} />
              <Text style={[styles.badgeText, { color: COLORS.green }]}>SHIFT ACTIVE</Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <StatCard label="Battery" value={`${battery}%`} color={battery > 50 ? COLORS.green : battery > 20 ? COLORS.amber : COLORS.red} />
            <StatCard label="Pings" value={String(pingCount)} color={COLORS.accent} />
            <StatCard label="Last Ping" value={lastPing ? timeSince(lastPing) : '--'} color={COLORS.muted} />
            <StatCard label="Queued" value={String(queuedCount)} color={queuedCount > 0 ? COLORS.amber : COLORS.dim} />
          </View>
          {activeShift && (
            <View style={styles.shiftCard}>
              <Text style={styles.shiftLabel}>Shift started</Text>
              <Text style={styles.shiftTime}>{new Date(activeShift.started_at).toLocaleTimeString()}</Text>
              <Text style={styles.shiftCoords}>From: {activeShift.start_lat.toFixed(4)}, {activeShift.start_lng.toFixed(4)}</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.bigButton, { backgroundColor: COLORS.red }]} onPress={handleEndShift}>
            <Text style={styles.bigButtonText}>End Shift</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.footer}>Agent: {agentId ? agentId.substring(0, 8) + '...' : 'Loading...'}</Text>
    </SafeAreaView>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (<View style={styles.statusDot}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.statusLabel, { color }]}>{label}</Text></View>);
}
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (<View style={styles.statCard}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, { color }]}>{value}</Text></View>);
}
function timeSince(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5) return 'now'; if (s < 60) return `${s}s`; return `${Math.floor(s / 60)}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1117', paddingHorizontal: 24, paddingTop: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  statusRow: { flexDirection: 'row', gap: 16 },
  statusDot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: '600' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  idleTitle: { fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 8 },
  idleSubtitle: { fontSize: 15, color: '#8E8E93', marginBottom: 32 },
  confirmTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 24 },
  locationCard: { backgroundColor: '#242837', borderRadius: 16, padding: 24, marginBottom: 32, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#276EF133' },
  locationLabel: { fontSize: 14, color: '#8E8E93', marginBottom: 8 },
  locationCoords: { fontSize: 20, fontWeight: '700', color: '#276EF1' },
  bigButton: { borderRadius: 16, padding: 20, width: '100%', alignItems: 'center' },
  bigButtonText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  speedContainer: { alignItems: 'center', marginBottom: 32 },
  speedValue: { fontSize: 96, fontWeight: '800', color: '#FFF', lineHeight: 100 },
  speedUnit: { fontSize: 18, color: '#8E8E93', fontWeight: '600', marginTop: -4 },
  trackingBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: { backgroundColor: '#242837', borderRadius: 12, padding: 16, width: '47%' },
  statLabel: { fontSize: 11, color: '#5E5E63', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '700' },
  shiftCard: { backgroundColor: '#1A1D27', borderRadius: 12, padding: 16, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#05A357' },
  shiftLabel: { fontSize: 11, color: '#5E5E63', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  shiftTime: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  shiftCoords: { fontSize: 12, color: '#8E8E93' },
  footer: { textAlign: 'center', fontSize: 11, color: '#5E5E63', marginTop: 'auto', paddingBottom: 12 },
});
