import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, RefreshControl, Image, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useColors } from '../../context/ThemeContext';
import { Shadow } from '../../constants/theme';
import { getLeaveBalances, LeaveBalance } from '../../services/leaveService';
import { checkInApi, requestChallenge } from '../../services/attendanceService';
import { api } from '../../services/api';
import { SOCKET_URL } from '../../config';
import { BREAK_TYPES } from '../../constants/types';
import StatusBadge from '../../components/StatusBadge';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { user, logout: authLogout } = useAuth();
  const { attendance, loading: attLoading, refreshStatus, setCheckedIn, checkOut, reset: resetAttendance, totalWorkHours } = useAttendance();
  const navigation = useNavigation<any>();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [now, setNow] = useState(new Date());
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // ── Challenge (time-based code) modal state ──
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [challengeCode, setChallengeCode]       = useState('');   // code issued by backend
  const [enteredCode, setEnteredCode]           = useState('');   // what the user types
  const [challengeSession, setChallengeSession] = useState('');
  const [submittingCode, setSubmittingCode]     = useState(false);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    await refreshStatus();
    try {
      setLeavesLoading(true);
      const b = await getLeaveBalances();
      setLeaveBalances(b);
    } catch {} finally { setLeavesLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Check-in step 1: get session + request a verification code ───────────────
  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      // 1. Find the active session for this employee's org
      const sessionRes = await api.get<any>('/attendance/current-session');
      if (!sessionRes) {
        Alert.alert('No Active Session', 'Your admin has not started an attendance session yet. Please wait.');
        return;
      }
      const sid = sessionRes.sessionId;

      // 2. Ask backend for a one-time code (anti-automation challenge)
      const { code } = await requestChallenge(sid);

      // 3. Show the enter-code modal
      setChallengeSession(sid);
      setChallengeCode(code);
      setEnteredCode('');
      setChallengeVisible(true);
    } catch (err: any) {
      Alert.alert('Check-In Failed', err?.message ?? 'Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };


  // ── Check-in step 2: verify the typed code + submit ──────────────────────────
  const submitChallenge = async () => {
    if (enteredCode.trim().length !== 6) {
      Alert.alert('Enter the Code', 'Type the 6-digit code shown above to confirm it is really you.');
      return;
    }
    setSubmittingCode(true);
    try {
      const result = await checkInApi({ sessionId: challengeSession, challengeCode: enteredCode.trim() });
      setChallengeVisible(false);
      setCheckedIn(result.checkInTime!, result.status!);
      const penaltyNote = result.penalty && result.penalty > 0 ? `\n\n⚠️ Late penalty: ₦${result.penalty}` : '';
      Alert.alert('✓ Checked In', `Marked ${result.status} at ${result.checkInTime}${penaltyNote}`);
    } catch (err: any) {
      Alert.alert('Check-In Failed', err?.message ?? 'Please try again.');
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleCheckOut = () => {
    Alert.alert('Check Out', 'Are you sure you want to clock out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Check Out', style: 'destructive',
        onPress: async () => {
          try {
            await checkOut();
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Check-out failed.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { resetAttendance(); authLogout(); } },
    ]);
  };

  const handleBreak = (type: typeof BREAK_TYPES[0]) => {
    if (attendance.onBreak) { Alert.alert('Active Break', 'You already have an active break.'); return; }
    navigation.navigate('Break', { breakType: type });
  };

  const { hasCheckedIn, hasCheckedOut, status, checkInTime, checkOutTime, onBreak, breakType, breakStartTime } = attendance;
  const faceUri = user?.profileImageUrl ? `${SOCKET_URL}${user.profileImageUrl}?v=${encodeURIComponent(user.id)}` : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}, {user?.firstName} 👋</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={22} color={C.gray500} />
          </TouchableOpacity>
        </View>

        {/* Brand / Avatar */}
        <View style={styles.brandRow}>
          {faceUri ? (
            <Image source={{ uri: faceUri }} style={styles.faceAvatar} />
          ) : (
            <View style={styles.logoCircle}><Image source={require('../../../assets/logo.jpg')} style={styles.logoImg} resizeMode="contain" /></View>
          )}
          <View>
            <Text style={styles.brandName}>TimeLogic</Text>
            <Text style={styles.brandSub}>{user?.employeeCode ?? user?.email}</Text>
          </View>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusCardHeader}>
            <Text style={styles.statusCardTitle}>Today's Status</Text>
            {attLoading
              ? <ActivityIndicator size="small" color={C.primary} />
              : status ? <StatusBadge status={status} /> : null
            }
          </View>
          <View style={styles.statusRow}>
            {[
              { icon: 'log-in-outline',  label: 'Clock In',  value: checkInTime  ?? '—', color: C.primary },
              { icon: 'log-out-outline', label: 'Clock Out', value: checkOutTime ?? '—', color: C.orange },
              { icon: 'time-outline',    label: 'Shift',     value: user?.shiftType ?? '—', color: C.success },
            ].map((item, idx) => (
              <React.Fragment key={item.label}>
                <View style={styles.statusItem}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                  <Text style={styles.statusLabel}>{item.label}</Text>
                  <Text style={styles.statusValue}>{item.value}</Text>
                </View>
                {idx < 2 && <View style={styles.statusDivider} />}
              </React.Fragment>
            ))}
          </View>
          {onBreak && (
            <View style={styles.breakBanner}>
              <Ionicons name="cafe-outline" size={16} color={C.warning} />
              <Text style={styles.breakBannerText}>
                On {breakType?.replace(/_/g, ' ')} break since {breakStartTime}
              </Text>
            </View>
          )}
        </View>

        {/* Check In / Check Out / Completed */}
        {!hasCheckedOut ? (
          !hasCheckedIn ? (
            <TouchableOpacity
              style={[styles.checkInBtn, checkingIn && { opacity: 0.7 }]}
              onPress={handleCheckIn}
              disabled={checkingIn}
              activeOpacity={0.88}
            >
              {checkingIn
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="finger-print-outline" size={26} color="#fff" />
              }
              <View>
                <Text style={styles.checkBtnMain}>{checkingIn ? 'Checking in…' : 'Check In'}</Text>
                <Text style={styles.checkBtnSub}>{checkingIn ? 'Please wait' : 'Tap to start your day'}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.checkOutBtn} onPress={handleCheckOut} activeOpacity={0.88}>
              <Ionicons name="exit-outline" size={26} color={C.primary} />
              <View>
                <Text style={[styles.checkBtnMain, { color: C.primary }]}>Check Out</Text>
                <Text style={[styles.checkBtnSub, { color: C.textMuted }]}>Tap to end your shift</Text>
              </View>
            </TouchableOpacity>
          )
        ) : (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={26} color={C.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.completedText}>Day complete — see you next session!</Text>
              {totalWorkHours && (
                <Text style={{ fontSize: 12, color: C.successDark, marginTop: 2, opacity: 0.8 }}>
                  Total: {totalWorkHours} hours worked
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        {hasCheckedIn && !hasCheckedOut && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              {BREAK_TYPES.map((b) => (
                <TouchableOpacity key={b.type} style={styles.quickCard} onPress={() => b.type === 'LUNCH' || b.type === 'SHORT_BREAK' ? handleBreak(b) : Alert.alert('Coming Soon', 'This update is coming soon.')} activeOpacity={0.8}>
                  <View style={[styles.quickIcon, { backgroundColor: b.color + '18' }]}>
                    <Ionicons name={b.icon as any} size={22} color={b.color} />
                  </View>
                  <Text style={styles.quickLabel}>{b.label.split(' ')[0]}</Text>
                  <Text style={styles.quickSub}>{b.maxMinutes}m max</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.quickCard} onPress={() => navigation.navigate('LeaveRequest')} activeOpacity={0.8}>
                <View style={[styles.quickIcon, { backgroundColor: C.primaryBg }]}>
                  <Ionicons name="document-text-outline" size={22} color={C.primary} />
                </View>
                <Text style={styles.quickLabel}>Leave</Text>
                <Text style={styles.quickSub}>Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Leave Balances */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leave Balances</Text>
          {leavesLoading ? (
            <ActivityIndicator color={C.primary} />
          ) : leaveBalances.length === 0 ? (
            <Text style={styles.emptyText}>No leave data</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
              {leaveBalances.slice(0, 5).map((lb) => (
                <View key={lb.type} style={styles.leaveCard}>
                  <View style={[styles.leaveDot, { backgroundColor: lb.color }]} />
                  <Text style={styles.leaveLabel}>{lb.label}</Text>
                  <View style={styles.leaveCountRow}>
                    <Text style={[styles.leaveRemaining, { color: lb.color }]}>{lb.remaining}</Text>
                    <Text style={styles.leaveEntitled}>/{lb.entitled}</Text>
                  </View>
                  <Text style={styles.leaveSub}>days left</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* ── Verification code modal (anti-automation challenge) ── */}
      <Modal visible={challengeVisible} transparent animationType="fade" onRequestClose={() => setChallengeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={26} color={C.primary} />
            </View>
            <Text style={styles.modalTitle}>Confirm It's You</Text>
            <Text style={styles.modalSub}>Enter the verification code below to complete check-in.</Text>

            {/* The issued code (user must retype it) */}
            <View style={styles.codeDisplay}>
              <Text style={styles.codeDisplayText}>{challengeCode}</Text>
            </View>

            <TextInput
              style={styles.codeInput}
              value={enteredCode}
              onChangeText={(t) => setEnteredCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="Enter the 6-digit code"
              placeholderTextColor={C.gray400}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setChallengeVisible(false)} disabled={submittingCode}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, submittingCode && { opacity: 0.7 }]} onPress={submitChallenge} disabled={submittingCode}>
                {submittingCode
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmText}>Confirm Check-In</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe:            { flex: 1, backgroundColor: C.background },
    scroll:          { padding: 20, paddingBottom: 32 },
    header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    greeting:        { fontSize: 17, fontWeight: '700', color: C.text },
    date:            { fontSize: 12, color: C.textMuted, marginTop: 2 },
    logoutBtn:       { padding: 6, backgroundColor: C.gray100, borderRadius: 10 },
    brandRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    logoCircle:      { width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    logoImg:         { width: 40, height: 40 },
    faceAvatar:      { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.primary },
    brandName:       { fontSize: 18, fontWeight: '800', color: C.text },
    brandSub:        { fontSize: 12, color: C.textMuted },
    statusCard:      { backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 16, ...Shadow.md },
    statusCardHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    statusCardTitle: { fontSize: 14, fontWeight: '700', color: C.gray700 },
    statusRow:       { flexDirection: 'row', justifyContent: 'space-around' },
    statusItem:      { alignItems: 'center', gap: 4 },
    statusLabel:     { fontSize: 11, color: C.textMuted, marginTop: 2 },
    statusValue:     { fontSize: 14, fontWeight: '700', color: C.text },
    statusDivider:   { width: 1, backgroundColor: C.border },
    breakBanner:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.warningBg, borderRadius: 8, padding: 8, marginTop: 12 },
    breakBannerText: { fontSize: 12, color: C.warningDark, flex: 1 },
    checkInBtn:      { backgroundColor: C.primary, borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, ...Shadow.lg },
    checkOutBtn:     { backgroundColor: C.card, borderRadius: 18, borderWidth: 2, borderColor: C.primary, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, ...Shadow.sm },
    checkBtnMain:    { fontSize: 18, fontWeight: '800', color: '#fff' },
    checkBtnSub:     { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    completedBanner: { backgroundColor: C.successBg, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    completedText:   { fontSize: 14, fontWeight: '600', color: C.successDark },
    waitingBanner:   { backgroundColor: C.primaryBg, borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1.5, borderColor: C.primaryBorder },
    waitingTitle:    { fontSize: 16, fontWeight: '700' },
    waitingSub:      { fontSize: 13, marginTop: 3 },
    section:         { marginBottom: 20 },
    sectionTitle:    { fontSize: 14, fontWeight: '700', color: C.gray700, marginBottom: 12 },
    quickGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    quickCard:       { width: '30%', backgroundColor: C.card, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, ...Shadow.sm },
    quickIcon:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickLabel:      { fontSize: 12, fontWeight: '700', color: C.text },
    quickSub:        { fontSize: 10, color: C.textMuted },
    emptyText:       { fontSize: 13, color: C.textMuted, fontStyle: 'italic' },
    leaveCard:       { backgroundColor: C.card, borderRadius: 14, padding: 14, width: 110, alignItems: 'center', ...Shadow.sm },
    leaveDot:        { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
    leaveLabel:      { fontSize: 10, color: C.textMuted, textAlign: 'center', marginBottom: 4 },
    leaveCountRow:   { flexDirection: 'row', alignItems: 'baseline' },
    leaveRemaining:  { fontSize: 22, fontWeight: '800' },
    leaveEntitled:   { fontSize: 13, color: C.textMuted },
    leaveSub:        { fontSize: 10, color: C.textMuted, marginTop: 2 },

    // ── Challenge modal ──
    modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard:       { backgroundColor: C.card, borderRadius: 22, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' },
    modalIconWrap:   { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    modalTitle:      { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
    modalSub:        { fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
    codeDisplay:     { backgroundColor: C.primaryBg, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 14, borderWidth: 1, borderColor: C.primaryBorder },
    codeDisplayText: { fontSize: 30, fontWeight: '800', letterSpacing: 8, color: C.primary },
    codeInput:       { width: '100%', height: 52, borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12, backgroundColor: C.inputBg, fontSize: 18, fontWeight: '700', color: C.text, textAlign: 'center', letterSpacing: 4, marginBottom: 16 },
    modalBtns:       { flexDirection: 'row', gap: 10, width: '100%' },
    modalCancel:     { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    modalCancelText: { fontSize: 15, fontWeight: '700', color: C.textMuted },
    modalConfirm:    { flex: 2, height: 48, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
    modalConfirmText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
