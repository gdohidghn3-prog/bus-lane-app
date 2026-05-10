# Render Free 슬립 회피 가이드

Render Free 플랜은 **15분간 요청이 없으면 인스턴스가 슬립**하며, 다음 요청 시 약 30~60초의 콜드 스타트가 발생합니다. 이는 모바일 앱 첫 사용 경험을 크게 해칩니다.

## 해결책: cron-job.org 무료 핑

### 1. 가입
https://cron-job.org → Sign up (무료, 카드 불필요)

### 2. Cron 등록
- **URL**: `https://bus-lane-api.onrender.com/api/health/live`
- **Schedule**: `Every 10 minutes` (Render 슬립 임계 15분보다 짧게)
- **Method**: GET
- **Notifications**: Failure만 이메일 (실패 3회 연속 시)

### 3. 검증
- 첫 핑 후 24시간 모니터링
- Render Dashboard → Logs 에서 `/api/health/live` 요청 10분마다 확인

## 비용 영향

cron-job.org는 무료. Render 무료 인스턴스 한도(월 750시간)는 30일 = 720시간이라 24/7 가동에도 여유.

## Supabase 일시중지 회피

Supabase Free는 **7일 무활동 시 프로젝트 일시중지**. `/api/health/live`는 DB를 호출하지 않으므로 별도 처리:

- 같은 cron-job.org에서 `/api/health/ready` (DB 호출 포함)를 1일 1회 추가 등록

## 한계 및 업그레이드 시점

- 콜드 스타트는 슬립을 막아도 배포 직후·OOM 재시작 시 1회 발생
- DAU 500명 또는 응답 P95 > 1초 지속 시 Render Starter ($7/월) 검토
- Supabase는 DB 500MB 또는 전송 5GB 한계 도달 시 Pro ($25/월) 검토
