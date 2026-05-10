/**
 * 온보딩 화면 (G-02) — 첫 실행 시 면책조항·권한 안내·동의 게이트
 *
 * G-06: "법규/표지판 우선" 명시 포함.
 * 사용자가 명시 동의 후에만 BG 위치 추적이 시작된다.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

export function OnboardingScreen() {
  const { completeOnboarding } = useSettings();
  const [alertOptIn, setAlertOptIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const onStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await completeOnboarding(alertOptIn);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">버스전용차로</Text>
      <Text style={styles.subtitle}>운전 중 진입 가능 여부를 알려드립니다</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>이 앱이 사용하는 정보</Text>
        <Text style={styles.body}>
          • 위치 정보(GPS): 주변 버스전용차로 구간을 조회하기 위해 서버로 전송됩니다.
            서버는 원본 좌표를 저장하지 않으며, 분석용 로그는 약 100m 격자로 익명화됩니다.{"\n"}
          • 백그라운드 위치: 운전 중 단속 구간 접근 경고를 받으려면 필요합니다.
            동의해도 언제든 설정에서 끌 수 있습니다.{"\n"}
          • 알림 권한: 접근 경고를 화면에 표시하기 위해 사용됩니다.{"\n"}
          • 회원가입·이름·전화번호 등은 수집하지 않습니다.
        </Text>
      </View>

      <View style={[styles.section, styles.disclaimerSection]}>
        <Text style={styles.disclaimerTitle}>중요 안내 (꼭 읽어주세요)</Text>
        <Text style={styles.disclaimerBody}>
          본 앱은 운전 보조 참고 서비스이며, 법적 판단을 대체하지 않습니다.{"\n"}
          GPS 오차·데이터 갱신 지연·임시 통제 등으로 실제 단속과 다를 수 있습니다.{"\n"}
          실제 도로 표지판과 도로교통법을 항상 우선하여 판단해 주십시오.{"\n"}
          앱 안내를 신뢰하여 발생한 단속·과태료 등에 대해 본 앱은 책임지지 않습니다.{"\n"}
          운전 중 앱 조작은 위험합니다. 정차 후 사용해 주십시오.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchLabel}>접근 경고 알림 사용</Text>
            <Text style={styles.switchDesc}>
              운전 중 버스전용차로 500m 이내 접근 시 알림을 받습니다.
              사용 시 백그라운드 위치 권한이 필요합니다.
            </Text>
          </View>
          <Switch
            value={alertOptIn}
            onValueChange={setAlertOptIn}
            trackColor={{ true: '#22C55E' }}
            accessibilityRole="switch"
            accessibilityLabel="접근 경고 알림 사용"
            accessibilityState={{ checked: alertOptIn }}
          />
        </View>
      </View>

      <Text style={styles.consentNote}>
        아래 버튼을 누르면 위 안내와 개인정보처리방침에 동의하는 것으로 간주됩니다.
      </Text>

      <TouchableOpacity
        style={[styles.startButton, submitting && styles.startButtonDisabled]}
        onPress={onStart}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="동의하고 시작"
      >
        <Text style={styles.startButtonText}>
          {submitting ? '처리 중...' : '동의하고 시작'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footnote}>
        개인정보처리방침은 설정 화면에서 다시 확인할 수 있습니다.
      </Text>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: '#374151',
  },
  disclaimerSection: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FB923C',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9A3412',
    marginBottom: 6,
  },
  disclaimerBody: {
    fontSize: 12,
    lineHeight: 19,
    color: '#7C2D12',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  switchTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  switchDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  consentNote: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  startButton: {
    backgroundColor: '#22C55E',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
  },
});
