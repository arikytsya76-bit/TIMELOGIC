import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Shadow } from '../../constants/theme';
import { getHistoryApi, AttendanceRecord } from '../../services/attendanceService';
import AttendanceCard from '../../components/AttendanceCard';

const FILTERS = ['All', 'Present', 'Late', 'Absent', 'Leave'];

function formatRecord(r: AttendanceRecord, timezone = 'Africa/Lagos') {
  const date = new Date(r.date);
  const dayLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmt = (t: string | null) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone }) : null;
  const bMin = r.totalBreakMinutes ?? 0;
  return {
    id: r.id, date: r.date, dayLabel,
    checkIn: fmt(r.clockInTime), checkOut: fmt(r.clockOutTime),
    status: r.status,
    totalHours: r.totalWorkHours ?? '—',
    totalBreak: bMin > 0 ? `${Math.floor(bMin / 60)}h ${bMin % 60}m` : '—',
    wifiVerified: r.wifiVerified, deviceVerified: r.deviceVerified,
  };
}

export default function HistoryScreen() {
  const C = useColors();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [filter, setFilter] = useState('All');
  const [records, setRecords] = useState<ReturnType<typeof formatRecord>[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await getHistoryApi();
      setRecords(data.map((record) => formatRecord(record, user?.organization?.timezone || 'Africa/Lagos')));
    } catch (err: any) { setError(err?.message ?? 'Failed to load history.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = records.filter((r) => {
    if (filter === 'All') return true;
    if (filter === 'Present') return r.status === 'PRESENT';
    if (filter === 'Late') return r.status === 'LATE';
    if (filter === 'Absent') return r.status === 'ABSENT';
    if (filter === 'Leave') return r.status === 'ON_LEAVE';
    return true;
  });

  const present = records.filter((r) => r.status === 'PRESENT').length;
  const late    = records.filter((r) => r.status === 'LATE').length;
  const absent  = records.filter((r) => r.status === 'ABSENT').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>{new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
      </View>

      <View style={styles.summaryRow}>
        {[
          { label: 'Present', count: present, color: C.success },
          { label: 'Late',    count: late,    color: C.warning },
          { label: 'Absent',  count: absent,  color: C.danger },
          { label: 'Rate',    count: `${Math.round((present / (present + late + absent || 1)) * 100)}%`, color: C.primary },
        ].map((s) => (
          <View key={s.label} style={[styles.summaryCard, { borderTopColor: s.color }]}>
            <Text style={[styles.summaryNum, { color: s.color }]}>{s.count}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && { backgroundColor: C.primary, borderColor: C.primary }]}>
            <Text style={[styles.chipText, filter === f && { color: '#fff' }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={32} color={C.danger} />
          <Text style={[styles.emptyText, { color: C.danger }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.retryBtn, { backgroundColor: C.primaryBg }]}>
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AttendanceCard record={item} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color={C.gray300} />
              <Text style={styles.emptyText}>No records found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
    title: { fontSize: 22, fontWeight: '800', color: C.text },
    subtitle: { fontSize: 13, color: C.textMuted, marginTop: 2 },
    summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
    summaryCard: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 10, alignItems: 'center', borderTopWidth: 3, ...Shadow.sm },
    summaryNum: { fontSize: 20, fontWeight: '800' },
    summaryLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 },
    chipText: { fontSize: 12, fontWeight: '600', color: C.gray600 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 14, color: C.textMuted },
    retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  });
}
