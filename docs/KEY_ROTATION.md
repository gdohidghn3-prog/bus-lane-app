# API 키 로테이션 SOP

**대상**: `API_KEY` 환경 변수 (모바일 → 백엔드 호출용 X-API-Key 헤더)
**주기**: 분기 1회 + 유출 의심 시 즉시
**소요 시간**: 약 15분 (다운타임 없이 무중단)

---

## 배경 (F-03 대응)

모바일 앱 번들에 포함된 `EXPO_PUBLIC_API_KEY`는 디컴파일 시 추출 가능한 "준-공개" 키다.
서버는 IP+API 키 조합으로 rate limit을 적용하므로(F-03 패치), 키가 유출되어도
정상 사용자 트래픽은 영향을 덜 받는다. 그래도 정기 로테이션은 필수다.

---

## 로테이션 절차

1. **새 키 생성** (로컬)
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **백엔드에 듀얼 키 임시 적용** (선택, 무중단 원하면)
   - 현재 코드는 단일 키만 지원하므로 듀얼 키 필요 시 `auth.ts`를
     `API_KEY` + `API_KEY_PREVIOUS` 모두 허용하도록 패치 후 배포.
   - MVP에서는 짧은 다운타임 감수하고 단순 교체로 진행.

3. **Render 환경변수 갱신**
   - Render 대시보드 → bus-lane-backend → Environment → `API_KEY` 수정 → Save
   - 자동 재배포 (약 2~3분)

4. **Expo EAS Secret 갱신**
   ```bash
   cd mobile
   eas secret:create --scope project --name EXPO_PUBLIC_API_KEY --value <NEW_KEY> --force
   ```

5. **모바일 새 빌드 + Play Console 업로드**
   ```bash
   eas build --platform android --profile production
   ```
   - 빌드 완료 후 Play Console → 내부 테스트 트랙 → 단계 출시 (5% → 50% → 100%)
   - 구버전 사용자는 새 키 빌드를 받기 전까지 401 에러 (강제 업데이트 필요)

6. **이전 키 무효화 확인**
   - Render 환경변수에 새 키만 남아 있는지 확인
   - 백엔드 로그(`pino`)에서 401 비율 모니터링 (5분간 평소 대비 +20% 이상이면 롤백)

---

## 유출 의심 시 비상 절차

1. 위 절차를 30분 내 강행 (점진 출시 생략, 100% 즉시 배포)
2. 키 유출 의심 IP를 Render 방화벽에서 일시 차단
3. `alert_logs` 테이블에서 해당 시간대 비정상 패턴 조회

---

## 관련 시크릿

| 시크릿 | 위치 | 로테이션 빈도 |
|---|---|---|
| `API_KEY` | Render env + Expo Secret | 분기 1회 |
| `SUPABASE_SERVICE_KEY` | Render env (서버 전용) | 6개월 1회 |
| `SUPABASE_ANON_KEY` | Render env + Expo Secret | 6개월 1회 |
| `EXPO_TOKEN` (CI) | GitHub Secrets | 6개월 1회 |

서비스 키는 **모바일 번들에 절대 포함 금지** (이미 검증됨).
