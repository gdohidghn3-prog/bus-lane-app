/**
 * 메인 지도 화면 — 앱의 유일한 화면 (MVP)
 *
 * 1. 현재 위치 표시
 * 2. 주변 버스전용차로 세그먼트를 색상으로 표시
 * 3. 상단 배너에 가장 가까운 위험 경고
 * 4. 세그먼트 탭 → 상세 모달
 * G-06: 하단 정보바에 "표지판/법규 우선" 면책 문구 상시 노출
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocation } from '../hooks/useLocation';
import { useSegments } from '../hooks/useSegments';
import { useSettings } from '../context/SettingsContext';
import { SegmentOverlay } from '../components/SegmentOverlay';
import { StatusBanner } from '../components/StatusBanner';
import { SegmentDetailModal } from '../components/SegmentDetailModal';
import type { MapSegment } from '../types';

const SEOUL_CENTER = { latitude: 37.5665, longitude: 126.9780, latitudeDelta: 0.05, longitudeDelta: 0.05 };

export function MapScreen() {
  const { vehicleType } = useSettings();
  const { location, error: locError, permissionGranted, loading: locLoading } = useLocation();
  const { segments, alerts, loading: segLoading, error: segError, isOffline } = useSegments(location, vehicleType);
  const [selectedSegment, setSelectedSegment] = useState<MapSegment | null>(null);

  // 위치 권한 거부 시
  if (!locLoading && !permissionGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>위치 권한 필요</Text>
        <Text style={styles.errorText}>{locError || '설정에서 위치 권한을 허용해주세요.'}</Text>
      </View>
    );
  }

  // 로딩 중
  if (locLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>위치를 확인하는 중...</Text>
      </View>
    );
  }

  const initialRegion = location
    ? { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : SEOUL_CENTER;

  const statusLine = segLoading
    ? '갱신 중...'
    : `${segments.length}개 구간 감시 중`;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
        followsUserLocation
      >
        <SegmentOverlay
          segments={segments}
          onSegmentPress={(seg) => setSelectedSegment(seg)}
        />
      </MapView>

      {/* 상단 경고 배너 */}
      <StatusBanner alerts={alerts} />

      {/* 세그먼트 상세 모달 */}
      <SegmentDetailModal
        segment={selectedSegment}
        vehicleType={vehicleType}
        onClose={() => setSelectedSegment(null)}
      />

      {/* 하단 정보 바 */}
      <View style={styles.infoBar} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={
        `${statusLine}${isOffline ? ', 오프라인' : ''}${segError ? `, ${segError}` : ''}. 참고용 안내이며 실제 표지판과 법규를 우선합니다.`
      }>
        <Text style={styles.infoText}>
          {isOffline && <Text style={styles.offlineIndicator}>오프라인 </Text>}
          {statusLine}
          {segError ? ` · ${segError}` : ''}
        </Text>
        {/* G-06: 상시 면책 문구 — "표지판/법규 우선" */}
        <Text style={styles.disclaimer}>
          참고용 · 실제 표지판과 도로교통법을 우선
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  errorText: { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 22 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#777' },
  infoBar: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  infoText: { fontSize: 13, color: '#555', textAlign: 'center' },
  offlineIndicator: { color: '#FF9800', fontWeight: '600' },
  disclaimer: {
    fontSize: 11,
    color: '#9A3412',
    textAlign: 'center',
    marginTop: 4,
  },
});
