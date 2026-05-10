# 버스전용차로 데이터 갱신 절차

## 규칙 변경 시

1. 서울시 교통정보과 고시 확인
2. Supabase 대시보드 > Table Editor > regulation_rules 에서 해당 규칙 수정
3. 변경 내역을 `backend/seeds/seoul_bus_lanes.sql`에 반영 (버전 관리)
4. 변경 후 앱에서 해당 구간 확인 테스트

## 신규 구간 추가 시

1. road_segments에 구간 정보 INSERT (GeoJSON LineString 포함)
2. regulations에 규제 정의 INSERT
3. regulation_rules에 시간/요일별 규칙 INSERT
4. `backend/seeds/seoul_bus_lanes.sql`에 반영

## 공휴일 데이터 갱신

매년 12월에 다음 해 공휴일을 holidays 테이블에 추가한다.
대체공휴일은 확정 후 추가한다.

## 검증

- 규칙 엔진 테스트: `cd backend && npm test`
- 수동 API 테스트: `GET /api/v1/segments?lat=37.5710&lng=126.9770&radius=2`
