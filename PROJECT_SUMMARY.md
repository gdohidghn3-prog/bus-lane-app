# 버스전용차로 네비게이션 — 프로젝트 요약

마지막 갱신: 2026-05-11

---

## 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 버스전용차로 네비게이션 MVP |
| 한 줄 설명 | 운전자의 현재 위치/시간/요일/차량 종류를 기반으로 버스전용차로 진입 가능 여부를 실시간 판단하고 접근 경고를 보내는 지도 앱 |
| 포지셔닝 | 전체 내비게이션이 아닌 "규칙 기반 운전 보조 앱" — "지금 들어가도 되는가?"에 즉답 |
| 대상 사용자 | 서울 출퇴근 운전자, 초보 운전자, 외지 운전자, 택시/대리기사 |
| 출시 전략 | **Android 단독** (iOS 보류) / 월 운영비 $0 / 일회성 $25 (Google Play) |

---

## 기술 스택

| 계층 | 기술 |
|---|---|
| 백엔드 | Express.js + TypeScript, pino 로깅, helmet 보안 헤더 |
| 데이터베이스 | Supabase (PostgreSQL + PostGIS + pg_cron) |
| 모바일 | React Native (Expo 52) + TypeScript |
| 지도 | react-native-maps (Google Maps Android) |
| 위치 추적 | expo-location (포그라운드 + 백그라운드) |
| 알림 | expo-notifications (로컬 푸시) |
| 인증 | 정적 API Key (X-API-Key 헤더) |
| 배포(백엔드) | Render Free Plan (Singapore region) |
| 배포(모바일) | EAS Build → Google Play Console |
| CI/CD | GitHub Actions (테스트 + 보안 스캔) |
| 법률 호스팅 | GitHub Pages (Jekyll) |

---

## 운영 환경 (현재)

| 자원 | 값 |
|---|---|
| GitHub 저장소 | https://github.com/gdohidghn3-prog/bus-lane-app |
| GitHub Pages | https://gdohidghn3-prog.github.io/bus-lane-app/ |
| Supabase 프로젝트 ref | `moqbpdovzagfhgiuztfj` |
| 운영 백엔드 URL | https://bus-lane-api.onrender.com |
| 헬스체크 | `/api/health/live` `/api/health/ready` (인증 면제) |
| EAS 프로젝트 ID | `783c4d3c-91ba-4e8f-a186-192fcffaad84` |
| Expo owner | `moononi` |
| Android 패키지명 | `com.buslane.app` |
| 슬립 방지 핑 | cron-job.org 10분 간격 (헬스체크) |
| 운영비 | **$0/월** + 일회성 **$25** (Google Play) |

---

## 데이터 현황

| 자원 | 수량 |
|---|---|
| 도로 세그먼트 | 30 (서울 주요 노선) |
| 규제 정의 | 30 |
| 시간/요일 규칙 | 132 |
| 공휴일 데이터 | 20 (2026~2027년) |
| 마이그레이션 | 1~5 적용 완료 (RLS, alert_logs, pg_cron 90일 보존, FK SET NULL) |

---

## 처리 이력 (37건 클리어)

| 시리즈 | 처리 | 보류 | 비고 |
|---|---|---|---|
| **F-01~F-18** (기능·보안) | 18건 | 0건 | 백그라운드 토글, Android 13+ 알림, GPS 마스킹, Supabase 에러 throw, TIME 정규화, 자정교차, alertRadius, pg_cron, FK 정책, IP+키 rate limit, readiness anon, CI 보안 스캔, 키 로테이션 SOP |
| **R-01~R-14** (리팩터) | 8건 | 6건 | asyncHandler/DTO, env 단일화, formatter 캐싱, useSegmentDetail 훅, geo.ts, cooldown pruning, noUnusedLocals. 보류: repository 분리·useSegments 분리·API 오류 분류 등 |
| **G-01~G-15** (출시 게이트) | 11건 | 4건(분기) + 2건(외부) | OnboardingScreen 동의 게이트, API_KEY production fast-fail, 면책 4지점 노출, /metrics, RUNBOOK, 에러 UX. 보류: highway 차선·valid_until·외부 로그·WCAG AA |

---

## 검증

| | 결과 |
|---|---|
| 백엔드 `tsc --noEmit` | 0 errors |
| 백엔드 `npm test` | **31/31 통과** |
| 모바일 `tsc --noEmit` | 0 errors |
| 운영 `/api/health/live` | 200 OK |
| 운영 `/api/health/ready` | 200 ready |
| 운영 `/api/v1/segments` | 200 (3개 구간, RLS 통과, 규칙엔진 정상) |
| 운영 `/api/v1/alerts/check` | 200 |

---

## 출시 진행 상태 (M1~M5)

| 마일스톤 | 상태 | 비고 |
|---|---|---|
| **M1** git init + 2 커밋 | ✅ 완료 | `.gitignore` 강화, 시크릿 스캔 PASS |
| **M2** GitHub 저장소 + push + Pages | ✅ 완료 | 4개 커밋, Pages 활성화, `<github-username>` 치환 완료 |
| **M3** Render 배포 | ✅ 완료 | 운영 URL 동작, env 5개 입력, devDeps build 픽스 |
| **M4-A** Expo 가입 + EAS init | ✅ 완료 | projectId 발급, owner 등록 |
| **M4-B** preview APK 빌드 | ⚠️ **부분** | 빌드 1회 성공, 폰 설치 후 **지도 로딩 중 종료** — Google Maps API key 누락 진단 |
| **M4-C** 실기기 검증 | ⏸ 대기 | API key 등록 후 재빌드 필요 |
| **M5** AAB 빌드 + Play Console | ⏸ 대기 | M4-C 통과 후 |

---

## 현재 멈춰있는 지점

**Google Maps API key 미설정**

- `mobile/src/screens/MapScreen.tsx:61` 에서 `provider={PROVIDER_GOOGLE}` 사용
- `mobile/app.json` 에 `android.config.googleMaps.apiKey` 필드 없음
- 결과: 안드로이드 폰에서 지도 초기화 실패 → 로딩 중 앱 종료

**해결 경로**:
1. 사용자가 Google Cloud Console에서 Maps SDK for Android 활성화 + API key 발급 (10분, Free Tier 한도 내 결제 0원)
2. `app.json` 에 키 등록 + commit + push (복덩이 자동)
3. preview APK 재빌드 (15~20분)
4. 폰에서 동작 확인

---

## 코덱스 리뷰 이력

| 회차 | 시점 | 결과 |
|---|---|---|
| 리뷰 1 | git push 직전 | SAFE TO PUSH (시크릿 누출 0건) |
| 리뷰 2 | Render 배포 직전 | render.yaml 정합 OK (env 명세는 5개) |
| 리뷰 3 | EAS 빌드 직전 | SAFE TO BUILD (placeholder 아이콘 권고) |
| 리뷰 4 | Play Console 제출 직전 | **대기** (M4-C 통과 후) |

---

## 주요 문서

| 파일 | 용도 |
|---|---|
| `README.md` | 프로젝트 진입 |
| `docs/DEPLOYMENT.md` | Step 1~11 배포 순서 |
| `docs/RUNBOOK.md` | 인시던트·SOP·알림 설정·심사 영상 가이드 |
| `docs/PRIVACY_POLICY.md` | 개인정보처리방침 (GitHub Pages 호스팅) |
| `docs/TERMS_OF_SERVICE.md` | 이용약관 + 면책조항 |
| `docs/STORE_LISTING.md` | Google Play 등록 메타 |
| `docs/KEY_ROTATION.md` | API/Supabase 키 회전 절차 |
| `docs/RENDER_KEEPALIVE.md` | Free 플랜 슬립 회피 |
| `docs/DATA_UPDATE.md` | 규제 데이터 갱신 |
| `LAUNCH_CHECKLIST.md` | Phase 1~8 체크리스트 |
| `FINAL_REVIEW.md` | 코드 리뷰 36건 이력 |
| `SECURITY_AUDIT.md` | 보안·운영 감사 |
| `PRODUCT_GAPS.md` | 제품 완성도 갭 분석 9건 |

---

## 운영 비용

| 항목 | 월 비용 | 비고 |
|---|---|---|
| Supabase Free | $0 | DB 500MB / 전송 5GB |
| Render Free | $0 | 750h/월, 슬립 방지 cron 핑 |
| GitHub Pages | $0 | 법률 문서 호스팅 |
| cron-job.org | $0 | 무료, 카드 불필요 |
| Google Cloud Free Tier | $0 | Maps SDK 28,500회/월 무료 ($200 크레딧) |
| Expo (EAS) | $0 | 월 30회 빌드 |
| Google Play Console | **$25 일회성** | 개발자 계정 |
| **합계** | **$0/월** | + $25 1회 |

업그레이드 트리거: DAU 500+ 또는 P95 > 1초 → Render Starter $7/월. DB 500MB → Supabase Pro $25/월. Maps 28,500회 초과 → 1회당 $0.007.

---

## 다음 액션

`MEMORY.md` 의 todo 또는 본 문서의 **현재 멈춰있는 지점** 참조. 다음 사용자 액션은 Google Cloud Console 가입 + Maps SDK API key 발급. 발급 후 키 알려주시면 복덩이가 자동으로 등록·재빌드 안내까지 진행.
