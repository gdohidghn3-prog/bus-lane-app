# Bus Lane App — 보안 및 운영 감사 보고서

- **감사일**: 2026-04-12
- **대상**: bus-lane-app (backend + mobile) 전체 소스코드
- **관점**: 시니어 백엔드 엔지니어 / 보안 감사자 / SRE
- **전제**: "서비스가 터진다"는 가정으로 검토

---

## 아키텍처 개요

| 구성요소 | 기술 스택 |
|----------|-----------|
| Backend | Express.js + TypeScript, Supabase (PostgreSQL; PostGIS 확장 설치됨, 실제 공간 쿼리 미사용), pino 로깅 |
| Mobile | React Native (Expo 52) + TypeScript |
| 인증 | 단일 정적 API Key (X-API-Key 헤더) |
| DB 접근 | Supabase JS Client (Service Key — RLS 우회) |
| 위치 추적 | expo-location (포그라운드/백그라운드) |
| 알림 | expo-notifications (로컬 알림) |

**서비스 목적**: 사용자 위치 기반으로 버스전용차로 진입 규제 상태를 실시간 판단하여 지도에 표시하고, 접근 시 경고 알림을 발송하는 모바일 앱.

---

## 1. 치명적 문제 (서비스 장애 / 보안 사고 즉시 가능)

### CRITICAL-01: regulationType 미검증 — 모든 구간이 "진입 가능"으로 오표시

**파일**: `backend/src/routes/segments.ts:41`

```typescript
const regulationType = req.query.regulationType as RegulationType | undefined;
```

런타임 검증 없이 TypeScript `as` 타입 단언만 사용. `?regulationType=fake` 전송 시:

1. `evaluateSegment()` → 모든 regulation이 `context.regulationType !== reg.regulation_type`으로 스킵됨
2. `results = []` → `resolveOverallStatus([])` → **`'allowed'`** 반환

**공격 시나리오**: 모바일 앱 중간자 공격 또는 URL 파라미터 직접 조작으로 쿼리스트링 변조 시 **모든 금지 구간이 "진입 가능"으로 표시**. 안전 민감 서비스에서 사용자가 과태료를 맞거나 사고를 유발하는 직접적 원인이 됨.

**영향 범위**: GET `/api/v1/segments` 엔드포인트를 사용하는 모든 클라이언트

**수정 방안**:
```typescript
// backend/src/middleware/validate.ts 에 추가
const VALID_REGULATION_TYPES = ['bus_lane', 'school_zone', 'parking', 'highway_bus_lane'] as const;

export function sanitizeRegulationType(raw: unknown): RegulationType | undefined {
  if (typeof raw === 'string' && VALID_REGULATION_TYPES.includes(raw as RegulationType)) {
    return raw as RegulationType;
  }
  return undefined; // 전체 규제 평가 (필터 없음)
}
```

---

### CRITICAL-02: API_KEY 미설정 시 인증 완전 비활성화

**파일**: `backend/src/middleware/auth.ts:14`

```typescript
if (!expectedKey) {
  return next(); // 인증 건너뜀
}
```

`API_KEY` 환경변수가 누락되면 **모든 엔드포인트가 인증 없이 공개**됨. `SUPABASE_SERVICE_KEY`는 production에서 필수 검증이 있으나(`database.ts:16`), `API_KEY`에는 동일한 보호가 없음.

**발생 시나리오**: production 배포 시 `.env` 파일 누락, 환경변수 주입 실패, 컨테이너 재시작 시 env 소실 등

**수정 방안**:
```typescript
// backend/src/middleware/auth.ts
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API_KEY must be set in production');
    }
    logger.warn('API_KEY is not set — skipping auth (dev only)');
    return next();
  }
  // ... 이하 동일
}
```

---

### CRITICAL-03: Supabase Service Key — RLS 우회 키 간접 노출 경로

**파일**: `backend/src/config/database.ts:26-28`

```typescript
export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
);
```

모든 서비스 코드가 `supabaseAdmin`(service key, RLS 우회)을 사용. 공격 체인:

1. 모바일 APK 디컴파일 → `EXPO_PUBLIC_API_KEY` 추출
2. API 키로 백엔드 호출 가능
3. 백엔드가 service key로 Supabase에 쿼리 실행
4. 입력값 조작으로 의도하지 않은 데이터 접근 가능

Service Key 자체가 직접 노출되지는 않으나, 백엔드를 프록시로 사용하여 RLS 없이 데이터 접근 가능.

**수정 방안**:
- 읽기 전용 조회에는 `supabase` (anon key, RLS 적용)를 사용
- `supabaseAdmin`은 관리자 전용 작업에만 제한
- 장기적으로 모바일 → 백엔드 인증을 JWT 기반으로 전환

---

### CRITICAL-04: 백그라운드 알림 스팸 — 15초마다 동일 알림 반복

**파일**: `mobile/src/services/backgroundLocation.ts:95-98`

```typescript
timeInterval: 15_000,   // 15초마다
distanceInterval: 50,   // 또는 50m 이동 시
```

위치 업데이트마다 `checkAlerts` 호출 → 근처에 금지 구간 있으면 **매번 알림 발송**. 쿨다운, 중복 제거, 이전 알림 비교 로직 없음.

**시나리오**: 사용자가 버스전용차로 옆 도로에서 신호 대기 중이면 15초마다 동일한 경고 알림이 계속 도착 → 사용자 이탈 + 앱 삭제의 직접 원인.

**수정 방안**:
```typescript
// 쿨다운 맵: segmentId → 마지막 알림 시각
const alertCooldown = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5분

// 알림 발송 전 체크
if (alertCooldown.has(topAlert.segmentId)) {
  const lastNotified = alertCooldown.get(topAlert.segmentId)!;
  if (Date.now() - lastNotified < COOLDOWN_MS) return;
}
alertCooldown.set(topAlert.segmentId, Date.now());
```

---

## 2. 주요 리스크 (운영 시 문제 발생 가능)

### HIGH-01: API 키 비교 — 타이밍 공격 취약

**파일**: `backend/src/middleware/auth.ts:20`

```typescript
if (!providedKey || providedKey !== expectedKey) {
```

`!==` 연산자는 첫 번째 불일치 문자에서 즉시 반환. 다수 요청의 응답 시간 차이를 통계적으로 분석하면 API 키를 한 글자씩 추론 가능.

**수정 방안**:
```typescript
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

if (!providedKey || !safeCompare(providedKey, expectedKey)) {
  // ...
}
```

---

### HIGH-02: CORS 기본 전체 허용

**파일**: `backend/src/app.ts:16-22`

```typescript
cors(
  corsOrigin
    ? { origin: corsOrigin.split(',').map((o) => o.trim()) }
    : undefined,  // ← 전체 허용
),
```

`CORS_ORIGIN` 미설정 시 `cors()`에 `undefined` 전달 → 기본 동작은 **모든 출처 허용**. 악성 웹사이트에서 사용자 브라우저를 통해 API를 직접 호출 가능.

**수정 방안**:
```typescript
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ORIGIN must be set in production');
}
```

---

### HIGH-03: 보안 헤더 전무

`helmet` 미사용. 누락된 보안 헤더:

| 헤더 | 목적 |
|------|------|
| `X-Content-Type-Options: nosniff` | MIME 타입 스니핑 방지 |
| `Strict-Transport-Security` | HTTPS 강제 (HSTS) |
| `X-Frame-Options: DENY` | 클릭재킹 방지 |
| `Content-Security-Policy` | XSS/인젝션 방지 |
| `X-XSS-Protection` | 브라우저 XSS 필터 |

**수정 방안**:
```bash
npm install helmet
```
```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

### HIGH-04: 세그먼트 조회 결과 무제한 반환

**파일**: `backend/src/services/segment-service.ts:50-58`

```typescript
const { data, error } = await supabaseAdmin
  .from('road_segments')
  .select('*')       // 전체 컬럼 (geometry JSONB 포함)
  .eq('is_active', true)
  .gte('center_lat', bbox.minLat)
  .lte('center_lat', bbox.maxLat)
  .gte('center_lng', bbox.minLng)
  .lte('center_lng', bbox.maxLng);
  // ← 페이지네이션 없음, LIMIT 없음
```

문제점:
- `radius=10` (최대 허용) 요청 시 수십 km 반경의 **모든** 세그먼트 반환
- `select('*')` → geometry JSONB (좌표 수백 개) + metadata JSONB 전부 포함
- 서울 전체 데이터가 들어오면 **수 MB 단위의 JSON 응답** → 서버 메모리 및 대역폭 폭주
- 의도적 대량 요청 = 사실상 DoS 공격

**수정 방안**:
```typescript
.select('id, name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district, is_active')
.limit(200)
```

---

### HIGH-05: Rate Limit이 실서비스 트래픽에 부적합

**파일**: `backend/src/app.ts:31-37`

| 설정 | 값 | 문제 |
|------|----|------|
| 전역 | 60 req/min | 사용자 1명 = 4 req/min (폴링). **15명이면 한계** |
| 알림 | 30 req/min | 백그라운드 태스크 15초 주기 = 4 req/min/사용자 |
| 키 기준 | IP 기반 (기본값) | CDN/로드밸런서 뒤에서 전부 동일 IP → 전체 차단 |

**수정 방안**:
```typescript
app.set('trust proxy', 1); // 프록시 뒤 실제 IP 인식

app.use(rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (req) => req.header('X-API-Key') || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
}));
```

---

### HIGH-06: Supabase 쿼리 타임아웃 없음

**파일**: `backend/src/services/segment-service.ts` 전체, `backend/src/config/database.ts`

Supabase 클라이언트에 타임아웃 설정 없음. DB 느려지면 Express 요청이 무한 대기. Express 자체도 `server.timeout` 미설정.

**장애 시나리오**:
1. Supabase 응답 지연 (네트워크 이슈, 슬로우 쿼리)
2. 모든 Express 워커가 대기 상태에 빠짐
3. Health check도 DB 호출 → 503 반환
4. 로드밸런서가 인스턴스를 unhealthy로 마킹
5. **앱 자체에 문제 없어도 전체 서비스 다운**

**수정 방안**:
```typescript
// database.ts — fetch에 타임아웃 주입
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) }),
  },
});
```

---

### HIGH-07: Segment ID (UUID) 형식 검증 없음

**파일**: `backend/src/routes/segments.ts:81`

```typescript
const id = req.params.id as string;
```

UUID 형식 검증 없이 Supabase에 직접 전달. 비정상 문자열 전송 시 Supabase 에러 → catch 블록에서 500 반환 → 로그에 불필요한 에러 노이즈 + Supabase 내부 정보 포함 가능.

**수정 방안**:
```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// 라우트에서
if (!isValidUUID(id)) {
  return res.status(400).json({ error: 'Invalid segment ID format' });
}
```

---

## 3. 잠재적 문제 (확장 시 위험)

### MED-01: 3단계 순차 DB 호출 — 네트워크 라운드트립 비효율

**파일**: `backend/src/services/segment-service.ts:109-127`

```
쿼리 1: segments     = await getSegmentsInBBox(...)
쿼리 2: regulations  = await getRegulationsForSegments(segmentIds)
쿼리 3: rules        = await getRulesForRegulations(regulationIds)
```

3개 쿼리가 순차 실행 (2, 3은 이전 결과에 의존). 세그먼트 수 증가 시:
- `IN (...)` 절의 파라미터 수 제한 (PostgreSQL ~65535)
- 네트워크 라운드트립 3회 × 레이턴시
- JOIN 단일 쿼리로 개선 가능

**수정 방안**: Supabase RPC 함수 (서버 사이드 JOIN):
```sql
CREATE OR REPLACE FUNCTION get_segments_with_rules(
  min_lat FLOAT, max_lat FLOAT, min_lng FLOAT, max_lng FLOAT
) RETURNS JSONB AS $$
  SELECT jsonb_agg(...)
  FROM road_segments s
  JOIN regulations r ON r.segment_id = s.id
  JOIN regulation_rules rr ON rr.regulation_id = r.id
  WHERE s.center_lat BETWEEN min_lat AND max_lat
    AND s.center_lng BETWEEN min_lng AND max_lng
    AND s.is_active = true AND r.is_active = true;
$$ LANGUAGE sql STABLE;
```

---

### MED-02: PostGIS 확장 설치됨 — 실제 공간 쿼리 미사용

**마이그레이션**: `CREATE EXTENSION IF NOT EXISTS postgis;`
**실제 쿼리**: `center_lat`/`center_lng` 범위 비교 (B-tree 인덱스)

geometry를 JSONB로 저장하여 PostGIS 공간 인덱스(GiST) 적용 불가. 데이터 수만 건 이상 시 BBox 검색 성능 급감.

**수정 방안**:
```sql
ALTER TABLE road_segments ADD COLUMN geom geometry(LineString, 4326);
UPDATE road_segments SET geom = ST_GeomFromGeoJSON(geometry::text);
CREATE INDEX idx_segments_geom ON road_segments USING GIST (geom);
-- 조회 시
SELECT * FROM road_segments WHERE ST_DWithin(geom, ST_MakePoint(lng, lat)::geography, radius_meters);
```

---

### MED-03: 공휴일 캐시 — Thundering Herd + 시간대 불일치

**파일**: `backend/src/services/segment-service.ts:26-38`

```typescript
let holidayCache: Set<string> | null = null;
let holidayCacheDate = '';

async function getHolidays(): Promise<Set<string>> {
  const today = new Date().toISOString().slice(0, 10); // ← UTC 기준!
  if (holidayCache && holidayCacheDate === today) return holidayCache;
  // DB 호출...
```

문제:
1. **Thundering herd**: 자정 직후 또는 서버 시작 시, 동시 요청 수십 개가 모두 캐시 미스 → 동일 DB 쿼리 중복 실행
2. **시간대 불일치**: `toISOString()`은 UTC 기준. KST와 9시간 차이로, UTC 15:00~23:59 사이에 불필요한 캐시 갱신 발생

**수정 방안**:
```typescript
import { getKSTDateString } from '../engine/kst-utils';

let holidayPromise: Promise<Set<string>> | null = null;
let holidayCacheDate = '';

export async function getHolidays(): Promise<Set<string>> {
  const today = getKSTDateString(new Date()); // KST 기준
  if (holidayCache && holidayCacheDate === today) return holidayCache;

  // 진행 중인 Promise 공유 (thundering herd 방지)
  if (!holidayPromise) {
    holidayPromise = fetchHolidaysFromDB(today).finally(() => { holidayPromise = null; });
  }
  return holidayPromise;
}
```

---

### MED-04: alert_logs 테이블 — 생성만 하고 데이터 기록 없음

**마이그레이션**: `003_alert_logs.sql`에서 `alert_logs` 테이블 생성
**코드**: 이 테이블에 INSERT하는 로직이 **전체 코드베이스에 존재하지 않음**

영향:
- 사용자 단속 이의 제기 시 경고 이력 증빙 불가
- 경고 빈도/패턴 분석 불가
- 시스템 오작동 (거짓 양성/거짓 음성) 추적 불가

**수정 방안**: `checkProximityAlerts()`에서 결과를 비동기 INSERT:
```typescript
// fire-and-forget (응답 지연 없이)
if (alerts.length > 0) {
  supabaseAdmin.from('alert_logs').insert(
    alerts.map(a => ({
      segment_id: a.segmentId,
      alert_type: a.status === 'prohibited' ? 'proximity_danger' : 'proximity_warning',
      user_lat_grid: Math.round(location.lat * 100) / 100, // 그리드 익명화
      user_lng_grid: Math.round(location.lng * 100) / 100,
      status: a.status,
      message: a.reason,
    }))
  ).then().catch(err => logger.warn({ err }, 'Failed to log alert'));
}
```

---

### MED-05: 모바일 API 키 하드코딩 — 앱 디컴파일 시 노출

**파일**: `mobile/src/services/api.ts:10`

```typescript
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';
```

`EXPO_PUBLIC_*` 환경변수는 빌드 타임에 JavaScript 번들에 인라인됨. APK/IPA를 디컴파일하면 평문으로 API 키 확인 가능. 키 로테이션 시 **모든 사용자가 앱 업데이트 필요**.

**수정 방안** (단계적):
1. 단기: API 키 로테이션 기능 구축 (신/구 키 동시 유효 기간)
2. 중기: 기기 인증서 기반 인증 (device attestation)
3. 장기: OAuth2 / JWT 기반 사용자 인증

---

### MED-06: 트랜잭션 없는 다중 테이블 읽기

**파일**: `backend/src/services/segment-service.ts:109-127`

세그먼트 → 규제 → 규칙 조회가 트랜잭션 없이 순차 실행. 관리자가 규제 데이터를 업데이트하는 **정확한 순간**에 요청이 들어오면:
- 세그먼트는 구버전 규제 참조
- 규칙은 신버전 규제 참조
- 결과: **잘못된 진입 가능/금지 판단**

**수정 방안**: 단일 RPC 호출 또는 `REPEATABLE READ` 격리 수준 적용

---

### MED-07: 백그라운드 태스크 에러 무음 처리

**파일**: `mobile/src/services/backgroundLocation.ts:71-73`

```typescript
} catch {
  // 네트워크 오류 등 무시 (백그라운드이므로)
}
```

무음 처리되는 에러:
- JSON 파싱 실패 (서버 응답 변경 시)
- AsyncStorage 읽기 실패
- 알림 권한 취소
- API URL 설정 오류

사용자는 **백그라운드 경고가 작동하지 않는다는 사실 자체를 모름**.

**수정 방안**:
```typescript
} catch (err) {
  // 실패 카운트를 AsyncStorage에 기록
  try {
    const key = '@bus_lane_bg_error_count';
    const raw = await AsyncStorage.getItem(key);
    const count = (parseInt(raw || '0', 10) || 0) + 1;
    await AsyncStorage.setItem(key, String(count));

    // 연속 10회 이상 실패 시 사용자 알림
    if (count >= 10 && count % 10 === 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '백그라운드 경고 오류',
          body: '접근 경고가 정상 작동하지 않고 있습니다. 네트워크를 확인해주세요.',
        },
        trigger: null,
      });
    }
  } catch { /* 최후의 fallback — 무시 */ }
}
```

---

### MED-08: Health Check가 DB에 완전 의존

**파일**: `backend/src/app.ts:41-48`

```typescript
app.get('/api/health', async (_req, res) => {
  const { error } = await supabaseAdmin.from('road_segments').select('id').limit(1);
  if (error) {
    return res.status(503).json({ status: 'unhealthy' });
  }
  return res.json({ status: 'ok', uptime: process.uptime() });
});
```

DB 장애 시 health check도 실패 → 로드밸런서가 모든 인스턴스를 제거 → **애플리케이션 정상인데도 서비스 전체 중단**.

또한 `process.uptime()` 노출은 서버 재시작 패턴을 공격자에게 제공.

**수정 방안**: Liveness/Readiness 분리:
```typescript
// Liveness — 프로세스 생존 확인 (DB 무관)
app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness — 요청 처리 준비 완료 확인 (DB 포함)
app.get('/api/health/ready', async (_req, res) => {
  const { error } = await supabaseAdmin.from('road_segments').select('id').limit(1);
  if (error) {
    return res.status(503).json({ status: 'not ready' });
  }
  return res.json({ status: 'ready' });
});
```

---

## 4. 수정 우선순위 로드맵

### Phase 1: 즉시 수정 (1일 내)

| # | 문제 | 작업 | 예상 공수 |
|---|------|------|-----------|
| C-01 | regulationType 미검증 | `sanitizeRegulationType()` 추가 및 라우트 적용 | 30분 |
| C-02 | API_KEY production 필수화 | auth.ts에 production 환경 검증 추가 | 15분 |
| C-04 | 알림 스팸 | 쿨다운 맵 구현 (segmentId 기준 5분) | 1시간 |
| H-01 | 타이밍 공격 | `crypto.timingSafeEqual` 적용 | 15분 |
| H-07 | UUID 미검증 | UUID 정규식 검증 함수 추가 | 30분 |

### Phase 2: 1주일 내 수정

| # | 문제 | 작업 | 예상 공수 |
|---|------|------|-----------|
| H-02 | CORS 전체 허용 | production CORS_ORIGIN 필수 설정 강제 | 30분 |
| H-03 | 보안 헤더 없음 | `helmet` 패키지 추가 | 30분 |
| H-04 | 무제한 쿼리 결과 | `.limit(200)` + 필요 컬럼만 select | 1시간 |
| H-05 | Rate limit 부적합 | API 키 기반 + trust proxy 설정 | 2시간 |
| H-06 | 쿼리 타임아웃 | Supabase fetch에 AbortSignal.timeout 적용 | 1시간 |
| M-03 | 캐시 thundering herd | Promise 기반 캐시 + KST 기준 날짜 | 1시간 |
| M-07 | 백그라운드 에러 무음 | 실패 카운터 + 사용자 알림 | 2시간 |
| M-08 | Health check 분리 | liveness/readiness 엔드포인트 분리 | 1시간 |

### Phase 3: 아키텍처 개선 (2-4주)

| # | 문제 | 작업 | 예상 공수 |
|---|------|------|-----------|
| C-03 | Service Key 노출 경로 | 읽기에 anon key 사용 + JWT 인증 설계 | 1주 |
| M-01 | N+1 쿼리 | Supabase RPC 함수 (단일 JOIN 호출) | 3일 |
| M-02 | PostGIS 미사용 | geometry 컬럼 마이그레이션 + GiST 인덱스 | 3일 |
| M-04 | alert_logs 미사용 | 비동기 INSERT 로직 추가 | 1일 |
| M-05 | API 키 하드코딩 | 키 로테이션 기능 + 다중 키 지원 | 3일 |
| M-06 | 트랜잭션 없음 | RPC 함수 또는 REPEATABLE READ 적용 | 2일 |

---

## 5. 추가 방어 전략

### 서킷 브레이커

Supabase 장애 시 연쇄 장애 방지:

```
정상 상태 → 연속 5회 실패 → OPEN (30초간 DB 호출 차단, 캐시 응답)
         → 30초 후 → HALF-OPEN (1회 시도)
         → 성공 → CLOSED (정상 복귀)
         → 실패 → OPEN (다시 30초 대기)
```

### 관측성(Observability) 강화

| 항목 | 현재 | 필요 |
|------|------|------|
| 요청 추적 | 없음 | `X-Request-Id` 헤더 → 로그 correlation ID |
| 메트릭 | 없음 | `/metrics` 엔드포인트 (Prometheus) — 응답 시간, 에러율, 캐시 히트율 |
| 알림 모니터링 | 없음 | 백그라운드 태스크 실패율 → 설정 화면에 상태 표시 |
| 에러 추적 | console만 | Sentry 등 에러 트래킹 서비스 연동 |

### 데이터 안전망

- **마이그레이션 롤백**: 각 `up` 마이그레이션에 대응하는 `down` 스크립트
- **규제 변경 감사**: `regulations`/`regulation_rules` 테이블에 trigger로 변경 이력 기록
- **오프라인 캐시 TTL**: 현재 만료 없음 → 3시간 이상 오래된 캐시에 "데이터가 오래되었습니다" 경고

### 모바일 방어

- **Certificate Pinning**: 중간자 공격으로 API 키/위치 데이터 탈취 방지
- **최소 API 버전 체크**: 구버전 앱이 변경된 규칙으로 잘못된 판단을 내리는 것 방지
- **앱 포그라운드 복귀 시 즉시 갱신**: 현재 30초 폴링에만 의존

### 운영 킬스위치

- 백그라운드 알림 전체 비활성화 플래그 (서버 설정)
- 특정 세그먼트/규제 긴급 비활성화 어드민 API
- Rate limit 임계값 런타임 변경

---

## 부록: 점검 체크리스트 요약

| # | 점검 항목 | 상태 | 심각도 |
|---|-----------|------|--------|
| 1 | 입력값 검증 (XSS, SQLi, CMDi) | regulationType 미검증 | CRITICAL |
| 2 | 인증/인가 처리 | API_KEY 미설정 시 인증 스킵 | CRITICAL |
| 3 | 민감정보 노출 | 모바일 번들에 API 키 포함 | MEDIUM |
| 4 | HTTPS/보안 헤더 | helmet 미사용, CORS 기본 허용 | HIGH |
| 5 | 외부 API 보안 | Service Key RLS 우회 | CRITICAL |
| 6 | API 실패 대응 | 타임아웃 없음, 서킷 브레이커 없음 | HIGH |
| 7 | 중복 요청/멱등성 | 알림 중복 발송 | CRITICAL |
| 8 | 트래픽 병목 | Rate limit 15명 한계, 무제한 결과 | HIGH |
| 9 | DB 부하/쿼리 비효율 | N+1 쿼리, PostGIS 미활용 | MEDIUM |
| 10 | 메모리/리소스 관리 | 정상 (cleanup 적절) | OK |
| 11 | 트랜잭션 처리 | 다중 테이블 읽기에 트랜잭션 없음 | MEDIUM |
| 12 | 동시성 문제 | 캐시 thundering herd | MEDIUM |
| 13 | 데이터 손실 | alert_logs 미기록 | MEDIUM |
| 14 | 롤백/복구 | 마이그레이션 down 스크립트 없음 | MEDIUM |
| 15 | 로그 충분성 | 구조화 로깅 양호, correlation ID 없음 | LOW |
| 16 | 모니터링/알림 | Health check 있으나 메트릭 없음 | HIGH |
| 17 | 장애 대응 전략 | 서킷 브레이커/킬스위치 없음 | HIGH |
