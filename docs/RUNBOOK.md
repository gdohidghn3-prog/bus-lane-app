# 운영 런북 (RUNBOOK)

장애·이상 상황 발생 시 1차 대응 절차. 본 런북은 1인 운영 가정.

---

## 0. 핵심 채널·접근

| 항목 | 위치 |
|---|---|
| 백엔드 로그 | Render Dashboard → 서비스 → Logs (실시간) |
| DB 로그·메트릭 | Supabase Dashboard → Logs / Database / Reports |
| 헬스 체크 | `https://bus-lane-api.onrender.com/api/health/live` (DB 무관), `/api/health/ready` (DB 포함) |
| 운영 메트릭 | `https://bus-lane-api.onrender.com/metrics` (Prometheus 형식, 무인증) |
| 모바일 크래시 (옵션) | Sentry / EAS Insights |
| 키 회전 절차 | `docs/KEY_ROTATION.md` |
| 알림 SOP | 이 문서 §6 (Supabase 사용량 알림) |

---

## 1. 증상별 1차 대응 매트릭스

| 증상 | 가장 먼저 확인 | 1차 조치 |
|---|---|---|
| 모바일 앱이 데이터 못 받음 (오프라인 표시) | `/api/health/live` 200? | 200 아니면 §2 / 200이면 §3 |
| `/api/health/live` 5xx 또는 응답 없음 | Render Logs 마지막 에러 | §2 (서버 다운) |
| `/api/health/ready` 503 | Supabase 상태 페이지·DB 로그 | §3 (DB 장애) |
| 응답 지연 (p99 > 3초) | Render Logs 패턴, Supabase Slow query | §4 (성능 저하) |
| 인증 401 폭주 | 로그의 `Unauthorized API access attempt` 라인 | §5 (키 유출/오설정) |
| 사용량 임박 (Supabase free 한도) | Supabase Dashboard → Reports | §6 (사용량) |
| 모바일 앱 크래시 폭주 | EAS / Sentry | §7 (모바일 회귀) |
| 알림(푸시)이 발송 안 됨 | 모바일 logcat·Notifications 권한 상태 | §8 (알림) |

---

## 2. 백엔드 다운 (Render)

**체크리스트**
1. Render Dashboard → 해당 서비스 상태 확인 (Healthy / Crashed / Build failed)
2. Logs 탭 → 마지막 30분 로그에서 stack trace 또는 `Error:` 검색
3. Deploy 탭 → 직전 deploy가 자동 trigger 되어 실패한 건지 확인
4. 헬스 엔드포인트 200 회복 확인까지 대기

**조치**
- **Crashed (env 누락)**: env.ts가 `must be set in production`으로 즉시 종료. 환경변수(SUPABASE_URL/ANON_KEY/SERVICE_KEY/CORS_ORIGIN/API_KEY) 설정 후 재배포.
- **OOM / 메모리 한계**: `/metrics`의 `process_resident_memory_bytes` 추세 확인. 메모리 누수 의심되면 직전 커밋 롤백 (Deploy 탭 → 이전 커밋 → Rollback).
- **빌드 실패**: GitHub의 마지막 커밋 빌드 로그 확인, `npm run build` 로컬 재현 후 fix-forward.
- **알 수 없는 크래시**: Manual Deploy로 직전 정상 커밋으로 즉시 롤백, 사후 분석.

**롤백 절차**
1. Render Dashboard → 해당 서비스 → Deploys
2. 정상 작동했던 가장 최근 deploy → "Rollback" 클릭
3. 5~10분 내 헬스 회복 확인

---

## 3. DB 장애 (Supabase)

**체크리스트**
1. https://status.supabase.com 글로벌 장애 여부
2. Supabase Dashboard → Logs (Postgres / API)
3. `/api/health/ready` 가 503이면 backend → DB 연결 자체가 막힘
4. RLS 정책 변경이 직전에 있었는지 (마이그레이션 변경 시)

**조치**
- **Supabase 글로벌 장애**: 대기 + 사용자에게 공지 (모바일 오프라인 캐시로 폴백 동작 확인).
- **RLS 정책 깨짐**: 직전 마이그레이션 역순 실행. 안전을 위해 항상 사전 백업.
- **연결 한도 초과 (Pooler)**: backend 인스턴스 수 / connection pool 설정 확인.
- **데이터 무결성 깨짐**: 가급적 read-only로 전환 후 수동 점검. drop은 절대 즉답하지 않음.

**롤백 절차** (마이그레이션 회귀 시)
1. Supabase SQL Editor에서 깨진 마이그레이션의 역연산 실행 (down 스크립트가 없으면 수동 작성)
2. backend 코드도 마이그레이션 직전 커밋으로 Render Rollback
3. `/api/health/ready` 200 확인

---

## 4. 응답 지연 (성능 저하)

**체크리스트**
1. `/metrics`의 `http_requests_total` route별 분포
2. Supabase Dashboard → Reports → API → Slow query
3. Render Logs에서 응답 시간 > 1s 패턴 검색
4. RPC 함수(get_segments_in_bbox / log_alert) 실행 계획 (`EXPLAIN ANALYZE`) 확인

**조치**
- **DB 인덱스 누락**: `road_segments`의 `geom` GIST, `regulation_rules` 시간 범위 인덱스 등 점검.
- **트래픽 급증**: rate limit (현 120 req/min/IP+key) 정상 동작 확인. 필요 시 임시 한도 하향.
- **커넥션 폴링 한계**: Supabase Pooler 설정 점검.

---

## 5. 인증 401 폭주 (키 유출 의심)

**체크리스트**
1. 로그의 `Unauthorized API access attempt` 라인 IP 분포
2. 단일 IP 폭주인지, 다수 IP 분산인지 (분산 = 키 유출)
3. 정상 사용자 영향 여부

**조치**
- **단일 IP 봇**: rate limit으로 격리됨, 모니터만.
- **키 유출 의심**: `docs/KEY_ROTATION.md` 절차로 즉시 회전 (Render env 갱신 → 모바일 새 빌드 배포). 회전 후 구 키로 들어오는 401 패턴이 다시 떨어지는지 확인.

---

## 6. Supabase 사용량 알림 SOP (G-08)

**Free 한도**: DB 500MB / 파일 스토리지 1GB / 월 egress 5GB.

### 6-1. 대시보드에서 알림 설정
1. Supabase Dashboard → 프로젝트 선택 → **Reports** 메뉴
2. 좌측 **Database** / **API** 각 탭에서 사용량 그래프 확인
3. **Project Settings → Notifications**로 이동
4. **Email Notifications** 섹션에서 다음 알림을 활성화:
   - Project usage exceeds 80% (warning)
   - Project usage exceeds 100% (critical)
   - Database size warnings
   - API egress warnings
5. 알림 수신 이메일을 운영자(`mhjin@nkia.co.kr`)로 지정

### 6-2. 자체 점검 주기
- **주간**: Reports → Database → 총 크기와 alert_logs 행 수 확인
- **월간**: API egress 누적 확인 (월 5GB 한도 대비 추세)
- alert_logs는 마이그레이션 005의 pg_cron으로 90일 자동 삭제. 동작 검증:
  ```sql
  SELECT count(*) FROM alert_logs WHERE created_at < now() - interval '91 days';
  -- 0이 정상
  ```

### 6-3. 임계 도달 시 대응
- **DB 80%**: alert_logs 보관기간을 90일 → 60일로 단축, 로그 sampling 강화
- **DB 100%**: 즉시 alert_logs 일부 수동 truncate, 유료 플랜 전환 검토
- **Egress 80%**: 모바일 폴링 주기 30초 → 60초로 임시 상향 (앱 OTA 또는 다음 빌드)
- **Egress 100%**: rate limit 강화, 사용자 공지 후 긴급 빌드

---

## 7. 모바일 회귀 (크래시 폭주)

**체크리스트**
1. Play Console → Android Vitals → ANR · Crashes
2. EAS Build / Sentry (있으면) — 어느 버전부터 발생?
3. 직전 빌드와 비교

**조치**
- 즉시 Play Console → 출시 → 단계적 롤아웃 일시 중지 (`Halt rollout`)
- 직전 정상 버전을 production 트랙으로 재출시 (Resume previous release)
- fix-forward 빌드 준비, internal testing 거쳐 재배포

---

## 8. 알림(푸시)이 발송 안 됨

**체크리스트**
1. 모바일 설정 → 앱 → 알림 권한이 켜져 있는지 (Android 13+ POST_NOTIFICATIONS)
2. 백그라운드 위치 권한 "항상 허용" 상태인지
3. 배터리 최적화 예외 등록 여부
4. backend `/api/v1/alerts/check` 응답 정상인지 (Render Logs 검사)

**조치**
- 권한 누락 → 사용자 안내 (현재 PermissionScreen이 처리)
- backend는 정상이지만 알림 미발송 → Notification 채널 등록 누락 의심, 모바일 빌드 재확인
- AsyncStorage에 `@bus_lane_bg_error_count` 누적 시 backgroundLocation에서 자체 알림 발송 (10회마다)

---

## 9. 백그라운드 위치 심사용 동영상 (G-11)

Google Play는 백그라운드 위치 권한 사용 앱에 대해 30~60초 사용 사례 영상을 요구한다.

### 9-1. 촬영 시나리오 (필수 포함 항목)
1. 앱 첫 실행 → 온보딩 화면에서 면책·권한 안내 노출 → 사용자가 "동의하고 시작" 누름
2. 위치 권한 → 알림 권한 → 백그라운드 위치 권한 순으로 OS 다이얼로그가 뜸 (한글 자막으로 "운전 중 단속 구간 접근 알림을 위해 사용됩니다" 표시)
3. 메인 지도에 본인 위치와 색상별 구간 노출
4. 앱을 백그라운드로 보내고 (홈 키), 단속 시간대 버스전용차로 500m 이내로 접근 (또는 시뮬레이션)
5. **백그라운드 상태에서 푸시 알림 도착** 장면 (이게 핵심)
6. 알림 탭 → 앱이 다시 열리고 해당 구간 강조됨

### 9-2. 촬영 환경
- 실기기 (Pixel 등 권장), 화면녹화 + 시스템 음
- Android 13 또는 14
- 가능하면 실제 도로에서 촬영 (시뮬레이션은 거부 위험 있음)
- 30~60초 분량, 자막 한국어 OK
- 영상 파일은 mp4, 1080p 권장

### 9-3. 제출 위치
- Play Console → 앱 콘텐츠 → 백그라운드 위치 → 사용 사례 비디오 URL
- YouTube 비공개(unlisted) 업로드 후 URL 등록 (가장 무난)

### 9-4. 거부 사유로 흔한 것
- 백그라운드에서 알림이 도착하는 장면이 없음 → **반드시 포함**
- 권한 다이얼로그가 영상에 안 보임 → 첫 실행 시점 포함
- 음성·자막 모두 없어 사용 사례가 불분명 → 자막 권장

---

## 10. 사후 보고 템플릿

장애 종료 후 24시간 내 다음을 기록(`docs/INCIDENTS/YYYY-MM-DD.md`):

```
# YYYY-MM-DD 장애 보고

- 발생: HH:MM KST
- 인지: HH:MM KST
- 복구: HH:MM KST
- 영향: 사용자 N명 / API 응답 N% 5xx
- 원인: <한 줄>
- 대응: <시간 순서>
- 재발 방지: <변경할 코드/설정/문서>
- 미해결 follow-up: <티켓·TODO>
```
