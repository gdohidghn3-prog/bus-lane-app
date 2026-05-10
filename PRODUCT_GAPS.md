# 제품 완성도 갭 분석

작성일: 2026-04-12
전제: FINAL_REVIEW.md 36건이 모두 수정된 상태에서, 실사용 가능한 제품이 되기 위해 추가로 필요한 작업

---

## 1. [치명] 데이터가 5개 구간뿐 — 서울 주요 노선 확충 필요

- **현상:** seed 데이터에 올림픽대로, 강남대로, 테헤란로, 종로, 천호대로 5개 구간만 존재한다. 서울 실제 버스전용차로는 50개 이상 노선, 수백 개 구간이다.
- **사용자 영향:** 앱을 열면 대부분의 위치에서 "주변에 규제 없음"이 표시된다. 사용자는 앱이 동작하지 않는다고 판단하고 삭제한다.
- **해결:**
  1. 서울시 공공데이터 포털 > 서울시 버스전용차로 현황 데이터셋에서 GIS 좌표를 확보
  2. GeoJSON LineString 형식으로 변환하여 seed SQL 생성
  3. 최소 목표: 중앙버스전용차로 12개 노선 + 가로변 버스전용차로 20개 구간 = 30개+ 구간
  4. 각 구간별 운영 시간/요일 규칙을 서울시 교통정보과 고시 기준으로 입력
  5. 규칙 데이터 정확도 검증: 실제 도로 표지판 사진과 대조
- **작업량 추정:** 데이터 수집 + 변환 + 검증

---

## 2. [치명] 설정 화면이 실행 앱에 존재하지 않고, 네비게이션도 없음

- **현상:** 실제 Expo 앱(`mobile/`)은 `mobile/App.tsx:3`에서 `MapScreen`만 렌더링한다. `mobile/src/screens/`에는 `MapScreen.tsx` 한 파일만 존재한다. `SettingsScreen`은 `apps/mobile/src/screens/SettingsScreen.tsx`에 있으나, 이 경로는 별도 구현(`apps/mobile`)에 속하며 현재 Expo 앱과는 연결되어 있지 않다. 네비게이션 라이브러리(`react-navigation`, `expo-router`)도 설치되어 있지 않다.
- **사용자 영향:** 차량 종류 변경, 알림 on/off 등 설정을 할 수 있는 화면 자체가 앱에 없다.
- **해결:** 선행 작업으로 `apps/mobile/src/screens/SettingsScreen.tsx`를 `mobile/src/screens/SettingsScreen.tsx`로 이식한 뒤, 네비게이션을 구성한다:
  ```bash
  # 1. 설정 화면 이식
  cp apps/mobile/src/screens/SettingsScreen.tsx mobile/src/screens/SettingsScreen.tsx
  # import 경로를 mobile/ 기준으로 수정 (../utils/geo 등)

  # 2. 네비게이션 라이브러리 설치 (mobile/ 디렉토리 기준)
  cd mobile && npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context
  ```
  ```typescript
  // mobile/App.tsx — 교체
  import { NavigationContainer } from '@react-navigation/native';
  import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
  import { MapScreen } from './src/screens/MapScreen';
  import { SettingsScreen } from './src/screens/SettingsScreen';

  const Tab = createBottomTabNavigator();

  export default function App() {
    return (
      <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen name="지도" component={MapScreen} />
          <Tab.Screen name="설정" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    );
  }
  ```
  이식 시 `apps/mobile`의 타입(`../types`)과 유틸(`../utils/geo`)도 함께 옮겨야 한다. 코드베이스 단일화(FINAL_REVIEW B-1)가 선행되면 이 작업이 자연스럽게 정리된다.
- **작업량 추정:** SettingsScreen 이식 + 의존 파일 이식 + 네비게이션 설정 + 탭 아이콘

---

## 3. [치명] 백그라운드 경고 불가

- **현상:** 앱이 포그라운드일 때만 위치 추적 + 경고 배너를 표시한다. 운전 중 앱은 대부분 백그라운드 상태이므로, PRD 시나리오 2("이동 중 금지 구간 접근 시 경고")가 실질적으로 동작하지 않는다.
- **사용자 영향:** 핵심 가치인 "접근 경고"가 운전 중에 작동하지 않는다.
- **해결:**
  ```typescript
  // mobile/src/services/backgroundLocation.ts
  import * as Location from 'expo-location';
  import * as TaskManager from 'expo-task-manager';
  import * as Notifications from 'expo-notifications';

  const TASK_NAME = 'BUS_LANE_BG_LOCATION';

  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    const loc = locations[0];
    if (!loc) return;

    // 서버에 위치 전송하여 경고 확인
    try {
      const res = await fetch(`${API_BASE}/alerts/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        }),
      });
      const { alerts } = await res.json();

      // 금지 구간 접근 시 로컬 푸시 알림
      const danger = alerts.find((a: any) => a.status !== 'allowed');
      if (danger) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '버스전용차로 접근 경고',
            body: `${danger.segmentName} — ${danger.reason}`,
            sound: true,
          },
          trigger: null, // 즉시 발송
        });
      }
    } catch { /* 네트워크 오류 시 무시 */ }
  });

  export async function startBackgroundTracking() {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return;

    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15_000,        // 15초 간격
      distanceInterval: 50,         // 50m 이동 시
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: '버스전용차로 감시 중',
        notificationBody: '주변 규제 구간을 모니터링하고 있습니다.',
      },
    });
  }
  ```
  추가 필요 설정:
  - `app.json`에 `"UIBackgroundModes": ["location"]` (iOS)
  - `expo-notifications` 권한 요청 플로우
  - 배터리 절약을 위한 시간/거리 간격 조정
- **작업량 추정:** 백그라운드 태스크 + 푸시 알림 + 권한 플로우 + iOS/Android 테스트

---

## 4. [높음] 차량 종류 선택 UI 없음

- **현상:** 규칙 엔진은 `vehicleType` (car, taxi, bus, emergency, general)을 지원하지만, 앱에서 선택하는 UI가 없다. 항상 기본값으로 호출된다.
- **사용자 영향:** 택시 기사가 사용하면 예외 적용이 안 되어 "진입 금지"로 표시되지만, 실제로는 택시 진입 가능 구간이 대다수다.
- **전제:** 갭 #2의 SettingsScreen 이식이 완료되어 `mobile/src/screens/SettingsScreen.tsx`가 존재하는 상태여야 한다.
- **해결:**
  ```typescript
  // mobile/src/screens/SettingsScreen.tsx에 추가
  const VEHICLE_TYPES = [
    { value: 'general', label: '일반 승용차' },
    { value: 'taxi', label: '택시' },
    { value: '9_plus', label: '9인승 이상 승합차' },
    { value: 'bus', label: '노선버스' },
    { value: 'emergency', label: '긴급차량' },
  ];

  // 차량 종류 선택 UI
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>차량 종류</Text>
    {VEHICLE_TYPES.map((vt) => (
      <TouchableOpacity
        key={vt.value}
        style={[styles.cityItem, selectedVehicle === vt.value && styles.cityItemActive]}
        onPress={() => setSelectedVehicle(vt.value)}
      >
        <Text style={[styles.cityText, selectedVehicle === vt.value && styles.cityTextActive]}>
          {vt.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
  ```
  설정값은 AsyncStorage에 저장하고, Context를 통해 API 호출 시 `vehicleType` 파라미터로 전달한다:
  ```typescript
  // mobile/src/context/SettingsContext.tsx
  import AsyncStorage from '@react-native-async-storage/async-storage';

  const STORAGE_KEY = 'bus-lane-settings';

  export const SettingsProvider = ({ children }) => {
    const [vehicleType, setVehicleType] = useState('general');
    const [alertEnabled, setAlertEnabled] = useState(true);

    useEffect(() => {
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          setVehicleType(parsed.vehicleType ?? 'general');
          setAlertEnabled(parsed.alertEnabled ?? true);
        }
      });
    }, []);

    const update = (key: string, value: any) => {
      const next = { vehicleType, alertEnabled, [key]: value };
      if (key === 'vehicleType') setVehicleType(value);
      if (key === 'alertEnabled') setAlertEnabled(value);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    return (
      <SettingsContext.Provider value={{ vehicleType, alertEnabled, update }}>
        {children}
      </SettingsContext.Provider>
    );
  };
  ```
- **작업량 추정:** UI + Context + AsyncStorage + API 연동

---

## 5. [높음] 오프라인/네트워크 단절 처리 없음

- **현상:** 네트워크가 끊기면 모든 상태 정보가 사라진다. "데이터를 불러올 수 없습니다" 텍스트만 표시된다.
- **사용자 영향:** 터널, 지하차도, 음영 지역에서 가장 필요한 순간에 정보가 없다.
- **해결:**
  ```typescript
  // mobile/src/hooks/useSegments.ts — 캐시 레이어 추가
  import AsyncStorage from '@react-native-async-storage/async-storage';
  import NetInfo from '@react-native-community/netinfo';

  const CACHE_KEY = 'bus-lane-last-segments';

  const refresh = useCallback(async () => {
    if (!location) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const netState = await NetInfo.fetch();

      if (netState.isConnected) {
        const [segResponse, alertResponse] = await Promise.all([
          getSegments(location, 2, vehicleType),
          checkAlerts(location, vehicleType),
        ]);
        const result = {
          segments: segResponse.segments,
          alerts: alertResponse.alerts,
        };

        // 성공 시 캐시 저장
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
        setState({
          segments: result.segments,
          alerts: result.alerts,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        });
      } else {
        // 오프라인: 캐시에서 복원
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const result = JSON.parse(cached);
          setState((prev) => ({
            ...prev,
            segments: result.segments,
            alerts: result.alerts,
            loading: false,
            error: '오프라인 — 마지막 조회 데이터를 표시 중',
          }));
        } else {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: '네트워크 연결 없음. 데이터를 불러올 수 없습니다.',
          }));
        }
      }
    } catch (err) {
      // 네트워크 에러 시에도 캐시 복원 시도
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const result = JSON.parse(cached);
        setState((prev) => ({
          ...prev,
          segments: result.segments,
          alerts: result.alerts,
          loading: false,
          error: '갱신 실패 — 이전 데이터를 표시 중',
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : '데이터를 불러올 수 없습니다.',
        }));
      }
    }
  }, [location?.lat, location?.lng, vehicleType]);
  ```
  UI에 오프라인 상태 인디케이터 추가:
  ```typescript
  // MapScreen 하단 infoBar
  <Text style={styles.infoText}>
    {segError?.includes('오프라인') ? '(오프라인)' : ''} {segments.length}개 구간 감시 중
  </Text>
  ```
- **작업량 추정:** 캐시 레이어 + 네트워크 상태 감지 + UI 인디케이터

---

## 6. [높음] 데이터 갱신 수단 없음

- **현상:** 버스전용차로 규칙이 변경되면 SQL을 직접 실행해야 한다. 관리 화면, 공공데이터 자동 동기화, 데이터 업데이트 절차 문서 모두 없다.
- **사용자 영향:** 규칙이 변경된 후에도 앱이 구 규칙으로 판정하여 잘못된 안내를 줄 수 있다.
- **해결 (단계적):**
  - **즉시:** 데이터 갱신 절차를 문서화한다 (`docs/DATA_UPDATE.md`)
    ```markdown
    ## 버스전용차로 규칙 갱신 절차

    1. 서울시 교통정보과 고시 확인
    2. Supabase 대시보드 > Table Editor > regulation_rules 에서 직접 수정
    3. 변경 내역을 git으로 관리 (SQL 파일로 기록)
    4. 변경 후 앱에서 해당 구간 확인 테스트
    ```
  - **단기:** Supabase Edge Functions로 간단한 관리 API 추가
    ```typescript
    // supabase/functions/admin-update-rule/index.ts
    // API key 인증 + regulation_rules CRUD
    ```
  - **중기:** 서울시 공공데이터 API 연동 자동 동기화 파이프라인 (변경 감지 → 비교 → 자동 업데이트 + Slack 알림)
- **작업량 추정:** 문서화(즉시) → 관리 API(단기) → 자동화(중기)

---

## 7. [중간] 앱 스토어 배포 요건 미충족

- **현상:** 앱 아이콘, 스플래시 스크린, 개인정보처리방침, 이용약관, iOS 권한 사유 설명이 없다.
- **사용자 영향:** 앱 스토어에 제출할 수 없다.
- **해결:**
  1. **앱 아이콘:** 1024x1024 마스터 이미지 제작 → `app.json`의 `icon` 필드에 설정
  2. **스플래시 스크린:** `app.json`의 `splash` 필드에 이미지 + 배경색 설정
  3. **개인정보처리방침:** 위치 정보 수집 항목을 포함한 문서 작성 → 웹 호스팅 → `app.json`의 `privacyUrl`에 링크
  4. **이용약관:** 면책조항(현재 SettingsScreen에 있는 문구)을 별도 페이지로 분리
  5. **iOS 권한 설명:** `app.json`에 추가
     ```json
     {
       "ios": {
         "infoPlist": {
           "NSLocationWhenInUseUsageDescription": "버스전용차로 진입 가능 여부를 판단하기 위해 현재 위치를 사용합니다.",
           "NSLocationAlwaysAndWhenInUseUsageDescription": "이동 중 금지 구간 접근 시 경고를 보내기 위해 백그라운드에서도 위치를 사용합니다."
         }
       }
     }
     ```
  6. **Android 설정:** `app.json`에 `android.permissions` 명시
- **작업량 추정:** 디자인 에셋 + 법률 문서 + 빌드 설정

---

## 8. [중간] CI/CD 파이프라인 없음

- **현상:** 코드 수정 후 수동으로 테스트 → 빌드 → 배포해야 한다.
- **사용자 영향:** 직접적 영향은 없으나, 배포 실수(미수정 코드 배포, 테스트 미통과 코드 배포)의 위험이 있다.
- **해결:** GitHub Actions 기반 파이프라인을 구성한다:
  ```yaml
  # .github/workflows/ci.yml
  name: CI
  on: [push, pull_request]
  jobs:
    test-engine:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - run: npm ci
        - run: cd packages/rule-engine && npm test
          # 또는 backend 정본 선택 후: cd backend && npm test

    lint:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - run: npm ci
        - run: npx tsc --noEmit  # 타입 체크

    deploy-api:
      needs: [test-engine, lint]
      if: github.ref == 'refs/heads/main'
      runs-on: ubuntu-latest
      steps:
        # Railway / Fly.io / Render 배포 CLI
        - run: flyctl deploy --remote-only
  ```
  모바일 빌드는 EAS Build로:
  모바일 빌드는 `mobile/`이 루트 workspaces(`packages/*`, `apps/*`)에 포함되지 않으므로, 별도 working-directory에서 설치/빌드해야 한다:
  ```yaml
    build-mobile:
      needs: [test-engine, lint]
      if: github.ref == 'refs/heads/main'
      runs-on: ubuntu-latest
      defaults:
        run:
          working-directory: mobile
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20 }
        - run: npm ci
        - uses: expo/expo-github-action@v8
          with:
            eas-version: latest
            token: ${{ secrets.EXPO_TOKEN }}
        - run: eas build --platform all --non-interactive
  ```
  코드베이스 단일화(FINAL_REVIEW B-1) 이후 `mobile/`을 workspaces에 포함시키면 루트에서 통합 관리할 수 있다.
- **작업량 추정:** CI 설정 + 배포 설정 + 시크릿 관리

---

## 9. [중간] 접근성(Accessibility) 미구현

- **현상:** 모든 UI 컴포넌트에 `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`가 없다.
- **사용자 영향:** 시각 장애인 사용자가 스크린 리더(TalkBack, VoiceOver)로 앱을 사용할 수 없다.
- **해결:** 핵심 컴포넌트에 접근성 속성을 추가한다:
  ```typescript
  // StatusBanner.tsx
  <View
    style={[styles.container, { backgroundColor: STATUS_COLORS[topAlert.status] }]}
    accessible
    accessibilityRole="alert"
    accessibilityLabel={`${STATUS_LABELS[topAlert.status]}, ${topAlert.segmentName}, ${topAlert.distanceMeters}미터`}
  >

  // SegmentOverlay.tsx — Polyline은 접근성 지원이 제한적이므로, 목록 대체 뷰 제공 검토
  <Polyline
    key={seg.id}
    coordinates={coords}
    tappable
    onPress={() => onSegmentPress(seg)}
    // react-native-maps Polyline은 accessibilityLabel 미지원
    // → 별도 목록 뷰에서 세그먼트 선택 가능하도록 대안 UI 필요
  />

  // SegmentDetailModal.tsx
  <TouchableOpacity
    onPress={onClose}
    style={styles.closeBtn}
    accessibilityRole="button"
    accessibilityLabel="상세 정보 닫기"
  >
  ```
  지도 기반 앱의 접근성 한계를 고려하여, 세그먼트 목록을 텍스트로 보여주는 대체 화면도 검토한다.
- **작업량 추정:** 핵심 UI 접근성 속성 추가 + 대체 목록 뷰 검토

---

## 우선순위 요약

| 순서 | 항목 | 심각도 | 이유 |
|---|---|---|---|
| 1 | 데이터 확충 (5개→30개+) | 치명 | 앱 첫인상 결정 |
| 2 | 백그라운드 경고 | 치명 | 핵심 사용 시나리오 |
| 3 | 화면 네비게이션 | 치명 | 설정 화면 접근 불가 |
| 4 | 차량 종류 선택 + 설정 연동 | 높음 | 택시/승합차 사용자 커버 |
| 5 | 오프라인 처리 | 높음 | 운전 중 안정성 |
| 6 | 데이터 갱신 수단 | 높음 | 장기 운영 필수 |
| 7 | 앱 스토어 요건 | 중간 | 배포 전 필수 |
| 8 | CI/CD | 중간 | 안정적 배포 |
| 9 | 접근성 | 중간 | 공공성 있는 앱으로서 권고 |
