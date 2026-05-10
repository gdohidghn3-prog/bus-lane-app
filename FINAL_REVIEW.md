# 최종 코드 리뷰 보고서

작성일: 2026-04-12
리뷰 대상: bus-lane-app 전체 프로젝트 (apps/, backend/, mobile/, packages/)

---

## Part A. 기존 리뷰(REVIEW_FIX_REQUESTS.md) 검증

기존 리뷰에서 제기한 5건에 대해 코드 확인 결과를 기술한다.

### 기존 #1 [P1] distanceToPolyline이 꼭짓점 기준으로만 거리 계산 — 동의, 확인됨

- 위치: `packages/rule-engine/src/geo.ts:23-33`
- **확인:** `distanceToPolyline()`이 polyline의 각 vertex까지의 거리만 계산하고, 선분(segment) 위 최근접점까지의 거리를 계산하지 않는다.
- **영향:** 꼭짓점 사이 중간 지점에 있는 사용자에게 경고가 누락되거나 거리가 과대 측정된다.
- **참고:** `backend/src/engine/geo-utils.ts:28-39`의 `distanceToPolyline()`은 이미 `distanceToLineSegment()`를 사용하여 올바르게 구현되어 있다. 즉 backend에는 수정된 버전이 있지만 packages/rule-engine에는 반영되지 않은 상태.
- **판정: 기존 리뷰 정확. P1 유지.**
- **해결:** `backend/src/engine/geo-utils.ts:28-53`의 `distanceToLineSegment()` 로직을 `packages/rule-engine/src/geo.ts`에 반영한다:
  ```typescript
  export function distanceToPolyline(
    userLat: number, userLng: number,
    coordinates: [number, number][]
  ): number {
    let minDist = Infinity;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lng1, lat1] = coordinates[i];
      const [lng2, lat2] = coordinates[i + 1];
      const d = distanceToSegment(userLat, userLng, lat1, lng1, lat2, lng2);
      if (d < minDist) minDist = d;
    }
    // 좌표가 1개뿐인 경우 점 거리로 fallback
    if (coordinates.length === 1) {
      return distanceMeters(userLat, userLng, coordinates[0][1], coordinates[0][0]);
    }
    return minDist;
  }

  function distanceToSegment(
    pLat: number, pLng: number,
    aLat: number, aLng: number,
    bLat: number, bLng: number
  ): number {
    const ab = { lat: bLat - aLat, lng: bLng - aLng };
    const ap = { lat: pLat - aLat, lng: pLng - aLng };
    const t = Math.max(0, Math.min(1,
      (ap.lat * ab.lat + ap.lng * ab.lng) / (ab.lat * ab.lat + ab.lng * ab.lng)
    ));
    return distanceMeters(pLat, pLng, aLat + t * ab.lat, aLng + t * ab.lng);
  }
  ```

### 기존 #2 [P1] bbox 조회가 start_lat/start_lng만 사용 — 동의, 확인됨

- 위치: `apps/api/src/services/segmentService.ts:38-41`, `apps/api/src/routes/alerts.ts:43-46`
- **확인:** 두 곳 모두 `start_lat`, `start_lng`만으로 필터링한다. `end_lat`, `end_lng`를 전혀 보지 않는다.
- **영향:** 시작점이 화면 밖에 있지만 끝점(또는 중간 polyline)이 화면 안에 있는 긴 구간이 누락된다.
- **참고:** `backend/src/services/segment-service.ts:50-57`은 `center_lat`/`center_lng`를 사용하여 약간 개선되었으나, 이 역시 긴 구간에서는 false negative가 발생한다. 근본적 해결은 PostGIS ST_Intersects 등 geometry 기반 공간 쿼리가 필요하다.
- **판정: 기존 리뷰 정확. P1 유지.**
- **해결:** `segmentService.ts:getSegmentsInBBox()`에서 start/end 모두 고려하도록 OR 조건을 추가한다:
  ```typescript
  // 시작점 OR 끝점이 bbox 안에 있는 세그먼트 조회
  // Supabase는 OR 필터가 제한적이므로, RPC 또는 raw SQL 사용 권장
  const { data: segments, error } = await supabase.rpc('segments_in_bbox', {
    min_lat: query.minLat, max_lat: query.maxLat,
    min_lng: query.minLng, max_lng: query.maxLng,
  });
  ```
  ```sql
  -- DB 함수 (PostGIS 전환 전 중간 단계)
  CREATE FUNCTION segments_in_bbox(min_lat float, max_lat float, min_lng float, max_lng float)
  RETURNS SETOF road_segments AS $$
    SELECT * FROM road_segments WHERE is_active = true AND (
      (start_lat BETWEEN min_lat AND max_lat AND start_lng BETWEEN min_lng AND max_lng)
      OR
      (end_lat BETWEEN min_lat AND max_lat AND end_lng BETWEEN min_lng AND max_lng)
    );
  $$ LANGUAGE sql STABLE;
  ```

### 기존 #3 [P1] 규칙 판정이 서버 로컬 타임존에 의존 — 동의, 확인됨

- 위치: `packages/rule-engine/src/evaluateRules.ts:7-11, 16-19`
- **확인:** `date.getDay()`, `date.getHours()`, `date.getMinutes()`를 사용한다. 이 메서드들은 런타임 환경의 로컬 타임존을 따른다.
- **영향:** 서버가 UTC 환경(Docker, 클라우드 기본값)에서 실행되면 한국 시간과 9시간 차이가 나서 모든 시간 판정이 어긋난다.
- **참고:** `backend/src/engine/rule-engine.ts`도 동일한 문제가 있다. `formatTime()`과 `getDayType()` 모두 `date.getHours()`, `date.getDay()` 사용.
- **판정: 기존 리뷰 정확. P1 유지.**
- **해결:** `evaluateRules.ts`의 `getDayType()`과 `formatTime()`에서 KST를 명시적으로 사용한다:
  ```typescript
  export function getDayType(date: Date): DayType {
    // toLocaleString으로 KST 기준 요일 계산
    const kstDay = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay();
    if (kstDay === 0) return 'sunday';
    if (kstDay === 6) return 'saturday';
    return 'weekday';
  }

  export function formatTime(date: Date): string {
    // Intl로 KST 기준 시:분 추출
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return formatter.format(date); // "07:00", "23:59" 등
  }
  ```
  `backend/src/engine/rule-engine.ts`의 `getDayType()`, `formatTime()`에도 동일 적용.

### 기존 #4 [P1] 공휴일 context 미전달 — 동의, 확인됨 + 범위 보완

- 위치: `apps/api/src/services/segmentService.ts:64-68` (getSegmentsInBBox), `apps/api/src/services/segmentService.ts:128-132` (getSegmentDetail), **`apps/api/src/routes/alerts.ts:73-76` (alerts/check)**
- **확인:** `getSegmentsInBBox()`, `getSegmentDetail()`, **그리고 `alerts/check` 엔드포인트** 모두 `evaluateRules()` 호출 시 `context` 필드를 넘기지 않는다. `isHoliday`가 항상 `false`로 평가된다.
- **영향:** 공휴일에도 평일 규칙이 적용되어 "진입 금지"로 오판된다. 사용자가 공휴일에 불필요한 우회를 하게 됨. **특히 alerts 경로는 사용자에게 직접 경고를 보내는 핵심 경로이므로, 이 경로의 공휴일 오판은 가장 직접적인 사용자 피해를 유발한다.**
- **참고:** `getSegmentStatus()`만 `isHoliday` 파라미터를 받아 전달한다. 하지만 이것도 클라이언트가 직접 `isHoliday=true`를 넘겨야 하는 구조로, 서버가 자동 판단하지 않는다.
- **판정: 기존 리뷰 정확하나, 대상 범위에 alerts 엔드포인트가 누락되어 있었음. 수정 시 반드시 3곳 모두 포함해야 한다. P1 유지.**
- **해결:** `backend/src/services/segment-service.ts`의 공휴일 캐시 패턴을 `apps/api`에도 도입한다. 서버가 자동으로 공휴일을 판단하여 context에 주입하도록 변경:
  ```typescript
  // apps/api/src/services/holidayService.ts (신규 파일)
  let holidayCache: Set<string> | null = null;
  let cacheDate = '';

  export async function isHolidayToday(): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    if (!holidayCache || cacheDate !== today) {
      const { data } = await supabase
        .from('holidays') // holidays 테이블 필요 (backend 스키마 참고)
        .select('date')
        .gte('date', `${new Date().getFullYear()}-01-01`);
      holidayCache = new Set((data || []).map((h: any) => h.date));
      cacheDate = today;
    }
    return holidayCache.has(today);
  }
  ```
  수정 대상 3곳 모두에 적용:
  ```typescript
  // segmentService.ts:getSegmentsInBBox(), getSegmentDetail()
  // alerts.ts:alertsRouter.post('/check')
  const holiday = await isHolidayToday();
  const result = evaluateRules(rules, {
    segmentId: seg.id,
    currentDateTime: now,
    vehicleType: vehicleType as any,
    context: { isHoliday: holiday },
  });
  ```
  `apps/api/seed/001_schema.sql`에 `holidays` 테이블이 없으므로 `backend/migrations/001_initial_schema.sql:69-79`의 holidays 테이블 DDL도 추가해야 한다.

### 기존 #5 [P2] 종일 규칙 00:00~23:59에서 23:59에 1분 빈틈 — 동의, 확인됨

- 위치: `packages/rule-engine/src/evaluateRules.ts:38`
- **확인:** `matchesTime()`이 `time >= startTime && time < endTime`을 사용한다. 23:59는 `< "23:59"`가 false이므로 매칭되지 않는다.
- **영향:** seed 데이터에서 버스/긴급차량의 24시간 허용 규칙(`00:00~23:59`)이 23:59에 1분간 비활성화된다. 종로 24시간 금지 규칙도 동일.
- **참고:** `backend/src/engine/rule-engine.ts:170-176`의 `isTimeInRange()`도 `current >= start && current < end`로 동일한 문제가 있다.
- **판정: 기존 리뷰 정확. 다만 실운영 영향도를 고려하면 P1으로 상향 권고.** 종로 중앙차로 24시간 금지 규칙이 23:59에 풀리면 해당 1분간 일반차량 진입 가능으로 오판되어, 해당 시점에 주행 중인 사용자에게 잘못된 안내를 줄 수 있다.
- **해결:** 두 가지 방법 중 택1:
  - **방법 A:** 종료 시각을 inclusive로 변경하고, seed 데이터는 그대로 유지:
    ```typescript
    function matchesTime(rule: RegulationRule, time: string): boolean {
      return time >= rule.startTime && time <= rule.endTime; // < → <=
    }
    ```
    단, 이 경우 `07:00~10:00` 규칙에서 `10:00`도 포함되므로 seed 데이터의 의미를 재검토해야 한다.
  - **방법 B (권장):** 종일 규칙은 `00:00~24:00`으로 표현하고, `matchesTime()`에서 `24:00`을 특수 처리:
    ```typescript
    function matchesTime(rule: RegulationRule, time: string): boolean {
      const end = rule.endTime === '24:00' ? '24:00' : rule.endTime;
      return time >= rule.startTime && time < end;
    }
    ```
    seed 데이터의 `23:59`를 `24:00`으로 변경:
    ```sql
    UPDATE regulation_rules SET end_time = '24:00' WHERE end_time = '23:59';
    ```

---

## Part B. 신규 발견 사항 (기존 리뷰에 없는 것)

### B-1. [P0 — 구조] 코드베이스 이중화: 두 개의 독립 구현이 공존

- **위치:** `apps/` + `packages/` vs `backend/` + `mobile/`
- **현상:**
  - `apps/api/` (Express + Supabase anon key) + `packages/rule-engine/` (단순 규칙 엔진) + `apps/mobile/` (React Native + @react-native-community/geolocation)
  - `backend/` (Express + Supabase service key) + `backend/src/engine/` (확장형 규칙 엔진) + `mobile/` (Expo + react-native-maps)
  - 두 구현의 DB 스키마가 다르다: `apps/api/seed/001_schema.sql`은 `road_segments`에 `start_lat/start_lng/end_lat/end_lng` + `polyline_json(JSONB)`, `backend/migrations/001_initial_schema.sql`은 `center_lat/center_lng` + `geometry(JSONB)` + `regulations` 중간 테이블
  - 두 구현의 규칙 엔진 설계가 근본적으로 다르다: `packages/rule-engine`은 flat rule 구조, `backend/src/engine`은 segment → regulation → rule 3단 계층 구조
  - 두 구현의 모바일 상태 값이 다르다: `apps/` 쪽은 `allowed|restricted|warning`, `backend/` 쪽은 `allowed|prohibited|caution`
- **왜 문제인가:** 어느 것이 production 코드인지 불명확하다. 버그 수정을 한쪽에만 적용하면 다른 쪽은 여전히 취약하다. 실제로 기존 리뷰 #1의 `distanceToPolyline` 수정이 backend에만 반영되어 있다. 신규 개발자가 합류하면 어느 코드를 봐야 하는지 혼란스럽다.
- **개선:** backend 쪽이 설계적으로 더 성숙하다(3단 계층, 공휴일 캐시, 자정 교차 처리, caution 상태 등). 다만 PostGIS 확장(`CREATE EXTENSION postgis`)을 켜두었을 뿐 실제 공간 연산(`ST_Intersects` 등)은 사용하지 않고, geometry도 JSONB에 저장하며 `center_lat`/`center_lng` 조건으로 조회하는 수준이므로, PostGIS를 활용하고 있다고 보기는 어렵다. 향후 전환 준비가 되어 있는 정도로 보는 것이 정확하다.
  **실행 단계:**
  1. `backend/` + `mobile/`을 정본으로 확정 (설계 성숙도 기준)
  2. `apps/api/seed/001_schema.sql`의 데이터를 `backend/migrations/001_initial_schema.sql` 스키마로 마이그레이션
  3. `packages/rule-engine/`에서 필요한 export 함수(distanceToPolyline, getAlertLevel)는 `backend/src/engine/`으로 통합
  4. `apps/` 디렉토리 전체 삭제, `packages/` 삭제
  5. `package.json` workspaces 설정을 `backend/` + `mobile/`로 변경
  6. 루트 `package.json`의 scripts(`test:engine`, `dev:api`, `build:engine`)를 새 구조에 맞게 수정

### B-2. [P1 — 버그] toRegulationRule에서 null time 처리 오류

- **위치:** `apps/api/src/services/segmentService.ts:22-23`, `apps/api/src/routes/alerts.ts:14-15`
- **현상:**
  ```typescript
  startTime: row.start_time?.slice(0, 5) ?? row.start_time,
  endTime: row.end_time?.slice(0, 5) ?? row.end_time,
  ```
  `row.start_time`이 `null`이면 `?.slice()`는 `undefined`를 반환하고, `?? row.start_time`은 `null`을 반환한다. 결과적으로 `startTime: null`이 되어 이후 문자열 비교(`time >= rule.startTime`)에서 예측 불가능한 동작이 발생한다.
- **왜 문제인가:** DB에서 TIME 컬럼이 NOT NULL이므로 현재는 발생하지 않을 수 있으나, 데이터 마이그레이션이나 수동 편집 시 null이 들어오면 규칙 엔진이 조용히 잘못된 판정을 내린다.
- **개선:** 기본값으로 보정하는 방식(`'00:00'`/`'23:59'` 대입)은 오히려 위험하다. 잘못된 데이터가 들어왔을 때 전일 규제로 오해되어 더 큰 오동작을 만들 수 있기 때문이다. 현재 스키마가 NOT NULL인 만큼, null이 발생하면 **데이터 오류로 처리**하는 것이 안전하다:
  ```typescript
  if (!row.start_time || !row.end_time) {
    console.error(`Rule ${row.id}: start_time or end_time is null, skipping`);
    return null; // 호출부에서 .filter(Boolean) 처리
  }
  ```
  병행하여 운영 데이터 정합성 점검 쿼리를 정기적으로 돌려야 한다.

### B-3. [P1 — 버그] 자정 교차 규칙 미처리 (packages/rule-engine)

- **위치:** `packages/rule-engine/src/evaluateRules.ts:38`
- **현상:** `matchesTime()`이 `time >= startTime && time < endTime`만 검사한다. 만약 규칙이 `23:00~02:00` (자정 교차)이라면 이 로직으로는 어떤 시간도 매칭되지 않는다.
- **왜 문제인가:** 현재 seed 데이터에는 자정 교차 규칙이 없지만, 고속도로 버스전용차로 등 향후 확장 시 야간 규칙이 추가될 수 있다. PRD에서 expressway_bus_lane을 확장 계획으로 명시하고 있다.
- **참고:** `backend/src/engine/rule-engine.ts:170-176`은 자정 교차를 올바르게 처리한다:
  ```typescript
  if (end <= start) {
    return current >= start || current < end;
  }
  ```
- **개선:** `matchesTime()`에 자정 교차 로직 추가.

### B-4. [P1 — 보안] CORS 무제한 허용

- **위치:** `apps/api/src/index.ts:9`, `backend/src/app.ts:9`
- **현상:** `app.use(cors())`로 모든 origin을 허용한다.
- **왜 문제인가:** 악의적 웹사이트에서 사용자의 브라우저를 통해 API를 호출할 수 있다. 모바일 앱 전용이라도, 관리 도구나 웹 대시보드가 추가되면 CSRF 공격 벡터가 된다.
- **개선:** 허용 origin을 명시적으로 지정:
  ```typescript
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || [] }));
  ```

### B-5. [P1 — 보안] API 인증/인가 전무

- **위치:** 모든 API 라우트
- **현상:** 어떤 API 엔드포인트에도 인증이 없다. 누구나 `POST /api/alerts/check`를 호출할 수 있다.
- **왜 문제인가:**
  1. alert_logs에 임의의 위치 데이터를 대량 삽입할 수 있다 (데이터 오염)
  2. 무제한 호출로 DB 부하를 유발할 수 있다
  3. 사용자 위치 데이터가 포함된 로그를 보호할 수 없다
- **개선:** MVP 단계에서는 API key 미들웨어로 최소 인증을 확보한다:
  ```typescript
  // apps/api/src/middleware/apiKey.ts
  export function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }
  // index.ts
  app.use('/api/segments', requireApiKey, segmentsRouter);
  app.use('/api/alerts', requireApiKey, alertsRouter);
  ```
  모바일 앱에서는 빌드 시 API key를 주입하여 헤더에 포함한다.

### B-6. [P1 — 보안] 에러 메시지에 내부 정보 노출

- **위치:** `apps/api/src/routes/segments.ts:29`, `apps/api/src/routes/alerts.ts:112`
- **현상:**
  ```typescript
  res.status(500).json({ error: err.message });
  ```
  Supabase 에러 메시지, 스택 트레이스 등이 클라이언트에 그대로 반환된다.
- **왜 문제인가:** 공격자가 DB 구조, 테이블명, 컬럼명 등을 파악할 수 있다.
- **개선:** 프로덕션에서는 generic 메시지만 반환하고, 상세 에러는 서버 로그로만 남겨라:
  ```typescript
  console.error('GET /api/segments error:', err);
  res.status(500).json({ error: 'Internal server error' });
  ```
  (backend 쪽은 이미 이렇게 구현되어 있다.)

### B-7. [P1 — 보안] alert_logs에 사용자 위치(PII) 무조건 기록

- **위치:** `apps/api/src/routes/alerts.ts:98-108`
- **현상:** 경고 발생 시 `user_lat`, `user_lng`를 `alert_logs`에 저장한다. 사용자 동의 확인 없이, 보존 기간 정책 없이 무기한 저장된다.
- **왜 문제인가:** 개인정보보호법상 위치 정보는 민감 개인정보다. 동의 없는 수집 및 무기한 보관은 법적 리스크가 있다.
- **개선:**
  1. 모바일 앱에서 최초 실행 시 위치 정보 수집 동의 화면 표시 (약관 포함)
  2. 좌표 정밀도를 낮춰 익명화 (소수점 3자리 ≈ 100m 단위):
     ```typescript
     user_lat: Math.round(lat * 1000) / 1000,
     user_lng: Math.round(lng * 1000) / 1000,
     ```
  3. 보존 기간 정책 적용 (B-29와 연계):
     ```sql
     DELETE FROM alert_logs WHERE created_at < NOW() - INTERVAL '30 days';
     ```

### B-8. [P1 — 안정성] Rate Limiting 부재

- **위치:** 모든 API 엔드포인트
- **현상:** 요청 횟수 제한이 없다.
- **왜 문제인가:** 단일 클라이언트가 초당 수백 건의 `POST /api/alerts/check`를 호출하면 DB 커넥션이 고갈되고 서비스가 다운된다. `alert_logs` INSERT까지 포함되므로 디스크도 빠르게 차른다.
- **개선:**
  ```typescript
  import rateLimit from 'express-rate-limit';
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60 }));
  ```

### B-9. [P2 — 버그] alerts API의 bbox 프리필터가 radiusMeters와 불일치

- **위치:** `apps/api/src/routes/alerts.ts:30-46`
- **현상:** `POST /api/alerts/check`는 요청 body에서 `radiusMeters`(기본값 500)를 받아 거리 기반 필터링에 사용한다. 그러나 사전 bbox 필터는 고정값 `delta = 0.006`(약 600m)을 사용한다:
  ```typescript
  const delta = 0.006; // 약 600m
  .gte('start_lat', lat - delta)
  .lte('start_lat', lat + delta)
  ```
  클라이언트가 `radiusMeters = 1000`처럼 더 큰 반경을 요청하더라도, 사전 bbox는 600m 범위로 고정되어 있다.
- **왜 문제인가:** 600m~1000m 거리에 있는 세그먼트는 bbox 프리필터 단계에서 이미 제외되므로, 거리 계산(`distanceToPolyline`) 자체가 수행되지 않는다. 결과적으로 요청한 반경 내에 실제로 존재하는 세그먼트가 응답에서 누락되는 **false negative**가 발생한다.
- **개선:** `delta`를 `radiusMeters`에 연동하여 동적으로 계산하라:
  ```typescript
  const deltaLat = radiusMeters / 111_320; // 1도 위도 ≈ 111.32km
  const deltaLng = radiusMeters / (111_320 * Math.cos(lat * Math.PI / 180));
  ```

### B-10. [P2 — 성능] 공간 필터링 부재로 인한 애플리케이션 레벨 과잉 후처리

- **위치:** `apps/api/src/services/segmentService.ts:33-80`
- **현상:** DB 쿼리 자체는 세그먼트 1회 + 규칙 1회로 총 2회이므로 전형적인 N+1 패턴은 아니다. 그러나 공간 인덱싱 없이 bbox를 `start_lat`/`start_lng` 범위로만 필터링한 뒤, 조회된 전체 규칙을 메모리에 올려 세그먼트별로 N번 `evaluateRules()`를 반복 호출한다.
- **왜 문제인가:** 현재는 5개 세그먼트라 문제없지만, 서울 전체 버스전용차로(100개 이상 구간)로 확장 시 공간 조건을 DB에서 충분히 소화하지 못해 애플리케이션 레벨 후처리 비용이 급증한다. bbox가 넓을수록 불필요한 세그먼트와 규칙까지 읽어온다.
- **개선:** 단기적으로는 세그먼트-규칙 JOIN RPC로 쿼리를 통합하고, 중기적으로 PostGIS 전환을 진행한다:
  ```sql
  -- 단기: JOIN으로 쿼리 통합 (Supabase RPC)
  CREATE FUNCTION segments_with_rules(min_lat float, max_lat float, min_lng float, max_lng float)
  RETURNS TABLE(segment_row road_segments, rule_row regulation_rules) AS $$
    SELECT s.*, r.*
    FROM road_segments s
    LEFT JOIN regulation_rules r ON r.segment_id = s.id AND r.is_active = true
    WHERE s.is_active = true
      AND s.start_lat BETWEEN min_lat AND max_lat
      AND s.start_lng BETWEEN min_lng AND max_lng;
  $$ LANGUAGE sql STABLE;
  ```

### B-11. [P2 — 성능] 모바일 과다 폴링으로 배터리 소모

- **위치:**
  - `apps/mobile/src/screens/HomeScreen.tsx:13` — `POLL_INTERVAL = 5000` (5초)
  - `mobile/src/hooks/useSegments.ts:16` — `POLL_INTERVAL_MS = 30_000` (30초)
  - `mobile/src/hooks/useLocation.ts:65` — `distanceInterval: 20` (20m 이동마다)
- **현상:** apps/mobile은 5초마다 API 2건(segments + alerts)을 호출한다. 분당 24건, 시간당 1,440건.
- **왜 문제인가:**
  1. 배터리 소모가 심각하다 — GPS + 네트워크 동시 사용
  2. 서버 부하: 사용자 1만명이면 분당 24만 건
  3. 사용자가 정차 중이어도 계속 호출한다
- **개선:**
  1. `apps/mobile/src/screens/HomeScreen.tsx:13`의 `POLL_INTERVAL`을 `30000`(30초)으로 변경
  2. `mobile/src/hooks/useSegments.ts`에 위치 변화 임계값을 추가:
     ```typescript
     const SIGNIFICANT_DISTANCE_M = 50; // 50m 이상 이동 시에만 재호출

     const refresh = useCallback(async () => {
       if (!location) return;
       if (lastFetchLocation.current) {
         const moved = haversine(lastFetchLocation.current, location);
         if (moved < SIGNIFICANT_DISTANCE_M) return; // 무시
       }
       lastFetchLocation.current = location;
       // ... fetch 로직
     }, [location?.lat, location?.lng, vehicleType]);
     ```

### B-12. [P2 — 성능] 목록 API에 pagination 없음

- **위치:** `apps/api/src/routes/segments.ts:10-31`
- **현상:** `GET /api/segments`가 bbox 내 모든 세그먼트를 한 번에 반환한다.
- **왜 문제인가:** 사용자가 지도를 축소하여 넓은 영역을 보면 수백 개 세그먼트가 반환될 수 있다. polyline_json까지 포함하면 응답 크기가 수 MB에 달할 수 있다.
- **개선:** Supabase의 `.range()` 메서드로 pagination을 추가한다:
  ```typescript
  // routes/segments.ts
  const page = parseInt(req.query.page as string) || 0;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);

  // segmentService.ts
  q = q.range(page * pageSize, (page + 1) * pageSize - 1);
  ```
  응답에 `totalCount`, `page`, `pageSize`를 포함하여 클라이언트가 다음 페이지를 요청할 수 있도록 한다.

### B-13. [P2 — 데이터 무결성] enum 컬럼에 CHECK 제약 없음

- **위치:** `apps/api/seed/001_schema.sql` 전체
- **현상:** `regulation_type`, `day_type`, `holiday_type`, `rule_action`, `vehicle_type`, `direction` 등이 모두 VARCHAR/TEXT로 정의되어 있고, CHECK 제약이 없다.
- **왜 문제인가:** 오타나 잘못된 값이 들어가면 규칙 엔진이 조용히 무시한다. 예: `day_type = 'Weekday'`(대문자)가 들어가면 매칭 실패 → 규칙 미적용 → 잘못된 '진입 가능' 판정.
- **개선:**
  ```sql
  ALTER TABLE regulation_rules
    ADD CONSTRAINT chk_day_type CHECK (day_type IN ('weekday','saturday','sunday','all'));
  ```

### B-14. [P2 — 데이터 무결성] updated_at 자동 갱신 트리거 없음

- **위치:** `apps/api/seed/001_schema.sql:21`, `backend/migrations/001_initial_schema.sql:24`
- **현상:** `updated_at` 컬럼이 `DEFAULT now()`로만 설정되어 있고, UPDATE 시 자동 갱신 트리거가 없다.
- **왜 문제인가:** 레코드를 수정해도 `updated_at`이 변하지 않아, 캐시 무효화나 변경 이력 추적이 불가능하다.
- **개선:**
  ```sql
  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_road_segments_updated
    BEFORE UPDATE ON road_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  ```

### B-15. [P2 — 로그/모니터링] 구조화된 로깅 부재

- **위치:** 모든 서버 코드
- **현상:** `console.log`, `console.error`, `console.warn`만 사용한다. 로그에 timestamp, request ID, 심각도 레벨이 없다.
- **왜 문제인가:** 장애 발생 시 로그를 시간순으로 추적하거나, 특정 요청의 전체 흐름을 재구성할 수 없다. 멀티 인스턴스 환경에서는 로그가 뒤섞여 디버깅이 불가능하다.
- **개선:** pino + request ID 미들웨어를 도입한다:
  ```typescript
  // apps/api/src/logger.ts
  import pino from 'pino';
  export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

  // apps/api/src/middleware/requestId.ts
  import { randomUUID } from 'crypto';
  export function requestId(req: Request, _res: Response, next: NextFunction) {
    req.id = req.headers['x-request-id'] as string || randomUUID();
    next();
  }

  // 사용 예
  logger.info({ reqId: req.id, lat, lng }, 'alerts/check called');
  logger.error({ reqId: req.id, err }, 'alerts/check failed');
  ```

### B-16. [P2 — 로그/모니터링] health check가 DB 연결 미검증

- **위치:** `apps/api/src/index.ts:12-14`, `backend/src/app.ts:12-14`
- **현상:** health check가 단순히 `{ status: 'ok' }`만 반환한다. DB 연결 상태를 확인하지 않는다.
- **왜 문제인가:** DB가 다운되어도 health check는 ok를 반환한다. 로드밸런서가 죽은 인스턴스로 계속 트래픽을 보낸다.
- **개선:** 이 코드베이스의 Supabase 클라이언트는 쿼리 실패 시 예외를 던지지 않고 반환값의 `error` 필드로 결과를 돌려준다(`segmentService.ts:47` 등 참고). 따라서 try/catch만으로는 DB 장애를 감지할 수 없다. 반환값의 `error`를 직접 확인해야 한다:
  ```typescript
  app.get('/api/health', async (_req, res) => {
    const { error } = await supabase.from('road_segments').select('id').limit(1);
    if (error) {
      console.error('health check DB failure:', error.message);
      return res.status(503).json({ status: 'unhealthy', db: 'disconnected' });
    }
    return res.json({ status: 'ok', db: 'connected' });
  });
  ```

### B-17. [P2 — 코드 품질] `as any` 남용으로 타입 안전성 무력화

- **위치:** `apps/api/src/services/segmentService.ts:51,63,68,86,101,117,132` 등
- **현상:** DB에서 가져온 데이터를 `(s: any)`, `vehicleType as any` 등으로 처리한다.
- **왜 문제인가:** TypeScript를 사용하는 의미가 퇴색된다. 필드명 오타, 타입 불일치를 컴파일 타임에 잡을 수 없다.
- **개선:** Supabase CLI로 타입을 자동 생성하고, `as any` 대신 타입 인터페이스를 사용한다:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > apps/api/src/database.types.ts
  ```
  ```typescript
  // apps/api/src/supabase.ts
  import { Database } from './database.types';
  export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

  // segmentService.ts — as any 제거
  const { data: segments } = await q;
  // segments는 자동으로 Database['public']['Tables']['road_segments']['Row'][] 타입
  ```

### B-18. [P2 — 코드 품질] toRegulationRule 함수 중복

- **위치:** `apps/api/src/services/segmentService.ts:15-28`, `apps/api/src/routes/alerts.ts:7-19`
- **현상:** 완전히 동일한 `toRegulationRule()` 함수가 두 파일에 복사되어 있다.
- **왜 문제인가:** 한쪽만 수정하면 다른 쪽에 버그가 남는다. 실제로 두 파일의 코드가 동일하므로, 이미 동기화 관리 부담이 있다.
- **개선:** `apps/api/src/utils/mappers.ts`로 추출하고 두 파일에서 import한다:
  ```typescript
  // apps/api/src/utils/mappers.ts
  import { RegulationRule } from '@bus-lane/rule-engine';

  export function toRegulationRule(row: any): RegulationRule | null {
    if (!row.start_time || !row.end_time) {
      console.error(`Rule ${row.id}: start_time or end_time is null, skipping`);
      return null;
    }
    return {
      id: row.id,
      segmentId: row.segment_id,
      vehicleType: row.vehicle_type,
      dayType: row.day_type,
      holidayType: row.holiday_type,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      ruleAction: row.rule_action,
      priority: row.priority,
      ruleDescription: row.rule_description ?? '',
    };
  }
  ```
  호출부에서 `.map(toRegulationRule).filter(Boolean)` 패턴 사용 (B-2 해결도 동시 반영).

### B-19. [P2 — 코드 품질] distanceMeters 함수 3중 복제

- **위치:**
  1. `packages/rule-engine/src/geo.ts:4-17`
  2. `apps/mobile/src/utils/geo.ts:4-17`
  3. `backend/src/engine/geo-utils.ts:12-23`
- **현상:** Haversine 공식이 3곳에 독립적으로 구현되어 있다. 인터페이스도 각각 다르다(2개 좌표 vs Coordinate 객체).
- **왜 문제인가:** 수정 시 3곳을 모두 변경해야 한다. 이미 `distanceToPolyline`의 구현이 packages와 backend에서 다르다(꼭짓점 vs 선분).
- **개선:** 코드베이스 단일화(B-1) 이후, 선택된 정본의 geo 모듈을 패키지로 export하고 모바일에서도 import한다:
  ```typescript
  // mobile/src/utils/geo.ts — 삭제하고 import로 교체
  export { distanceMeters } from '@bus-lane/rule-engine';
  ```
  모바일에서 rule-engine 전체를 번들하기 부담되면, geo 함수만 별도 패키지(`@bus-lane/geo`)로 분리하는 것도 방법이다.

### B-20. [P3 — 안정성] Supabase 클라이언트 연결 실패 시 앱 크래시 가능

- **위치:** `apps/api/src/supabase.ts:6-7`
- **현상:**
  ```typescript
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
  ```
  환경변수가 없으면 빈 문자열로 클라이언트를 생성한다. `console.warn`만 출력하고 서버는 시작된다.
- **왜 문제인가:** 모든 DB 쿼리가 실패하지만 서버는 살아있다. 500 에러가 반복적으로 발생하면서 원인 파악이 어렵다.
- **참고:** `backend/src/config/database.ts:10-12`는 `throw new Error()`로 즉시 실패한다 (올바른 구현).
- **개선:** 환경변수 누락 시 서버 시작을 중단하라:
  ```typescript
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }
  ```

### B-21. [P3 — 안정성] alert_logs INSERT 실패가 조용히 무시됨

- **위치:** `apps/api/src/routes/alerts.ts:97-108`
- **현상:** `await supabase.from('alert_logs').insert(...)` 의 반환값(error)을 확인하지 않는다.
- **왜 문제인가:** 로그 기록이 실패해도 알 수 없다. alert_logs 테이블이 가득 차거나 구조가 변경되어도 감지할 방법이 없다.
- **개선:** 에러를 확인하되, 사용자 응답에는 영향을 주지 않도록:
  ```typescript
  const { error: logError } = await supabase.from('alert_logs').insert(...);
  if (logError) console.error('alert_logs insert failed:', logError);
  ```

### B-22. [P3 — 운영] 테스트 커버리지 불균형

- **현상:**
  - `packages/rule-engine`: evaluateRules, geo 테스트 있음 (양호)
  - `backend/src/engine`: rule-engine 단위 테스트 있음 (양호)
  - `apps/api`: 통합 테스트 전무
  - `mobile/`, `apps/mobile`: 테스트 전무
- **왜 문제인가:** API 레벨에서 라우트 → 서비스 → 엔진 → DB 연동 흐름을 검증하지 못한다. 특히 `toRegulationRule` 변환, bbox 쿼리, 공휴일 context 전달 등의 통합 버그를 잡을 수 없다.
- **개선:** supertest로 핵심 시나리오 API 통합 테스트를 추가한다:
  ```typescript
  // apps/api/src/__tests__/segments.integration.test.ts
  import request from 'supertest';
  import app from '../index';

  describe('GET /api/segments', () => {
    it('bbox 파라미터 누락 시 400 반환', async () => {
      const res = await request(app).get('/api/segments');
      expect(res.status).toBe(400);
    });

    it('유효한 bbox로 세그먼트 목록 반환', async () => {
      const res = await request(app).get('/api/segments')
        .query({ minLat: 37.50, minLng: 126.90, maxLat: 37.58, maxLng: 127.05 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('segments');
    });
  });

  describe('POST /api/alerts/check', () => {
    it('비숫자 좌표 시 400 반환', async () => {
      const res = await request(app).post('/api/alerts/check')
        .send({ lat: 'abc', lng: 127.0 });
      expect(res.status).toBe(400);
    });
  });
  ```

### B-23. [P1 — 보안] 입력값 타입 검증 부재 — NaN이 DB 쿼리까지 도달

- **위치:** `apps/api/src/routes/segments.ts:12-13`, `apps/api/src/routes/alerts.ts:30-32`
- **현상:** segments 라우트에서 `Number(minLat)` 결과가 `NaN`인지 확인하지 않는다. alerts 라우트에서는 `lat == null` 검사만 하고, `lat = "abc"` 같은 비숫자 문자열은 통과한다.
  ```typescript
  // segments.ts — NaN 체크 없이 서비스 호출
  minLat: Number(minLat),  // "abc" → NaN → .gte('start_lat', NaN)

  // alerts.ts — 타입 체크 없음
  if (lat == null || lng == null) { ... }  // lat = "hello" → 통과
  // 이후 lat - delta → NaN → bbox 조건 무의미
  ```
- **왜 문제인가:** NaN이 Supabase 쿼리에 들어가면 결과가 0건이 된다. 사용자에게 "주변에 규제 없음"으로 표시되지만, 실제로는 쿼리 자체가 무의미한 상태다. 규제 구간 한복판에서도 "진입 가능"으로 오판될 수 있다.
- **개선:**
  ```typescript
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers' });
  }
  ```

### B-24. [P3 — 하드닝] request body 크기 제한 명시적 설정 권고

- **위치:** `apps/api/src/index.ts:10`, `backend/src/app.ts:9`
- **현상:** `app.use(express.json())`에 `limit` 옵션이 명시되어 있지 않다.
- **사실관계:** Express의 `express.json()`은 기본적으로 100KB 제한이 걸려 있다. 따라서 "수십 MB body로 메모리를 고갈시킬 수 있다"는 설명은 사실과 다르다. 100KB를 초과하는 body는 이미 413 에러로 거부된다.
- **왜 그래도 개선이 필요한가:** 이 앱의 정상 요청 body는 좌표+차량종류 수준(`{ lat, lng, vehicleType }`)으로 1KB 미만이다. 기본 100KB는 이 용도 대비 과하게 넓다. 명시적으로 줄여두면 의도를 코드에 기록하는 효과도 있다.
- **개선:**
  ```typescript
  app.use(express.json({ limit: '16kb' }));
  ```

### B-25. [P1 — 운영] 프로덕션 API URL이 플레이스홀더 상태

- **위치:** `mobile/src/services/api.ts:3`, `apps/mobile/src/services/api.ts:7`
- **현상:**
  ```typescript
  // mobile/
  : 'https://your-api.railway.app/api';
  // apps/mobile/
  : 'https://your-production-url.com/api';
  ```
  `__DEV__`가 false인 프로덕션 빌드에서 이 플레이스홀더 URL로 요청한다.
- **왜 문제인가:** 서버 코드의 모든 버그를 수정하고 배포해도, 모바일 앱의 프로덕션 빌드는 존재하지 않는 서버에 요청을 보내므로 아무것도 동작하지 않는다. 빌드 에러가 나지 않기 때문에 QA 단계까지 발견되지 않을 수 있다.
- **개선:** 환경 변수 또는 빌드 설정으로 주입하고, 플레이스홀더가 남아있으면 빌드 타임에 에러를 발생시켜라:
  ```typescript
  const API_BASE = __DEV__
    ? 'http://10.0.2.2:3000/api'
    : process.env.EXPO_PUBLIC_API_URL;

  if (!API_BASE) throw new Error('EXPO_PUBLIC_API_URL is not configured');
  ```

### B-26. [P2 — 버그] SettingsScreen 설정값이 앱에 반영되지 않음

- **위치:** `apps/mobile/src/screens/SettingsScreen.tsx`
- **현상:** `alertEnabled`와 `selectedCity`가 로컬 `useState`로만 존재한다.
  - AsyncStorage 등에 저장하지 않으므로 앱 재시작 시 초기화된다.
  - `selectedCity` 값이 API 호출의 파라미터로 전달되지 않는다.
  - `alertEnabled = false`로 설정해도 `HomeScreen`이나 `MapScreen`의 경고 표시 로직에 영향을 주지 않는다.
- **왜 문제인가:** 사용자가 설정을 변경했다고 생각하지만 실제로는 아무 효과가 없다. "경고 알림 끄기"를 선택한 사용자에게 계속 경고가 표시된다.
- **개선:** 설정값을 Context 또는 전역 상태(zustand, AsyncStorage)로 관리하고, API 호출 시 `vehicleType`/`city` 파라미터에 반영하라. `alertEnabled`는 `StatusBanner`/`AlertBanner` 렌더링 조건에 연결하라.

### B-27. [P2 — 안정성] 빠른 위치 갱신 시 응답 역전(race condition)

- **위치:** `mobile/src/hooks/useSegments.ts:56-65`, `apps/mobile/src/screens/HomeScreen.tsx:71-93`
- **현상:** 위치가 변경될 때마다 `getSegments()` + `checkAlerts()`를 호출한다. 이전 요청의 응답이 최신 요청보다 늦게 도착하면, 과거 위치 기반 결과가 현재 상태를 덮어쓴다. `AbortController`로 이전 요청을 취소하는 로직이 없다.
- **왜 문제인가:** 차량이 빠르게 이동하는 상황(고속도로 진입 등)에서 "진입 가능"과 "진입 금지"가 번갈아 표시될 수 있다. 사용자가 가장 중요한 순간에 잘못된 정보를 받는다.
- **개선:**
  ```typescript
  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [location?.lat, location?.lng]);
  ```

### B-28. [P2 — 안정성] 서버 graceful shutdown 미구현

- **위치:** `apps/api/src/index.ts:19-21`, `backend/src/app.ts:20-22`
- **현상:** `app.listen()` 호출만 있고, SIGTERM/SIGINT 핸들러가 없다.
- **왜 문제인가:** 컨테이너 환경(Docker, Railway, Fly.io)에서 배포 시 rolling update가 되면 SIGTERM이 전송된다. 핸들러가 없으면 진행 중인 요청이 즉시 끊어진다. 특히 `alert_logs` INSERT가 진행 중이면 데이터 유실이 발생한다.
- **개선:**
  ```typescript
  const server = app.listen(PORT, () => { ... });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => process.exit(0));
  });
  ```

### B-29. [P2 — 데이터] alert_logs 무한 증가 — 보존 정책 부재

- **위치:** `apps/api/seed/001_schema.sql:42-51`
- **현상:** FINAL_REVIEW B-7에서 PII 문제는 다루었으나, 테이블 크기 증가 자체는 별개 문제다. TTL 정책, 파티셔닝, 자동 삭제 메커니즘이 없다. `idx_alerts_created`(created_at DESC)가 있지만 오래된 데이터를 삭제하는 수단이 없으므로 인덱스도 계속 커진다.
- **왜 문제인가:** 사용자 1만명이 하루 평균 10건의 경고를 발생시키면 월 300만 건이 쌓인다. 1년이면 3,600만 건이며, 이 테이블이 DB에서 가장 먼저 쿼리 성능 병목이 된다.
- **개선:**
  ```sql
  -- 월별 파티셔닝
  CREATE TABLE alert_logs (...) PARTITION BY RANGE (created_at);

  -- 또는 주기적 삭제 정책
  DELETE FROM alert_logs WHERE created_at < NOW() - INTERVAL '90 days';
  ```

### B-30. [P3 — 확장성] API 버전 관리 없음

- **위치:** 모든 라우트 — `/api/segments`, `/api/alerts`
- **현상:** 라우트에 버전 prefix가 없다.
- **왜 문제인가:** 모바일 앱은 한번 배포되면 사용자가 업데이트할 때까지 이전 버전이 남아있다. 서버 API 응답 구조를 변경하면 구버전 앱이 즉시 깨진다. 이미 `apps/`와 `backend/`에서 응답 구조가 다른 상태이므로, 코드베이스 단일화(B-1) 시점에 버전 관리가 없으면 기존 클라이언트가 전부 깨진다.
- **개선:** 라우트에 버전 prefix를 추가한다:
  ```typescript
  // backend/src/app.ts 또는 apps/api/src/index.ts
  app.use('/api/v1', segmentRoutes);

  // 구버전 호환이 필요하면 redirect
  app.use('/api/segments', (_req, res) => {
    res.status(301).json({ error: 'Use /api/v1/segments' });
  });
  ```
  모바일 앱의 `API_BASE`도 `/api/v1`로 변경한다.

### B-31. [P3 — 데이터] seed 데이터 재실행 시 PK 충돌

- **위치:** `apps/api/seed/002_seed_seoul.sql`
- **현상:**
  ```sql
  INSERT INTO road_segments (id, ...) VALUES ('11111111-1111-1111-1111-111111111101', ...);
  ```
  고정 UUID로 INSERT하므로 seed를 두 번 실행하면 PK 중복 에러가 발생한다. `ON CONFLICT` 절이 없다.
- **왜 문제인가:** 개발/테스트 환경에서 DB를 초기화하지 않고 seed를 재실행할 수 없다. CI 파이프라인에서도 매번 DB를 drop해야 하므로 워크플로우가 불편해진다.
- **개선:**
  ```sql
  INSERT INTO road_segments (id, ...) VALUES (...)
  ON CONFLICT (id) DO UPDATE SET
    road_name = EXCLUDED.road_name,
    polyline_json = EXCLUDED.polyline_json,
    updated_at = NOW();
  ```

---

## Part C. 종합 비교표

| # | 항목 | 기존 리뷰 | 독립 리뷰 | 최종 심각도 | 비고 |
|---|---|---|---|---|---|
| 1 | distanceToPolyline 꼭짓점 기준 | P1 발견 | 동의 + backend에 수정본 있음 확인 | **P1** | |
| 2 | bbox가 start_lat만 사용 | P1 발견 | 동의 + backend도 center_lat으로 불완전 | **P1** | |
| 3 | 서버 타임존 의존 | P1 발견 | 동의 + backend도 동일 문제 | **P1** | |
| 4 | isHoliday 미전달 | P1 발견 | 동의 + **alerts 엔드포인트 범위 추가** | **P1** | 기존 리뷰에서 alerts 누락 |
| 5 | 00:00~23:59 1분 빈틈 | P2 발견 | 동의 + P1 상향 권고 | **P1** | 24시간 금지 규칙 영향 |
| 6 | 코드베이스 이중화 | 미발견 | **신규 발견** | **P0** | |
| 7 | toRegulationRule null 처리 | 미발견 | **신규 발견** (개선 방향 수정) | **P1** | 기본값 보정→검증 실패 처리 |
| 8 | 자정 교차 규칙 미처리 | 미발견 | **신규 발견** | **P1** | |
| 9 | CORS 무제한 | 미발견 | **신규 발견** | **P1** | |
| 10 | API 인증 전무 | 미발견 | **신규 발견** | **P1** | |
| 11 | 에러 메시지 내부정보 노출 | 미발견 | **신규 발견** | **P1** | |
| 12 | 위치 PII 무동의 수집 | 미발견 | **신규 발견** | **P1** | |
| 13 | Rate limiting 없음 | 미발견 | **신규 발견** | **P1** | |
| 14 | alerts bbox 프리필터 불일치 | 미발견 | **신규 발견** (피드백 반영) | **P2** | radiusMeters vs 고정 delta |
| 15 | 공간 필터링 부재 후처리 과잉 | 미발견 | **신규 발견** (표현 수정) | P2 | N+1→후처리 비용 문제 |
| 16 | 과다 폴링 (5초) | 미발견 | **신규 발견** | P2 | |
| 17 | pagination 없음 | 미발견 | **신규 발견** | P2 | |
| 18 | enum CHECK 제약 없음 | 미발견 | **신규 발견** | P2 | |
| 19 | updated_at 트리거 없음 | 미발견 | **신규 발견** | P2 | |
| 20 | 구조화된 로깅 없음 | 미발견 | **신규 발견** | P2 | |
| 21 | health check DB 미검증 | 미발견 | **신규 발견** | P2 | |
| 22 | `as any` 남용 | 미발견 | **신규 발견** | P2 | |
| 23 | toRegulationRule 중복 | 미발견 | **신규 발견** | P2 | |
| 24 | distanceMeters 3중 복제 | 미발견 | **신규 발견** | P2 | |
| 25 | Supabase 연결 실패 시 크래시 | 미발견 | **신규 발견** | P3 | |
| 26 | alert_logs INSERT 에러 무시 | 미발견 | **신규 발견** | P3 | |
| 27 | 테스트 커버리지 불균형 | 미발견 | **신규 발견** | P3 | |
| 28 | 입력값 NaN 검증 부재 | 미발견 | **신규 발견** (2차 점검) | **P1** | 잘못된 안전 판정 유발 |
| 29 | request body 크기 명시적 설정 | 미발견 | **신규 발견** (2차 점검, 심각도 정정) | P3 | 기본 100KB 존재, 하드닝 수준 |
| 30 | 프로덕션 API URL 플레이스홀더 | 미발견 | **신규 발견** (2차 점검) | **P1** | 배포 자체 불가 |
| 31 | SettingsScreen 설정 미반영 | 미발견 | **신규 발견** (2차 점검) | P2 | 사용자 기만 |
| 32 | 위치 갱신 race condition | 미발견 | **신규 발견** (2차 점검) | P2 | 고속 이동 시 판정 혼란 |
| 33 | graceful shutdown 미구현 | 미발견 | **신규 발견** (2차 점검) | P2 | 배포 시 요청 유실 |
| 34 | alert_logs 무한 증가 | 미발견 | **신규 발견** (2차 점검) | P2 | PII(B-7)와 별개의 성능 문제 |
| 35 | API 버전 관리 없음 | 미발견 | **신규 발견** (2차 점검) | P3 | 구버전 앱 즉시 파손 |
| 36 | seed 재실행 시 PK 충돌 | 미발견 | **신규 발견** (2차 점검) | P3 | 개발 워크플로우 장애 |

---

## Part D. 수정 우선순위 권고

### 즉시 (Sprint 0 — 서비스 출시 전 필수)

1. **코드베이스 단일화** (B-1): 하나의 구현을 선택하고 정리
2. **타임존 정규화** (기존 #3): KST 명시 또는 UTC + 변환
3. **공휴일 context 전달** (기존 #4): 서버가 자동으로 공휴일 판단 — **목록/상세/alerts 3곳 모두 수정**
4. **distanceToPolyline 선분 기준** (기존 #1): backend 구현 참고
5. **CORS 제한 + API 인증 + Rate Limiting** (B-4, B-5, B-8)
6. **에러 메시지 필터링** (B-6)
7. **입력값 NaN 검증** (B-23): 좌표 파라미터에 isNaN 체크 추가
8. **프로덕션 API URL 설정** (B-25): 플레이스홀더를 환경 변수 기반으로 교체

### 단기 (Sprint 1)

10. **bbox 조회 개선** (기존 #2): start/end 모두 고려 또는 PostGIS
11. **23:59 빈틈 수정** (기존 #5): `<=` 또는 `24:00` 표현
12. **자정 교차 규칙** (B-3)
13. **위치 PII 동의 플로우** (B-7)
14. **alerts bbox 프리필터를 radiusMeters와 연동** (B-9)
15. **health check 개선** (B-16)
16. **SettingsScreen 설정 연동** (B-26): 전역 상태 + API 파라미터 반영
17. **위치 갱신 race condition 방지** (B-27): AbortController 도입
18. **graceful shutdown** (B-28): SIGTERM 핸들러 추가

### 중기 (Sprint 2~3)

19. enum CHECK 제약, updated_at 트리거, 구조화 로깅
20. pagination, 폴링 최적화, 공간 쿼리 개선
21. 타입 안전성 개선 (`as any` 제거)
22. API 통합 테스트 추가
23. **alert_logs 보존 정책** (B-29): 파티셔닝 또는 주기적 삭제
24. **API 버전 관리** (B-30): `/api/v1/` prefix 도입
25. **seed 멱등성** (B-31): `ON CONFLICT` 절 추가
26. **request body 크기 명시** (B-24): `express.json({ limit: '16kb' })` 하드닝

---

## Part E. 피드백 반영 이력

| # | 피드백 내용 | 반영 결과 |
|---|---|---|
| 1 | isHoliday 미전달 범위에 alerts 엔드포인트 누락 | 기존 #4에 `alerts.ts:73-76` 추가, 수정 대상 3곳 명시 |
| 2 | null time 기본값 보정 제안이 위험 | B-2 개선 방향을 "기본값 보정"에서 "검증 실패/로그/스킵"으로 변경 |
| 3 | N+1 query 표현이 사실과 다름 | B-10 제목 및 설명을 "공간 필터링 부재 + 후처리 과잉"으로 수정 |
| 4 | alerts radiusMeters 프리필터 불일치 미반영 | B-9로 신규 항목 추가 (P2) |
| 5 | backend PostGIS 사용 표현이 사실보다 앞서감 | B-1 개선 문구에서 "PostGIS 사용"을 "PostGIS 확장 준비 수준"으로 정정 |
| 6 | health check 예시가 Supabase 에러 패턴과 불일치 | B-16 예시를 try/catch에서 `{ error }` 반환값 확인 방식으로 변경 |
| 7 | health check 예시가 `detail: error.message`로 내부 에러 노출 (B-6과 모순) | B-16 예시에서 `detail` 제거, 상세 에러는 `console.error`로만 기록 |
| 8 | 27건 수정 후에도 빈틈이 있는지 2차 전수 점검 요청 | B-23~B-31 (9건) 신규 추가. P1 2건, P2 4건, P3 3건 |
| 9 | B-24 request body 설명이 사실보다 과함 (Express 기본 100KB 제한 존재) | B-24를 P1→P3으로 하향, "취약점"에서 "하드닝 권고"로 표현 변경 |
| 10 | 전체 36건에 구체적 해결 코드 보강 요청 | Part A 5건 + Part B 주요 항목에 수정 코드/실행 단계 추가 |
