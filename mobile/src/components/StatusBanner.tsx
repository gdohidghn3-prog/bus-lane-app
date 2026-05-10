/**
 * 상단 상태 배너 — 가장 가까운 위험 세그먼트 경고
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ProximityAlert } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../types';

interface Props {
  alerts: ProximityAlert[];
}

export function StatusBanner({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <View
        style={[styles.container, { backgroundColor: STATUS_COLORS.allowed }]}
        accessibilityRole="alert"
        accessibilityLabel="주변에 규제 구간이 없습니다"
      >
        <Text style={styles.statusText}>주변에 규제 구간이 없습니다</Text>
      </View>
    );
  }

  const topAlert = alerts[0]; // 가장 가까운
  const alertLabel = `${STATUS_LABELS[topAlert.status]} — ${topAlert.segmentName}, ${topAlert.distanceMeters}미터, ${topAlert.reason}${topAlert.penaltyInfo ? `, ${topAlert.penaltyInfo}` : ''}`;

  return (
    <View
      style={[styles.container, { backgroundColor: STATUS_COLORS[topAlert.status] }]}
      accessibilityRole="alert"
      accessibilityLabel={alertLabel}
    >
      <Text style={styles.statusText}>
        {STATUS_LABELS[topAlert.status]} — {topAlert.segmentName}
      </Text>
      <Text style={styles.detailText}>
        {topAlert.distanceMeters}m | {topAlert.reason}
      </Text>
      {topAlert.penaltyInfo && (
        <Text style={styles.penaltyText}>{topAlert.penaltyInfo}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 14,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  detailText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },
  penaltyText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
    fontStyle: 'italic',
  },
});
