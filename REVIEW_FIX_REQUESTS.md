# 수정 요청 사항

작성일: 2026-04-12

아래 5건은 코드 리뷰 중 확인된 수정 필요 사항입니다.

## 1. [P1] proximity 거리 계산이 polyline 선분 기준이 아니라 꼭짓점 기준으로 되어 있음

- 위치: `packages/rule-engine/src/geo.ts`
- 현재 `distanceToPolyline()`가 polyline의 각 점(vertex)까지의 최소 거리만 계산하고 있습니다.
- 이 방식이면 사용자가 실제 차선 선분 위에 있더라도, 꼭짓점 사이 중간 지점에 있으면 수백 미터 떨어진 것으로 잘못 계산될 수 있습니다.
- 그 결과 proximity warning/alert가 누락될 수 있습니다.

수정 요청:

- 점-선분(point-to-segment) 거리 기준으로 polyline 전체 최소 거리를 계산하도록 변경해 주세요.

## 2. [P1] 주변 구간 조회가 시작점 좌표만 보고 있어서 긴 구간이 누락될 수 있음

- 위치: `apps/api/src/services/segmentService.ts`
- 참고: `apps/api/src/routes/alerts.ts`도 동일 패턴 사용
- 현재 bbox 조회가 `start_lat`, `start_lng`만 기준으로 필터링되고 있습니다.
- 그래서 시작점은 화면 밖에 있지만, 실제 구간(polyline 또는 end point)은 현재 지도 범위 안에 들어오는 긴 버스전용차로가 조회되지 않을 수 있습니다.
- 메인 지도 조회와 alert 체크 둘 다 false negative가 발생할 수 있습니다.

수정 요청:

- 최소한 `start/end` 좌표를 모두 고려해 주세요.
- 가능하면 geometry/polyline 기준 공간 조회로 바꿔 주세요.

## 3. [P1] 규칙 판정이 서버 로컬 타임존에 따라 달라짐

- 위치: `packages/rule-engine/src/evaluateRules.ts`
- 현재 엔진이 `Date.getDay()`, `Date.getHours()`를 그대로 사용하고 있어서 서버가 어느 타임존에서 실행되느냐에 따라 결과가 달라집니다.
- 서울 기준 앱인데 서버가 UTC 환경에서 뜨면 출퇴근 시간 규칙 판정이 어긋날 수 있습니다.

수정 요청:

- 규칙 판정 시점을 KST로 명시적으로 정규화해서 계산하도록 변경해 주세요.

## 4. [P1] 공휴일 규칙이 메인 API 경로에서 반영되지 않음

- 위치: `apps/api/src/services/segmentService.ts`
- 현재 목록/상세/경고 경로에서 `evaluateRules()` 호출 시 `context.isHoliday`를 넘기지 않고 있습니다.
- 그래서 엔진이 항상 non-holiday처럼 평가하게 되고, 실제 공휴일에도 평일 제한 규칙이 그대로 적용될 수 있습니다.
- seed 데이터도 대부분 `holiday_type = 'non_holiday'` 기반이라 오판 가능성이 큽니다.

수정 요청:

- 평가 시점의 공휴일 여부를 계산해서 `isHoliday` 컨텍스트를 반드시 전달해 주세요.

## 5. [P2] 종일 규칙(`00:00~23:59`)이 23:59 정확히 1분 동안 풀림

- 위치: `packages/rule-engine/src/evaluateRules.ts`
- 현재 `matchesTime()`가 종료 시각을 exclusive(`< endTime`)로 처리하고 있습니다.
- 그래서 `00:00~23:59` 규칙은 `23:59` 시점에 inactive가 됩니다.
- seed 데이터에서 이 표현을 사실상 "24시간 규제" 의미로 쓰고 있어서 의도와 어긋납니다.

수정 요청:

- 종일 규칙 표현을 별도로 정의하거나,
- `23:59`를 포함하도록 시간 범위 해석 방식을 정리해 주세요.

