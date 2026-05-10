# 출시 체크리스트

작성일: 2026-04-12
현재 코드 완성도: ~90%
목표: 앱 스토어 출시 가능 상태

---

## Phase 1: 인프라 세팅 (코드 작업 전 선행 필수)

### 1-1. Supabase 프로젝트 생성

- [ ] [supabase.com](https://supabase.com) 가입
- [ ] New Project 생성 (리전: Northeast Asia Tokyo, 비밀번호 설정)
- [ ] 프로젝트 생성 완료 대기 (약 2분)
- [ ] Settings > API 에서 3개 값 복사:
  - `Project URL` → SUPABASE_URL
  - `anon public` → SUPABASE_ANON_KEY
  - `service_role secret` → SUPABASE_SERVICE_KEY

### 1-2. DB 마이그레이션 실행

Supabase 대시보드 > SQL Editor에서 순서대로 실행:

- [ ] `backend/migrations/001_initial_schema.sql` — 테이블 생성
- [ ] `backend/migrations/002_add_constraints.sql` — CHECK 제약 + 트리거
- [ ] `backend/migrations/003_alert_logs.sql` — alert_logs 테이블
- [ ] `backend/seeds/seoul_bus_lanes.sql` — 30개 구간 + 규칙 + 공휴일 시드

실행 후 확인:
- [ ] Table Editor에서 `road_segments` 30건 확인
- [ ] `regulations` 30건 확인
- [ ] `regulation_rules` 100건+ 확인
- [ ] `holidays` 20건 확인

### 1-3. 백엔드 환경변수 설정

- [ ] `backend/.env` 파일 생성 (`.env.example` 참고):
  ```
  SUPABASE_URL=https://xxxxx.supabase.co
  SUPABASE_ANON_KEY=eyJhbGci...
  SUPABASE_SERVICE_KEY=eyJhbGci...
  API_KEY=(임의 문자열 32자 이상 생성)
  CORS_ORIGIN=http://localhost:19006
  PORT=3000
  LOG_LEVEL=info
  ```

### 1-4. 로컬 실행 확인

- [ ] `cd backend && npm install && npm run dev` → 서버 시작 확인
- [ ] `curl http://localhost:3000/api/health/live` → `{"status":"ok"}` 확인
- [ ] `curl http://localhost:3000/api/health/ready` → `{"status":"ready"}` 확인
- [ ] API 테스트:
  ```bash
  curl -H "X-API-Key: (설정한키)" \
    "http://localhost:3000/api/v1/segments?lat=37.5710&lng=126.9770&radius=2"
  ```
  → 종로 구간 등 세그먼트 반환 확인
- [ ] `cd mobile && npm install && npm start` → Expo 시작 확인
- [ ] Android 에뮬레이터 또는 Expo Go에서 지도 + 구간 표시 확인

---

## Phase 2: 남은 코드 작업 (아키텍처 레벨)

### 2-1. [CRITICAL] Supabase RLS 전환

현재 모든 쿼리가 `supabaseAdmin`(service key, RLS 우회)을 사용 중.
읽기 전용 쿼리는 `supabase`(anon key, RLS 적용)로 전환해야 함.

- [ ] Supabase 대시보드 > Authentication > Policies에서 RLS 정책 설정:
  ```sql
  -- road_segments: 누구나 읽기 가능
  ALTER TABLE road_segments ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public read" ON road_segments FOR SELECT USING (true);

  -- regulations: 누구나 읽기 가능
  ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public read" ON regulations FOR SELECT USING (true);

  -- regulation_rules: 누구나 읽기 가능
  ALTER TABLE regulation_rules ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public read" ON regulation_rules FOR SELECT USING (true);

  -- holidays: 누구나 읽기 가능
  ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Public read" ON holidays FOR SELECT USING (true);

  -- alert_logs: service key로만 쓰기 가능 (앱에서 직접 접근 불가)
  ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Service insert only" ON alert_logs FOR INSERT WITH CHECK (false);
  ```
- [ ] `backend/src/services/segment-service.ts`에서 읽기 쿼리를 `supabaseAdmin` → `supabase`로 교체
- [ ] `supabaseAdmin`은 alert_logs INSERT와 관리 작업에만 유지
- [ ] 전환 후 API 정상 동작 확인

### 2-2. [MEDIUM] alert_logs 기록 로직 구현

- [ ] `backend/src/services/segment-service.ts`의 `checkProximityAlerts()`에서 결과를 비동기 INSERT:
  ```typescript
  if (alerts.length > 0) {
    supabaseAdmin.from('alert_logs').insert(
      alerts.map(a => ({
        segment_id: a.segmentId,
        alert_type: a.status === 'prohibited' ? 'proximity_danger' : 'proximity_warning',
        user_lat_grid: Math.round(location.lat * 100) / 100,
        user_lng_grid: Math.round(location.lng * 100) / 100,
        status: a.status,
        message: a.reason,
      }))
    ).then().catch(err => logger.warn({ err }, 'Failed to log alert'));
  }
  ```
- [ ] 기록 확인: API 호출 후 Supabase Table Editor에서 alert_logs 데이터 확인

### 2-3. [MEDIUM] 3단계 DB 호출 → RPC 통합 (선택)

현재: segments → regulations → rules 순차 3회 쿼리.
데이터가 30개 구간이면 성능 문제 없음. 100개+ 확장 시 적용.

- [ ] Supabase SQL Editor에서 RPC 함수 생성:
  ```sql
  CREATE OR REPLACE FUNCTION get_segments_with_rules(
    min_lat FLOAT, max_lat FLOAT, min_lng FLOAT, max_lng FLOAT
  ) RETURNS JSONB AS $$
    SELECT jsonb_build_object(
      'segments', (SELECT jsonb_agg(row_to_json(s)) FROM road_segments s
                   WHERE s.is_active AND s.center_lat BETWEEN min_lat AND max_lat
                   AND s.center_lng BETWEEN min_lng AND max_lng),
      'regulations', (SELECT jsonb_agg(row_to_json(r)) FROM regulations r
                      WHERE r.is_active AND r.segment_id IN (
                        SELECT id FROM road_segments
                        WHERE is_active AND center_lat BETWEEN min_lat AND max_lat
                        AND center_lng BETWEEN min_lng AND max_lng)),
      'rules', (SELECT jsonb_agg(row_to_json(rr)) FROM regulation_rules rr
                WHERE rr.regulation_id IN (
                  SELECT r.id FROM regulations r
                  JOIN road_segments s ON r.segment_id = s.id
                  WHERE s.is_active AND r.is_active
                  AND s.center_lat BETWEEN min_lat AND max_lat
                  AND s.center_lng BETWEEN min_lng AND max_lng))
    );
  $$ LANGUAGE sql STABLE;
  ```
- [ ] `segment-service.ts`의 `evaluateNearbySegments()`를 RPC 호출로 교체
- [ ] 응답 시간 비교 테스트

### 2-4. [MEDIUM] PostGIS 공간 쿼리 전환 (선택)

현재: center_lat/center_lng로 BBox 비교.
데이터 수만 건 이상 확장 시 적용.

- [ ] geometry 컬럼 추가:
  ```sql
  ALTER TABLE road_segments ADD COLUMN geom geometry(LineString, 4326);
  UPDATE road_segments SET geom = ST_GeomFromGeoJSON(geometry::text);
  CREATE INDEX idx_segments_geom ON road_segments USING GIST (geom);
  ```
- [ ] 쿼리를 `ST_DWithin`으로 교체
- [ ] 기존 center_lat/center_lng 쿼리와 결과 비교 검증

---

## Phase 3: 디자인 에셋

### 3-1. 앱 아이콘

- [ ] 1024x1024px 마스터 아이콘 제작 (배경색 #4CAF50 초록 + 버스 아이콘)
- [ ] `mobile/assets/icon.png`로 저장
- [ ] `mobile/assets/adaptive-icon.png` (Android 적응형) 저장

### 3-2. 스플래시 스크린

- [ ] 1284x2778px 스플래시 이미지 제작
- [ ] `mobile/assets/splash.png`로 저장

### 3-3. 앱 스토어 스크린샷

- [ ] iPhone 6.7" (1290x2796) 스크린샷 3장 이상
- [ ] Android 폰 스크린샷 3장 이상
- [ ] 주요 화면: 지도 전체, 경고 배너, 구간 상세 모달

---

## Phase 4: 법률 문서

### 4-1. 개인정보처리방침

앱 스토어 제출 시 필수 (위치 정보 수집 앱).

- [ ] 수집 항목: 위치 정보 (GPS 좌표, 익명화 저장)
- [ ] 수집 목적: 버스전용차로 진입 가능 여부 판단, 접근 경고
- [ ] 보유 기간: alert_logs 90일 후 자동 삭제
- [ ] 웹페이지로 작성하여 호스팅 (GitHub Pages, Notion 공개 페이지 등)
- [ ] URL을 `app.json`의 `expo.ios.privacyManifests`에 등록

### 4-2. 이용약관 / 면책조항

- [ ] "본 앱은 참고용이며 법적 판단을 대체하지 않습니다" 포함
- [ ] "실제 교통 법규와 현장 표지판을 항상 우선하십시오" 포함
- [ ] 앱 최초 실행 시 동의 화면 표시 (선택사항)

---

## Phase 5: 서버 배포

### 5-1. 배포 플랫폼 선택

| 플랫폼 | 무료 플랜 | 특징 |
|---|---|---|
| Railway | $5 크레딧/월 | 가장 쉬운 배포, GitHub 연동 |
| Fly.io | 3개 VM 무료 | Docker 기반, 서울 리전 있음 |
| Render | 750시간/월 무료 | 15분 미사용 시 sleep |

- [ ] 플랫폼 선택 및 가입
- [ ] GitHub 저장소 연결
- [ ] 환경변수 설정 (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, API_KEY, CORS_ORIGIN, NODE_ENV=production)
- [ ] 배포 확인: `https://your-domain/api/health/live` → ok

### 5-2. 모바일 환경변수 업데이트

- [ ] `mobile/.env` 생성:
  ```
  EXPO_PUBLIC_API_URL=https://your-domain/api/v1
  EXPO_PUBLIC_API_KEY=(백엔드와 동일한 API_KEY)
  ```
- [ ] 배포된 서버와 통신 확인

### 5-3. 도메인 및 HTTPS

- [ ] 커스텀 도메인 설정 (선택)
- [ ] HTTPS 자동 적용 확인 (대부분 플랫폼이 자동 제공)
- [ ] CORS_ORIGIN을 실제 도메인으로 업데이트

---

## Phase 6: 테스트

### 6-1. 백엔드 테스트

- [ ] `cd backend && npm test` → 25개 전부 통과
- [ ] API 수동 테스트: 각 엔드포인트별 정상/에러 케이스
  - GET /api/v1/segments (정상 bbox, NaN 좌표, 잘못된 regulationType)
  - GET /api/v1/segments/:id (유효 UUID, 무효 UUID, 존재하지 않는 ID)
  - GET /api/v1/segments/:id/detail
  - POST /api/v1/alerts/check (정상 좌표, 문자열 좌표, body 없음)
- [ ] Rate limit 동작 확인 (120회 초과 시 429 반환)
- [ ] API key 없는 요청 → 401 확인
- [ ] 헬스체크: /api/health/live, /api/health/ready

### 6-2. 모바일 테스트

- [ ] Android 에뮬레이터에서 전체 흐름 테스트
  - 위치 권한 허용 → 지도 표시 → 구간 polyline 표시
  - 구간 탭 → 상세 모달 → 규칙/벌금 표시
  - 설정 탭 → 차량 종류 변경 → 지도 돌아와서 상태 변경 확인
  - 알림 토글 off → 백그라운드 알림 중지 확인
- [ ] iOS 시뮬레이터에서 동일 테스트 (Mac 필요)
- [ ] Expo Go 앱에서 실기기 테스트
- [ ] 위치 권한 거부 시 안내 화면 표시 확인
- [ ] 네트워크 끊김 → 캐시 데이터 표시 + "오프라인" 인디케이터 확인
- [ ] 앱 재시작 후 설정값 유지 확인

### 6-3. 규칙 정확도 테스트

- [ ] 평일 08:00 종로 → prohibited (24시간 금지)
- [ ] 토요일 10:00 강남대로 → allowed (주말 해제)
- [ ] 공휴일 09:00 테헤란로 → allowed (공휴일 해제)
- [ ] 평일 06:00 신촌로 → allowed (출근 시간 전)
- [ ] 평일 08:00 신촌로 → prohibited (가로변 출근 규제)
- [ ] 평일 12:00 신촌로 → allowed (출퇴근 사이)
- [ ] 택시로 설정 변경 → 평일 08:00 종로 → allowed (택시 예외)

---

## Phase 7: 앱 스토어 제출

### 7-1. EAS Build 설정

- [ ] Expo 계정 생성: `npx expo login`
- [ ] EAS 프로젝트 초기화: `cd mobile && eas init`
- [ ] `eas.json` 생성:
  ```json
  {
    "build": {
      "preview": {
        "distribution": "internal"
      },
      "production": {
        "distribution": "store"
      }
    }
  }
  ```
- [ ] 프리뷰 빌드: `eas build --profile preview --platform all`
- [ ] 실기기에서 프리뷰 빌드 설치 테스트

### 7-2. Google Play Store

- [ ] Google Play Console 개발자 계정 ($25 일회성)
- [ ] 앱 정보 입력: 이름, 설명, 스크린샷, 카테고리(지도 및 내비게이션)
- [ ] 개인정보처리방침 URL 입력
- [ ] 위치 권한 사용 사유 설명
- [ ] 프로덕션 빌드: `eas build --profile production --platform android`
- [ ] AAB 파일 업로드 → 내부 테스트 트랙 → 심사 제출

### 7-3. Apple App Store

- [ ] Apple Developer Program 가입 ($99/년)
- [ ] App Store Connect에서 앱 등록
- [ ] 앱 정보, 스크린샷, 개인정보처리방침 URL 입력
- [ ] 위치 권한 사용 사유 설명 (심사에서 중요)
- [ ] 프로덕션 빌드: `eas build --profile production --platform ios`
- [ ] TestFlight 배포 → 내부 테스트 → 심사 제출

---

## Phase 8: 출시 후 운영

### 8-1. 모니터링

- [ ] Supabase 대시보드에서 DB 사용량 주기적 확인
- [ ] 서버 로그(pino) 모니터링 — 에러 패턴 감시
- [ ] alert_logs 증가 속도 확인 (90일 보존 정책 실행)

### 8-2. 데이터 유지보수

- [ ] `docs/DATA_UPDATE.md` 절차에 따라 규칙 변경 반영
- [ ] 매년 12월: 다음 해 공휴일 데이터 추가
- [ ] 신규 버스전용차로 노선 개통 시 구간 추가

### 8-3. 앱 업데이트

- [ ] 사용자 피드백 수집 → 우선순위 정리
- [ ] OTA 업데이트: `eas update` (JavaScript 변경만)
- [ ] 네이티브 변경 시: `eas build` → 스토어 재제출

---

## 비용 요약

| 항목 | 비용 | 비고 |
|---|---|---|
| Supabase | 무료 | 500MB / 무제한 API |
| 서버 호스팅 | 무료~$5/월 | Railway 크레딧 또는 Fly.io 무료 VM |
| Expo/EAS | 무료 | 월 30회 빌드 |
| Google Play | $25 일회성 | 개발자 계정 |
| Apple App Store | $99/년 | Developer Program |
| 도메인 | $10~15/년 | 선택사항 |
| **합계** | **$25~$140 (초기)** | **월 $0~$5 운영비** |
