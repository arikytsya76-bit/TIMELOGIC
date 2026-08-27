import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT:  { bg: Colors.successBg,  text: Colors.successDark, label: 'Present' },
  LATE:     { bg: Colors.warningBg,  text: Colors.warningDark, label: 'Late' },
  COMPLETELY_LATE: { bg: Colors.dangerBg, text: Colors.dangerDark, label: 'Completely Late' },
  ABSENT:   { bg: Colors.dangerBg,   text: Colors.dangerDark,  label: 'Absent' },
  ON_LEAVE: { bg: Colors.primaryBg,  text: Colors.primaryDark, label: 'On Leave' },
  HALF_DAY: { bg: Colors.orangeBg,   text: Colors.orange,      label: 'Half Day' },
  WEEKEND:  { bg: Colors.gray100,    text: Colors.gray500,     label: 'Weekend' },
  HOLIDAY:  { bg: Colors.tealBg,     text: Colors.teal,        label: 'Holiday' },
  ACTIVE:   { bg: Colors.successBg,  text: Colors.successDark, label: 'Active' },
  SUSPENDED:{ bg: Colors.dangerBg,   text: Colors.dangerDark,  label: 'Suspended' },
  REVIEW_REQUIRED: { bg: Colors.orangeBg, text: Colors.orange, label: 'Under Review' },
};

interface Props {
  status: string;
  small?: boolean;
}

export default function StatusBadge({ status, small = false }: Props) {
  const config = STATUS_MAP[status] ?? { bg: Colors.gray100, text: Colors.gray500, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: config.text }, small && styles.smallText]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  smallText: { fontSize: 10 },
});
