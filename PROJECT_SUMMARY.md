# 버스전용차로 네비게이션 — 프로젝트 요약

---

## 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 버스전용차로 네비게이션 MVP |
| 한 줄 설명 | 운전자의 현재 위치/시간/요일/차량 종류를 기반으로 버스전용차로 진입 가능 여부를 실시간 판단하고 접근 경고를 보내는 지도 앱 |
| 포지셔닝 | 전체 내비게이션이 아닌 "규칙 기반 운전 보조 앱" — "지금 들어가도 되는가?"에 즉답 |
| 대상 사용자 | 서울 출퇴근 운전자, 초보 운전자, 외지 운전자, 택시/대리기사 |

---

## 기술 스택

| 계층 | 기술 |
|---|---|
| 백엔드 | Express.js + TypeScript, pino 로깅, helmet 보안 헤더 |
| 데이터베이스 | Supabase (PostgreSQL, PostGIS 확장 설치됨) |
| 모바일 | React Native (Expo 52) + TypeScript |
| 지도 | react-native-maps (Google Maps) |
| 위치 추적 | expo-location (포그라운드 + 백그라운드) |
| 알림 | expo-notifications (로컬 푸시) |
| 인증 | 정적 API Key (X-API-Key 헤더) |
| CI/CD | GitHub Actions (테스트 → 빌드 → 배포) |

---

## 프로젝트 구조

```
bus-lane-app/
├── backend/                          # Express API 서버
│   ├── migrations/                   # DB 스키마 (3개)
│   ├── seeds/                        # 서울 30개 구간 시드 데이터
│   └── src/
│       ├── config/                   # DB 연결, 로거
│       ├── engine/                   # 규칙 엔진 (KST 시간, 자정교차, 24:00 처리)
│       ├── middleware/               # 인증, 입력 검증
│       ├── routes/                   # API 라우트 (/api/v1)
│       └── services/                 # 세그먼트 조회, 규칙 평가, 접근 경고
├── mobile/                           # Expo 모바일 앱
│   └── src/
│       ├── components/               # 지도 오버레이, 상태 배너, 상세 모달
│       ├── context/                  # 설정 전역 상태 (AsyncStorage)
│       ├── hooks/                    # 위치 추적, 세그먼트 폴링
│       ├── navigation/               # 탭 네비게이터 (지도/설정)
│       ├── screens/                  # 지도 화면, 설정 화면
│       ├── services/                 # API 통신, 백그라운드 위치
│       └── types/                    # TypeScript 타입
├── docs/                             # PRD, 데이터 갱신 절차
└── .github/workflows/ci.yml         # CI/CD 파이프라인
```

| 수치 | 값 |
|---|---|
| 소스 파일 | 49개 |
| 코드 라인 | ~3,300줄 (TS/TSX/SQL) |
| 테스트 | 25개 (전부 통과) |
| 시드 데이터 | 30개 구간, 30개 규제, 100개+ 규칙, 20개 공휴일 |

---

## 핵심 기능

| # | 기능 | 상태 |
|---|---|---|
| F1 | 지도에 버스전용차로 구간 polyline 표시 | 구현 완료 |
| F2 | 현재 위치 실시간 표시 (포그라운드/백그라운드) | 구현 완료 |
| F3 | 현재 시간/요일/공휴일 기준 진입 가능 여부 자동 판단 | 구현 완료 |
| F4 | 상태별 색상 표시 (초록:허용, 빨강:금지, 주황:주의) | 구현 완료 |
| F5 | 금지 구간 접근 시 경고 (인앱 배너 + 백그라운드 푸시) | 구현 완료 |
| F6 | 구간 탭 시 운영 규칙/현재 상태/벌금 정보 상세 표시 | 구현 완료 |
| F7 | 차량 종류 설정 (일반/택시/9인승/버스/긴급) | 구현 완료 |
| F8 | 오프라인 캐시 (네트워크 단절 시 마지막 데이터 표시) | 구현 완료 |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | /api/health/live | 프로세스 생존 확인 | 불필요 |
| GET | /api/health/ready | DB 연결 확인 | 불필요 |
| GET | /api/v1/segments | BBox 내 구간 + 현재 상태 | API Key |
| GET | /api/v1/segments/:id | 단일 구간 현재 상태 | API Key |
| GET | /api/v1/segments/:id/detail | 구간 상세 + 전체 규칙 | API Key |
| POST | /api/v1/alerts/check | 현재 위치 기반 접근 경고 | API Key |

---

## 보안 현황

| 항목 | 상태 |
|---|---|
| API 인증 | API Key + production 필수 강제 |
| 타이밍 공격 방어 | crypto.timingSafeEqual |
| CORS | production에서 허용 origin 필수 |
| 보안 헤더 | helmet (HSTS, X-Content-Type-Options 등) |
| Rate Limiting | 120 req/min (API key 기반), alerts 60 req/min |
| 입력 검증 | 좌표/radius/vehicleType/regulationType/UUID 전부 검증 |
| Body 크기 | 16KB 제한 |
| DB 타임아웃 | Supabase fetch 8초 타임아웃 |
| 에러 노출 | 내부 에러 로그만, 클라이언트에 generic 메시지 |
| 위치 PII | 그리드 익명화 (소수점 2자리 ≈ 1km) |
| 알림 중복 | segmentId별 5분 쿨다운 |

---

## 완료된 리뷰/감사 이력

| 문서 | 내용 | 건수 |
|---|---|---|
| REVIEW_FIX_REQUESTS.md | 초기 코드 리뷰 지적 | 5건 — 전부 수정 |
| FINAL_REVIEW.md | 종합 코드 리뷰 (10차 피드백 반영) | 36건 — 전부 수정 |
| PRODUCT_GAPS.md | 제품 완성도 갭 분석 | 9건 — 전부 구현 |
| SECURITY_AUDIT.md | 보안/운영 감사 (2건 문서 정정) | 12건 코드 수정 완료 |

---

## 현재 완성도

```
코드 신뢰성      ██████████████████░░  90%
보안             █████████████████░░░  85%
MVP 기능         ██████████████████░░  90%
데이터 충분성     ███████████████░░░░░  75%
운영 안정성       ████████████████░░░░  80%
배포 준비도       ██████░░░░░░░░░░░░░░  30%
```

---

## 남은 작업

### 코드 작업 (6건)

| # | 항목 | 심각도 | 설명 | 선행 조건 |
|---|---|---|---|---|
| 1 | Supabase RLS 전환 | CRITICAL | 읽기 쿼리를 anon key로 전환, RLS 정책 설정 | Supabase 프로젝트 필요 |
| 2 | alert_logs 기록 로직 | MEDIUM | checkProximityAlerts()에서 비동기 INSERT | DB 테이블 생성 후 |
| 3 | 3단계 DB 호출 통합 | MEDIUM | RPC 함수로 단일 호출 (100개+ 구간 확장 시) | 성능 문제 발생 시 |
| 4 | PostGIS 공간 쿼리 | MEDIUM | geometry 컬럼 + GiST 인덱스 (수만 건 확장 시) | 데이터 대량 확장 시 |
| 5 | 트랜잭션 격리 | MEDIUM | 다중 테이블 읽기에 REPEATABLE READ 적용 | RPC 통합과 동시 진행 |
| 6 | API 키 로테이션 | MEDIUM | 모바일 번들 노출 대응, 신/구 키 동시 유효 | 사용자 증가 시 |

### 인프라 작업 (4건)

| # | 항목 | 설명 |
|---|---|---|
| 7 | Supabase 프로젝트 생성 | 가입 → 프로젝트 생성 → 마이그레이션/시드 실행 |
| 8 | 서버 배포 | Railway/Fly.io에 백엔드 배포 + 환경변수 |
| 9 | 모바일 빌드 | EAS Build로 APK/IPA 생성 |
| 10 | 도메인/HTTPS | 커스텀 도메인 설정 (선택) |

### 에셋/문서 작업 (4건)

| # | 항목 | 설명 |
|---|---|---|
| 11 | 앱 아이콘/스플래시 | 1024x1024 아이콘 + 스플래시 이미지 제작 |
| 12 | 앱 스토어 스크린샷 | iPhone/Android 각 3장 이상 |
| 13 | 개인정보처리방침 | 위치 정보 수집 명시, 웹페이지 호스팅 |
| 14 | 이용약관 | 면책조항 포함, 앱 내 동의 화면 |

### 제출/운영 (3건)

| # | 항목 | 비용 |
|---|---|---|
| 15 | Google Play 제출 | $25 일회성 |
| 16 | Apple App Store 제출 | $99/년 |
| 17 | 출시 후 모니터링 체계 | Supabase 대시보드 + 서버 로그 감시 |

### 작업 순서

```
Phase 1  Supabase 세팅 + 로컬 실행 확인          ← 지금 바로 가능
Phase 2  RLS 전환 + alert_logs 구현              ← Supabase 생성 후
Phase 3  디자인 에셋 제작                         ← 병렬 가능
Phase 4  법률 문서 작성                           ← 병렬 가능
Phase 5  서버 배포 + 모바일 env 설정              ← Phase 1, 2 완료 후
Phase 6  기기 테스트 (Android + iOS)              ← Phase 5 완료 후
Phase 7  앱 스토어 제출                           ← Phase 3, 4, 6 완료 후
Phase 8  출시 후 모니터링                         ← 출시 후
```

---

## 비용

| 항목 | 초기 비용 | 월 운영비 |
|---|---|---|
| Supabase | 무료 | 무료 (500MB/무제한 API) |
| 서버 호스팅 | 무료 | $0~5 |
| Expo/EAS 빌드 | 무료 | 무료 (월 30회) |
| Google Play | $25 | - |
| Apple App Store | $99 | - (연간 $99) |
| 도메인 (선택) | $10~15 | - (연간 갱신) |
| **합계** | **$25~$140** | **$0~$5** |

---

## 관련 문서

| 파일 | 설명 |
|---|---|
| `docs/PRD.md` | 기획서 (요구사항, 화면 구성, 데이터 모델) |
| `docs/DATA_UPDATE.md` | 규칙/구간 데이터 갱신 절차 |
| `LAUNCH_CHECKLIST.md` | 출시 체크리스트 (Phase 1~8 상세) |
| `FINAL_REVIEW.md` | 코드 리뷰 최종본 (36건 + 해결 코드) |
| `SECURITY_AUDIT.md` | 보안/운영 감사 보고서 |
| `PRODUCT_GAPS.md` | 제품 완성도 갭 분석 (9건) |
