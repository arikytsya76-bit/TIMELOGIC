import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useAttendance } from '../../context/AttendanceContext';
import { useTheme, ThemeMode, useColors } from '../../context/ThemeContext';
import { Shadow } from '../../constants/theme';
import { getLeaveBalances, LeaveBalance } from '../../services/leaveService';
import StatusBadge from '../../components/StatusBadge';

import { SOCKET_URL } from '../../config';
const API_BASE = SOCKET_URL; // real IP — works on phone, not localhost

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { reset: resetAttendance } = useAttendance();
  const C = useColors();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    setLoadingBalances(true);
    getLeaveBalances().then(setBalances).catch(() => {}).finally(() => setLoadingBalances(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { resetAttendance(); logout(); } },
    ]);
  };

  if (!user) return null;

  const faceUrl = user.profileImageUrl ? `${API_BASE}${user.profileImageUrl}?v=${encodeURIComponent(user.id)}` : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.avatarSection}>
          {faceUrl ? (
            <Image source={{ uri: faceUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{user.firstName[0]}{user.lastName[0]}</Text>
            </View>
          )}
          <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.empId}>{user.employeeCode ?? user.email}</Text>
          <View style={styles.badgeRow}>
            <StatusBadge status={user.status} />
            <View style={[styles.roleBadge, { backgroundColor: C.primaryBg }]}>
              <Text style={[styles.roleText, { color: C.primary }]}>{user.role}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <View style={styles.readOnlyRow}>
            <Ionicons name="lock-closed-outline" size={11} color={C.gray400} />
            <Text style={styles.readOnlyText}>Profile is managed by your administrator</Text>
          </View>
          {[
            { icon: 'mail-outline', label: 'Email', value: user.email },
            { icon: 'id-card-outline', label: 'Employee Code', value: (user as any).employeeCode ?? '—' },
            { icon: 'people-outline', label: 'Role', value: user.role },
            { icon: 'time-outline', label: 'Shift Type', value: user.shiftType },
          ].map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name={row.icon as any} size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Leave Balances — {new Date().getFullYear()}</Text>
          {loadingBalances ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
          ) : balances.length === 0 ? (
            <Text style={styles.emptyText}>No leave balance data</Text>
          ) : (
            balances.map((lb) => (
              <View key={lb.type} style={styles.leaveRow}>
                <View style={[styles.leaveDot, { backgroundColor: lb.color }]} />
                <Text style={styles.leaveType}>{lb.label}</Text>
                <View style={styles.leaveBar}>
                  <View style={[styles.leaveBarFill, { width: `${lb.entitled > 0 ? (lb.remaining / lb.entitled) * 100 : 0}%`, backgroundColor: lb.color }]} />
                </View>
                <Text style={styles.leaveNums}>{lb.remaining}/{lb.entitled}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Appearance</Text>
          <View style={styles.themeRow}>
            {([
              ['light', 'sunny-outline', 'Light'],
              ['dark', 'moon-outline', 'Dark'],
              ['system', 'phone-portrait-outline', 'System'],
            ] as [ThemeMode, string, string][]).map(([m, icon, label]) => (
              <TouchableOpacity
                key={m}
                onPress={() => setThemeMode(m)}
                style={[styles.themeBtn, themeMode === m && { borderColor: C.primary, backgroundColor: C.primaryBg }]}
                activeOpacity={0.8}
              >
                <Ionicons name={icon as any} size={20} color={themeMode === m ? C.primary : C.gray500} />
                <Text style={[styles.themeBtnText, themeMode === m && { color: C.primary, fontWeight: '700' as const }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={C.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    avatarSection: { alignItems: 'center', marginBottom: 24 },
    avatarCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...Shadow.lg },
    avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 12, borderWidth: 3, borderColor: C.success },
    avatarInitials: { fontSize: 34, fontWeight: '800', color: '#fff' },
    name: { fontSize: 22, fontWeight: '800', color: C.text },
    empId: { fontSize: 13, color: C.textMuted, marginTop: 4, marginBottom: 10 },
    badgeRow: { flexDirection: 'row', gap: 8 },
    roleBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    roleText: { fontSize: 11, fontWeight: '700' },
    card: { backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 14, ...Shadow.sm },
    cardTitle: { fontSize: 14, fontWeight: '700', color: C.gray700, marginBottom: 4 },
    readOnlyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
    readOnlyText: { fontSize: 11, color: C.textMuted },
    infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    infoIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    infoLabel: { fontSize: 11, color: C.textMuted },
    infoValue: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 1 },
    emptyText: { fontSize: 13, color: C.textMuted, fontStyle: 'italic', marginTop: 8 },
    leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    leaveDot: { width: 8, height: 8, borderRadius: 4 },
    leaveType: { fontSize: 12, color: C.gray600, width: 100 },
    leaveBar: { flex: 1, height: 6, backgroundColor: C.gray100, borderRadius: 3, overflow: 'hidden' },
    leaveBarFill: { height: '100%', borderRadius: 3 },
    leaveNums: { fontSize: 11, color: C.textMuted, width: 36, textAlign: 'right' },
    themeRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    themeBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.gray50 },
    themeBtnText: { fontSize: 11, fontWeight: '600', color: C.gray600 },
    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.dangerBg, borderRadius: 14, padding: 16, marginTop: 4 },
    logoutText: { fontSize: 15, fontWeight: '700', color: C.danger },
  });
}
