/**
 * 세그먼트 상세 모달 — 구간 클릭 시 운영 규칙과 현재 상태 설명
 */
import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSegmentDetail } from '../hooks/useSegmentDetail';
import type { MapSegment, VehicleType } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../types';

interface Props {
  segment: MapSegment | null;
  vehicleType?: VehicleType;
  onClose: () => void;
}

export function SegmentDetailModal({ segment, vehicleType = 'general', onClose }: Props) {
  const { detail, loading } = useSegmentDetail(segment?.id ?? null, vehicleType);

  if (!segment) return null;

  return (
    <Modal transparent animationType="slide" visible={!!segment} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* 헤더 */}
          <View style={styles.header}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[segment.overallStatus] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{segment.name}</Text>
              <Text style={styles.subtitle}>{segment.roadName} · {STATUS_LABELS[segment.overallStatus]}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="닫기"
              accessibilityRole="button"
            >
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 20 }} />
          ) : detail ? (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {detail.regulations.map((reg, i) => (
                <View key={i} style={styles.ruleCard}>
                  <View style={[styles.ruleStatusBar, { backgroundColor: STATUS_COLORS[reg.status] }]} />
                  <View style={styles.ruleContent}>
                    <Text style={styles.ruleStatus}>{STATUS_LABELS[reg.status]}</Text>
                    <Text style={styles.ruleReason}>{reg.reason}</Text>
                    {reg.description && (
                      <Text style={styles.ruleDesc}>{reg.description}</Text>
                    )}
                    {reg.activeRule && (
                      <Text style={styles.ruleTime}>
                        {reg.activeRule.dayType === 'weekday' ? '평일' : reg.activeRule.dayType} {reg.activeRule.startTime} ~ {reg.activeRule.endTime}
                      </Text>
                    )}
                    {reg.exceptions.length > 0 && (
                      <Text style={styles.ruleExceptions}>
                        예외: {reg.exceptions.map((e) => e.label).join(', ')}
                      </Text>
                    )}
                    {reg.penaltyInfo && (
                      <Text style={styles.rulePenalty}>{reg.penaltyInfo}</Text>
                    )}
                    {reg.minutesUntilChange != null && (
                      <Text style={styles.ruleChange}>
                        상태 변경까지 {reg.minutesUntilChange}분
                      </Text>
                    )}
                  </View>
                </View>
              ))}

              {detail.segment.district && (
                <Text style={styles.meta}>
                  {detail.segment.city} {detail.segment.district} · {detail.segment.segmentType === 'central' ? '중앙차로' : '가로변'}
                </Text>
              )}
            </ScrollView>
          ) : (
            <Text style={styles.errorText}>상세 정보를 불러올 수 없습니다.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f0f0f0', borderRadius: 8 },
  closeBtnText: { fontSize: 14, color: '#555' },
  body: { padding: 16 },
  ruleCard: { flexDirection: 'row', backgroundColor: '#fafafa', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
  ruleStatusBar: { width: 4 },
  ruleContent: { flex: 1, padding: 12 },
  ruleStatus: { fontSize: 15, fontWeight: '600', color: '#333' },
  ruleReason: { fontSize: 13, color: '#555', marginTop: 4 },
  ruleDesc: { fontSize: 12, color: '#777', marginTop: 4 },
  ruleTime: { fontSize: 12, color: '#666', marginTop: 6, fontWeight: '500' },
  ruleExceptions: { fontSize: 12, color: '#4CAF50', marginTop: 4 },
  rulePenalty: { fontSize: 12, color: '#F44336', marginTop: 4, fontWeight: '500' },
  ruleChange: { fontSize: 12, color: '#FF9800', marginTop: 4, fontWeight: '500' },
  meta: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },
  errorText: { textAlign: 'center', color: '#999', marginTop: 20, fontSize: 14 },
});
