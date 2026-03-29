import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { agentsCol, getDocs, query, limit } from './lib/supabase';
import { startTracking, stopTracking, isLocationEnabled, setTrackingIds } from './lib/locationService';
import { startShift, endShift, getActiveShift, type ActiveShift } from './lib/shiftManager';
import { getQueuedCount, flushQueue } from './lib/offlineQueue';
import { startAllMonitors, stopAllMonitors, updateTripId } from './lib/tamperDetector';

// Uber-style colors
const C = {
  bg: '#F6F8FA',
  white: '#FFFFFF',
  blue: '#0286FF',
  blueBg: '#EBF4FF',
  green: '#0CC25F',
  greenBg: '#F0FFF4',
  red: '#F56565',
  redBg: '#FFF5F5',
  amber: '#EAB308',
  dark: '#333333',
  gray: '#858585',
  lightGray: '#EEEEEE',
  border: '#E5E5E5',
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
      if (shift) { setActiveShift(shift); setScreen('tracking'); await setTrackingIds(shift.agent_id, shift.id); startAllMonitors(shift.agent_id, shift.id); }
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
    } catch { Alert.alert('GPS Error', 'Could not get your location.'); setScreen('idle'); }
    setGettingLocation(false);
  }, [agentId]);

  const handleConfirmStart = useCallback(async () => {
    if (!agentId || confirmLat === null || confirmLng === null) return;
    const shift = await startShift(agentId, confirmLat, confirmLng);
    if (!shift) { Alert.alert('Error', 'Failed to start shift'); setScreen('idle'); return; }
    setActiveShift(shift); updateTripId(shift.id);
    await setTrackingIds(agentId, shift.id);
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
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Fleet Tracker</Text>
        <View style={s.statusRow}>
          <StatusPill color={connected ? C.green : C.red} bg={connected ? C.greenBg : C.redBg} label={connected ? 'Online' : 'Offline'} />
          <StatusPill color={locationOn ? C.green : C.red} bg={locationOn ? C.greenBg : C.redBg} label={locationOn ? 'GPS On' : 'GPS Off'} />
        </View>
      </View>

      {/* ── IDLE ── */}
      {screen === 'idle' && (
        <View style={s.center}>
          <View style={s.heroCircle}>
            <Text style={{ fontSize: 48 }}>🏍️</Text>
          </View>
          <Text style={s.heroTitle}>Ready to start</Text>
          <Text style={s.heroSub}>Tap below to begin your shift</Text>
          <TouchableOpacity style={[s.pillBtn, { backgroundColor: C.blue }]} onPress={handleStartShiftTap}>
            <Text style={s.pillBtnText}>Start Shift</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── CONFIRMING ── */}
      {screen === 'confirming' && (
        <View style={s.center}>
          {gettingLocation ? (
            <>
              <ActivityIndicator size="large" color={C.blue} />
              <Text style={[s.heroTitle, { marginTop: 20 }]}>Getting your location...</Text>
            </>
          ) : confirmLat !== null && confirmLng !== null ? (
            <>
              <Text style={s.heroTitle}>Confirm your location</Text>
              <View style={s.locCard}>
                <View style={s.locDot} />
                <View>
                  <Text style={s.locLabel}>Your current position</Text>
                  <Text style={s.locCoords}>{confirmLat.toFixed(5)}, {confirmLng.toFixed(5)}</Text>
                </View>
              </View>
              <TouchableOpacity style={[s.pillBtn, { backgroundColor: C.blue }]} onPress={handleConfirmStart}>
                <Text style={s.pillBtnText}>Confirm & Start Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={() => { setScreen('idle'); setConfirmLat(null); setConfirmLng(null); }}>
                <Text style={s.linkBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      )}

      {/* ── TRACKING ── */}
      {screen === 'tracking' && (
        <View style={{ flex: 1 }}>
          {/* Speed hero */}
          <View style={s.speedCard}>
            <Text style={s.speedVal}>{Math.round(speed)}</Text>
            <Text style={s.speedUnit}>km/h</Text>
            <View style={s.liveBadge}>
              <View style={[s.liveDot, { backgroundColor: C.green }]} />
              <Text style={[s.liveText, { color: C.green }]}>SHIFT ACTIVE</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            <Stat label="Battery" value={`${battery}%`} color={battery > 50 ? C.green : battery > 20 ? C.amber : C.red} />
            <Stat label="Pings" value={String(pingCount)} color={C.blue} />
          </View>
          <View style={s.statsRow}>
            <Stat label="Last Ping" value={lastPing ? timeSince(lastPing) : '--'} color={C.gray} />
            <Stat label="Queued" value={String(queuedCount)} color={queuedCount > 0 ? C.amber : C.gray} />
          </View>

          {/* Shift info */}
          {activeShift && (
            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <View style={s.infoIcon}><Text style={{ fontSize: 16 }}>📍</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoLabel}>Started at</Text>
                  <Text style={s.infoValue}>{new Date(activeShift.started_at).toLocaleTimeString()}</Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.infoRow}>
                <View style={s.infoIcon}><Text style={{ fontSize: 16 }}>🗺️</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoLabel}>Start location</Text>
                  <Text style={s.infoValue}>{activeShift.start_lat.toFixed(4)}, {activeShift.start_lng.toFixed(4)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* End shift */}
          <View style={{ marginTop: 'auto', paddingBottom: 16 }}>
            <TouchableOpacity style={[s.pillBtn, { backgroundColor: C.red }]} onPress={handleEndShift}>
              <Text style={s.pillBtnText}>End Shift</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Footer */}
      <Text style={s.footer}>Agent: {agentId ? agentId.substring(0, 8) + '...' : 'Loading...'}</Text>
    </SafeAreaView>
  );
}

function StatusPill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <View style={[s.statusPill, { backgroundColor: bg }]}>
      <View style={[s.statusDot, { backgroundColor: color }]} />
      <Text style={[s.statusText, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function timeSince(ts: string): string {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 5) return 'now'; if (sec < 60) return `${sec}s`; return `${Math.floor(sec / 60)}m`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 16 },

  // Header
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: C.dark, marginBottom: 10 },
  statusRow: { flexDirection: 'row', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  // Center content
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },
  heroCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: C.dark, marginBottom: 6 },
  heroSub: { fontSize: 15, color: C.gray, marginBottom: 28 },

  // Pill button (Uber style)
  pillBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 50, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  pillBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  linkBtn: { padding: 14, marginTop: 8 },
  linkBtnText: { fontSize: 15, fontWeight: '600', color: C.gray },

  // Location confirm card
  locCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.white, borderRadius: 16, padding: 20, marginBottom: 28, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  locDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.blue },
  locLabel: { fontSize: 13, color: C.gray, marginBottom: 2 },
  locCoords: { fontSize: 16, fontWeight: '700', color: C.dark },

  // Speed card
  speedCard: {
    backgroundColor: C.white, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  speedVal: { fontSize: 72, fontWeight: '800', color: C.dark, lineHeight: 78 },
  speedUnit: { fontSize: 16, color: C.gray, fontWeight: '600', marginTop: -2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.greenBg },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  statLabel: { fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '700' },

  // Info card
  infoCard: {
    backgroundColor: C.white, borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 12, color: C.gray },
  infoValue: { fontSize: 15, fontWeight: '600', color: C.dark },
  divider: { height: 1, backgroundColor: C.lightGray, marginVertical: 8, marginLeft: 50 },

  // Footer
  footer: { textAlign: 'center', fontSize: 11, color: C.gray, paddingBottom: 10 },
});
