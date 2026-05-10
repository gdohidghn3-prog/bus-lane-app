# 배포 가이드

## 결정된 스택
- **백엔드**: Render Free
- **DB**: Supabase Free
- **모바일**: Android 우선 (iOS는 6개월 보류)
- **법률 문서**: GitHub Pages
- **월 비용**: $0
- **일회성 비용**: $25 (Google Play Console)

## 단계별 절차

### Step 1. Supabase 프로젝트 생성
1. https://supabase.com → New project
2. Region: Northeast Asia (Seoul) 또는 Tokyo
3. DB password 메모
4. SQL Editor → `CREATE EXTENSION postgis;` 실행
5. SQL Editor에서 다음 마이그레이션을 **번호 순서대로** 실행 (경로: 저장소의 `backend/migrations/`):
   - `001_initial_schema.sql`
   - `002_add_constraints.sql`
   - `003_alert_logs.sql`
   - `004_rls_policies.sql`
   - `005_alert_logs_retention_and_fk.sql` (G-05: 90일 보관 정책 + alert_logs FK 정합성)
6. SQL Editor에서 `backend/seeds/*.sql` 실행
7. Project Settings → API에서 다음 메모:
   - `URL`
   - `anon public` key
   - `service_role secret` key

### Step 2. GitHub 저장소 푸시
```powershell
cd C:\Users\82103\git\bus-lane-app
git init
git add .
git commit -m "init: bus lane app"
gh repo create bus-lane-app --private --source=. --push
```

### Step 3. Render 백엔드 배포
1. https://render.com → New → Blueprint
2. GitHub 저장소 연결 → `render.yaml` 자동 인식
3. 환경변수 입력 (Supabase 값들 + API_KEY 새로 생성):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `API_KEY` (16자 이상 랜덤 — `openssl rand -hex 32`)
   - `CORS_ORIGIN` (모바일은 CORS 무관, 임시로 `https://example.com`)
4. Deploy → 약 5분 후 `https://bus-lane-api.onrender.com/api/health/live` 200 확인

### Step 4. cron-job.org 핑 등록
`docs/RENDER_KEEPALIVE.md` 참조.

### Step 5. GitHub Pages 활성화
1. 저장소 Settings → Pages → Source: `main` branch, `/docs` folder
2. URL 확인: `https://<username>.github.io/bus-lane-app/`
3. `docs/STORE_LISTING.md`의 URL 자리 채우기

### Step 6. 모바일 EAS 셋업
```powershell
cd mobile
npm install -g eas-cli
eas login
eas init  # 자동으로 app.json의 projectId 채워짐
copy .env.example .env
# .env 편집: EXPO_PUBLIC_API_URL=https://bus-lane-api.onrender.com/api/v1
#            EXPO_PUBLIC_API_KEY=<Step 3에서 만든 API_KEY>
```

### Step 7. 디자인 자산 준비
- `mobile/assets/icon.png` (1024×1024)
- `mobile/assets/adaptive-icon.png` (1024×1024 foreground)
- `mobile/assets/splash.png` (1284×2778)
- `mobile/assets/notification-icon.png` (96×96 monochrome)
- 스토어 피처 그래픽 1024×500
- 폰 스크린샷 4장 (1080×1920)

도구: Figma 무료 / Canva / 또는 ChatGPT 이미지 생성 후 보정

### Step 8. Google Play Console 등록
1. https://play.google.com/console → $25 결제
2. 새 앱 생성 → 정보 입력 (`docs/STORE_LISTING.md` 참조)
3. Internal testing 트랙 먼저

### Step 9. 첫 빌드
```powershell
cd mobile
eas build --platform android --profile preview  # 내부 테스트용 APK
# 또는
eas build --platform android --profile production  # AAB (스토어 제출용)
```

### Step 10. 스토어 제출
```powershell
eas submit --platform android --profile production
```
또는 Play Console에서 AAB 수동 업로드.

### Step 11. 심사 후 출시
- Internal testing은 즉시
- Production은 검토 1~7일

## 롤백 절차
- Render: Deploy 탭 → 이전 커밋 Rollback 클릭
- Supabase: SQL `DELETE`/마이그레이션 역순 실행 (마이그레이션 down 스크립트 별도 작성 필요)
- 모바일: 이전 빌드 release 복원 또는 새 빌드 재배포

## 모니터링
- Render Logs (실시간)
- Supabase Dashboard → Logs
- 운영 메트릭: `https://bus-lane-api.onrender.com/metrics` (Prometheus 형식, 무인증)
- Supabase 사용량 알림 설정: `docs/RUNBOOK.md` §6 참조 (G-08)
- (옵션) Sentry 무료 티어 — 5K events/월

## 장애 대응
- 모든 장애·이상 상황 1차 대응 절차: `docs/RUNBOOK.md` 참조 (G-09)
- 키 유출·회전: `docs/KEY_ROTATION.md`
- 백그라운드 위치 심사용 동영상 촬영 가이드: `docs/RUNBOOK.md` §9 (G-11)
