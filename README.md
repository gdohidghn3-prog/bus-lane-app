# 버스전용차로 네비게이션

서울 운전자가 "지금 이 차선 들어가도 되는가?"를 위치·시간·요일·공휴일·차종 기반으로 즉답받는 모바일 앱. 전체 내비게이션이 아닌 **규칙 기반 운전 보조 앱**.

## 한눈에 보기

| | |
|---|---|
| 백엔드 | Express + TypeScript + Supabase (PostgreSQL/PostGIS) |
| 모바일 | React Native (Expo 52) + react-native-maps |
| 인증 | API Key (X-API-Key) |
| 시드 | 서울 30개 구간 + 30개 규제 + 100+ 규칙 + 20개 공휴일 |
| 테스트 | 백엔드 vitest 31/31 통과 |

## 디렉토리

```
backend/    Express API + 규칙 엔진 + 마이그레이션/시드
mobile/     Expo 앱 (지도 + 설정 + 백그라운드 경고)
docs/       PRD, 배포 가이드, 법률 문서, 데이터 갱신 절차
.github/    CI/CD 워크플로우
```

## 빠르게 시작 (로컬)

### 1. 백엔드

```bash
cd backend
cp .env.example .env        # SUPABASE_*, API_KEY 등 채우기
npm install
npm run dev                 # http://localhost:3000
npm test                    # 31개 테스트
```

### 2. 모바일

```bash
cd mobile
cp .env.example .env        # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_API_KEY
npm install
npm start                   # Expo 시작
```

## 상용화 진행 가이드

배포 단계별 명령어와 체크리스트는 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) 를 따라 진행하세요.

| 문서 | 용도 |
|---|---|
| `docs/DEPLOYMENT.md` | Step 1~11 배포 순서 (Supabase → Render → EAS → Play Console) |
| `docs/RENDER_KEEPALIVE.md` | Render Free 슬립 회피용 cron 설정 |
| `docs/PRIVACY_POLICY.md` | 개인정보처리방침 (GitHub Pages 호스팅 대상) |
| `docs/TERMS_OF_SERVICE.md` | 이용약관 + 면책조항 |
| `docs/STORE_LISTING.md` | Google Play 등록 메타 (이름/설명/카테고리) |
| `docs/PRD.md` | 기획서 |
| `docs/DATA_UPDATE.md` | 규칙·구간 데이터 갱신 절차 |

## 운영 비용

월 **$0** (Free 플랜 조합) + 일회성 **$25** (Google Play 개발자 계정).
업그레이드 트리거: DAU 500+ 또는 P95 > 1초 → Render Starter $7/월.

## 보안·운영 메모

- 모든 읽기 쿼리는 Supabase anon key + RLS 정책 사용 (`backend/migrations/004_rls_policies.sql`)
- alert_logs INSERT는 service key (앱 직접 접근 불가)
- 위치 PII는 그리드 익명화 (소수점 2자리)
- Rate limit: 일반 120/min, /alerts 60/min
- 알림 중복 방지: segmentId당 5분 쿨다운

## 라이선스

내부 프로젝트.
