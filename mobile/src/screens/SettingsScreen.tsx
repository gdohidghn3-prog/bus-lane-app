/**
 * 설정 화면 — 차량 유형, 도시, 알림, 개인정보, 면책조항, 버전
 */
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import type { VehicleType } from '../types';
import { VEHICLE_TYPE_LABELS } from '../types';

const CITIES = ['서울'];

const VEHICLE_TYPES: VehicleType[] = ['general', 'taxi', '9_plus', 'bus', 'emergency'];

export function SettingsScreen() {
  const {
    vehicleType,
    setVehicleType,
    alertEnabled,
    setAlertEnabled,
    selectedCity,
    setSelectedCity,
  } = useSettings();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header} accessibilityRole="header">설정</Text>

      {/* 차량 유형 선택 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>차량 유형</Text>
        {VEHICLE_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.optionItem,
              vehicleType === type && styles.optionItemActive,
            ]}
            onPress={() => setVehicleType(type)}
            accessibilityRole="radio"
            accessibilityState={{ selected: vehicleType === type }}
            accessibilityLabel={`차량 유형: ${VEHICLE_TYPE_LABELS[type]}`}
          >
            <Text style={[
              styles.optionText,
              vehicleType === type && styles.optionTextActive,
            ]}>
              {VEHICLE_TYPE_LABELS[type]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 도시 선택 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>도시</Text>
        {CITIES.map((city) => (
          <TouchableOpacity
            key={city}
            style={[
              styles.optionItem,
              selectedCity === city && styles.optionItemActive,
            ]}
            onPress={() => setSelectedCity(city)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedCity === city }}
            accessibilityLabel={`도시: ${city}`}
          >
            <Text style={[
              styles.optionText,
              selectedCity === city && styles.optionTextActive,
            ]}>
              {city}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 알림 설정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>접근 경고 알림</Text>
          <Switch
            value={alertEnabled}
            onValueChange={(v) => { void setAlertEnabled(v); }}
            trackColor={{ true: '#22C55E' }}
            accessibilityRole="switch"
            accessibilityLabel="접근 경고 알림"
            accessibilityState={{ checked: alertEnabled }}
          />
        </View>
      </View>

      {/* 위치 정보 및 개인정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>위치 정보 및 개인정보</Text>
        <Text style={styles.info}>
          이 앱은 버스전용차로 진입 가능 여부를 판단하기 위해 위치 정보를 사용합니다.
          설정 &gt; 앱 권한에서 위치 권한을 관리할 수 있습니다.
        </Text>
        <Text style={[styles.info, { marginTop: 8 }]}>
          위치 데이터는 서버로 전송되어 주변 구간 정보를 조회하는 데에만 사용되며,
          별도로 저장되거나 제3자에게 제공되지 않습니다.
          백그라운드 위치 추적은 접근 경고 알림이 활성화된 경우에만 동작합니다.
        </Text>
      </View>

      {/* 면책조항 — G-06 */}
      <View style={styles.section}>
        <Text style={styles.disclaimer}>
          본 앱은 참고용 서비스이며 법적 판단을 대체하지 않습니다.
          실제 교통 법규와 현장 표지판을 항상 우선하여 주시기 바랍니다.
          GPS 오차·데이터 갱신 지연·임시 통제 등으로 실제 단속과 다를 수 있으며,
          앱 안내를 신뢰하여 발생한 단속·과태료에 대해 본 앱은 책임지지 않습니다.
        </Text>
      </View>

      {/* 버전 */}
      <Text style={styles.version} accessibilityLabel="앱 버전 0.1.0">v0.1.0 (MVP)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  optionItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginBottom: 6,
  },
  optionItemActive: {
    backgroundColor: '#22C55E',
  },
  optionText: {
    fontSize: 15,
    color: '#374151',
  },
  optionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 15,
    color: '#374151',
  },
  info: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  version: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 20,
  },
});
