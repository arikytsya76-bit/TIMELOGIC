import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAttendance } from '../../context/AttendanceContext';
import { useColors } from '../../context/ThemeContext';
import { Shadow } from '../../constants/theme';
import { BREAK_TYPES } from '../../constants/types';

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

export default function BreakScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { attendance, startBreak, endBreak, activeBreakStartTime } = useAttendance();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  // If we came from HomeScreen with a specific type, pre-select it
  const initialType = route.params?.breakType ?? BREAK_TYPES[0];
  const [selected, setSelected] = useState(initialType);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  // Is there already an active break? (either from navigation or restored from backend)
  const isActive = attendance.onBreak;
  const currentBreakType = isActive
    ? BREAK_TYPES.find((b) => b.type === attendance.breakType) ?? selected
    : selected;

  // Elapsed time in seconds — computed from the real server start time
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) { setElapsed(0); return; }
    // Compute initial elapsed from real start time (even if app restarted)
    const startMs = activeBreakStartTime?.getTime() ?? Date.now();
    const update = () => setElapsed(Math.floor((Date.now() - startMs) / 1000));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [isActive, activeBreakStartTime]);

  // Pulse animation while on break
  useEffect(() => {
    if (!isActive) { pulse.setValue(1); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isActive]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const overLimit = mins >= currentBreakType.maxMinutes;

  const handleStart = async () => {
    setStarting(true);
    try {
      await startBreak(selected.type);
    } catch (err: any) {
      Alert.alert('Cannot Start Break', err?.message ?? 'Could not start break.');
    } finally { setStarting(false); }
  };

  const handleEnd = () => {
    Alert.alert(
      'End Break',
      `End your ${currentBreakType.label}?\nDuration: ${pad(mins)}m ${pad(secs)}s`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Break',
          onPress: async () => {
            setEnding(true);
            try {
              await endBreak();
              Alert.alert('Break Ended', `${currentBreakType.label} ended.\n${pad(mins)}m ${pad(secs)}s total.`, [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not end break.');
            } finally { setEnding(false); }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => {
            if (isActive) {
              Alert.alert('Break Active', 'Please end your break before leaving.');
            } else {
              navigation.goBack();
            }
          }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.gray700} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{isActive ? 'On Break' : 'Take a Break'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* Break type selector — only shown when NOT on a break */}
        {!isActive && (
          <View style={styles.typeSection}>
            <Text style={styles.sectionLabel}>Select Break Type</Text>
            <View style={styles.typeGrid}>
              {BREAK_TYPES.map((bt) => (
                <TouchableOpacity
                  key={bt.type}
                  style={[styles.typeCard, selected.type === bt.type && { borderColor: bt.color, borderWidth: 2, backgroundColor: bt.color + '10' }]}
                  onPress={() => setSelected(bt)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.typeIcon, { backgroundColor: bt.color + '18' }]}>
                    <Ionicons name={bt.icon as any} size={22} color={bt.color} />
                  </View>
                  <Text style={[styles.typeLabel, { color: C.text }]}>{bt.label}</Text>
                  <Text style={styles.typeMax}>{bt.maxMinutes}m max</Text>
                  {selected.type === bt.type && <View style={[styles.selectedDot, { backgroundColor: bt.color }]} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Timer — shown when on a break */}
        {isActive && (
          <View style={styles.timerSection}>
            <View style={[styles.breakIconWrap, { backgroundColor: currentBreakType.color + '18' }]}>
              <Ionicons name={currentBreakType.icon as any} size={36} color={currentBreakType.color} />
            </View>
            <Text style={[styles.breakLabel, { color: C.text }]}>{currentBreakType.label}</Text>
            <Text style={styles.breakSince}>
              Started at {attendance.breakStartTime ?? '—'}
            </Text>
            <Animated.View style={[
              styles.timerRing,
              { borderColor: overLimit ? C.danger : currentBreakType.color, transform: [{ scale: pulse }] },
            ]}>
              <Text style={[styles.timerText, { color: overLimit ? C.danger : currentBreakType.color }]}>
                {pad(mins)}:{pad(secs)}
              </Text>
              <Text style={styles.timerSub}>
                {overLimit ? '⚠ Over limit!' : `/ ${currentBreakType.maxMinutes}:00 max`}
              </Text>
            </Animated.View>
            {overLimit && (
              <View style={[styles.warnBanner, { backgroundColor: C.dangerBg }]}>
                <Ionicons name="warning-outline" size={16} color={C.dangerDark} />
                <Text style={[styles.warnText, { color: C.dangerDark }]}>
                  You've exceeded the maximum break duration. Please return to work.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.actionArea}>
        {!isActive ? (
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: selected.color }, starting && { opacity: 0.6 }]}
            onPress={handleStart}
            disabled={starting}
          >
            {starting ? <ActivityIndicator color="#fff" /> : <Ionicons name="play" size={20} color="#fff" />}
            <Text style={styles.startBtnText}>
              {starting ? 'Starting...' : `Start ${selected.label}`}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.endBtn, { borderColor: C.danger, backgroundColor: C.dangerBg }, ending && { opacity: 0.6 }]}
            onPress={handleEnd}
            disabled={ending}
          >
            {ending ? <ActivityIndicator color={C.danger} /> : <Ionicons name="stop-circle-outline" size={20} color={C.danger} />}
            <Text style={[styles.endBtnText, { color: C.danger }]}>
              {ending ? 'Ending...' : 'Break Over'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { padding: 6, backgroundColor: C.gray100, borderRadius: 10 },
    topTitle: { fontSize: 17, fontWeight: '700', color: C.text },
    content: { flex: 1, paddingHorizontal: 20 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: C.gray600, marginBottom: 12 },
    typeSection: { marginTop: 8 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    typeCard: {
      width: '47%', backgroundColor: C.gray50, borderRadius: 14,
      padding: 14, borderWidth: 1, borderColor: C.gray200,
      alignItems: 'center', gap: 6, position: 'relative',
    },
    typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    typeLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
    typeMax: { fontSize: 11, color: C.textMuted },
    selectedDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
    timerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    breakIconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    breakLabel: { fontSize: 22, fontWeight: '800' },
    breakSince: { fontSize: 13, color: '#94A3B8' },
    timerRing: {
      width: 180, height: 180, borderRadius: 90,
      borderWidth: 6, alignItems: 'center', justifyContent: 'center',
      ...Shadow.md,
    },
    timerText: { fontSize: 40, fontWeight: '800' },
    timerSub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
    warnBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 10, padding: 12, marginTop: 8, width: '90%',
    },
    warnText: { fontSize: 12, flex: 1, lineHeight: 16 },
    actionArea: { padding: 24, paddingBottom: 32 },
    startBtn: {
      borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, ...Shadow.md,
    },
    startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    endBtn: {
      borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, borderWidth: 2,
    },
    endBtnText: { fontSize: 16, fontWeight: '700' },
  });
}
