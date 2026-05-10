# 버스전용차로 네비게이션 MVP — 기획서 (PRD)

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| **프로젝트명** | 버스전용차로 네비게이션 MVP |
| **한 줄 설명** | 운전자의 현재 위치·시간·요일·도로 구간 규칙을 기반으로 버스전용차로 진입 가능 여부를 실시간 판단·경고하는 지도 기반 앱 |
| **핵심 포지셔닝** | 전체 내비게이션이 아닌 "규칙 기반 운전 보조 앱" — "지금 들어가도 되는가?"에 즉답 |

### 핵심 가치

1. 복잡한 버스전용차로 규칙을 자동 판단
2. 운전자가 현재 시점에 진입 가능한지 즉시 이해
3. 금지 구간 접근 시 미리 경고 → 위반 위험 감소
4. 향후 어린이보호구역·주정차 규제·고속도로 버스전용차로 등으로 확장 가능한 구조

---

## 2. 사용자 문제 정의

**운전자들이 겪는 문제:**

- 언제 진입 가능한지 기억하기 어렵다
- 평일/주말/공휴일/시간대에 따라 규칙이 달라진다
- 구간마다 운영 방식이 다르다
- 일반 지도 앱은 차로를 표시하더라도 "지금 들어가도 되는지" 즉시 판단 불가

**앱이 즉시 답해야 하는 질문:**

1. 지금 이 버스전용차로에 들어가도 되는가?
2. 곧 진입하면 위반 가능성이 있는가?
3. 왜 가능한지 / 왜 불가능한가?

---

## 3. 대상 사용자

**1차 타겟:** 서울·수도권 운전자, 출퇴근 운전자, 초보 운전자, 외지 운전자

**2차 타겟:** 대리기사, 택시기사, 배송기사, 법인 차량 운전자

---

## 4. 핵심 사용자 시나리오

**시나리오 1 — 현재 위치 기준 확인**

> 앱 실행 → 현재 위치 표시 → 주변 버스전용차로 구간이 상태별 색상으로 보임 → 즉시 판단

**시나리오 2 — 금지 구간 접근 경고**

> 이동 중 → 앱이 거리 계산 → 금지 구간 접근 시 경고 배너 → 차로 변경 유도

**시나리오 3 — 구간 상세 확인**

> 구간 터치 → 운영 요일·운영 시간·현재 상태·설명 문구 확인

---

## 5. MVP 범위

### 포함

| # | 기능 |
|---|---|
| F1 | 지도에 버스전용차로 구간 표시 |
| F2 | 현재 위치 표시 |
| F3 | 현재 시간/요일 기준 진입 가능 여부 계산 |
| F4 | 진입 가능/불가/주의 상태를 색상 표시 (초록/빨강/노랑) |
| F5 | 금지 구간 접근 시 경고 표시 |
| F6 | 구간 클릭 시 운영 규칙·현재 상태 설명 표시 |

### 제외

- 전체 길찾기/경로탐색 엔진
- 실시간 교통 기반 최적 경로 추천
- 음성안내
- 전국 단위 지원
- 로그인/회원가입/결제
- 카메라 기반 차선 인식
- 법적 책임 수준의 판정 보장

---

## 6. 서비스 핵심 기능 상세

### 6-1. 지도 기능

- 사용자 현재 위치 표시
- 버스전용차로 구간 polyline 표시
- 상태별 색상: allowed(초록), warning(노랑), restricted(빨강)

### 6-2. 규칙 판단 기능

- **입력:** 구간 ID, 현재 날짜/시간, 현재 요일 유형, 차량 종류
- **출력:** 현재 상태, 설명 메시지, 적용된 규칙 ID

### 6-3. 경고 기능

- 금지 구간 접근 시 경고 / 진입 위험 시 강한 경고
- 이유를 함께 안내

### 6-4. 설명 기능 (예시)

- "현재는 운영 시간이 아니므로 진입 가능합니다."
- "현재는 평일 출근시간 운영 중이므로 진입 불가입니다."
- "이 구간은 주말 미운영 구간입니다."

---

## 7. 화면 구성

### 홈 화면

- 상단: 현재 상태 요약
- 중앙: 지도
- 하단: 선택된 구간 상세 카드

### 구간 상세 카드

- 도로명, 구간명, 운영 요일, 운영 시간, 현재 상태, 상태 설명

### 설정 화면

- 테스트 도시 선택, 알림 ON/OFF, 위치 권한 안내, 앱 버전

---

## 8. 규칙 엔진 요구사항

**입력:** segmentId, currentDateTime, vehicleType, optional context (holiday, city)

**출력:** status (allowed|restricted|warning), message, matchedRuleId, matchedRuleSummary

**판단 순서:**

1. 해당 세그먼트 규칙 조회
2. 활성 규칙만 필터링
3. 차량 종류 필터링
4. 요일 유형 필터링
5. 공휴일 유형 필터링
6. 시간 범위 필터링
7. priority가 가장 높은 규칙 적용
8. 결과 반환

---

## 9. 데이터 모델

### road_segments

| 필드 | 설명 |
|---|---|
| id | PK (UUID) |
| regulation_type | bus_lane / school_zone / parking_restriction / expressway_bus_lane |
| city, road_name, segment_name | 위치 식별 |
| start_lat, start_lng, end_lat, end_lng | 구간 좌표 |
| polyline_json | GeoJSON LineString |
| direction | inbound / outbound / both |
| description, is_active, created_at, updated_at | 메타 |

### regulation_rules

| 필드 | 설명 |
|---|---|
| id, segment_id (FK) | 식별 |
| vehicle_type | car / taxi / bus / emergency / all |
| day_type | weekday / saturday / sunday / all |
| holiday_type | holiday / non_holiday / all |
| start_time, end_time | 운영 시간 |
| rule_action | allowed / restricted / warning |
| priority | 높을수록 우선 적용 |
| rule_description, is_active, created_at, updated_at | 메타 |

### alert_logs

| 필드 | 설명 |
|---|---|
| id, segment_id (FK) | 식별 |
| alert_type | proximity_warning / proximity_danger / status_change |
| user_lat, user_lng | 사용자 위치 |
| status, message, created_at | 경고 내용 |

---

## 10. API 요구사항

| # | 엔드포인트 | 설명 |
|---|---|---|
| 1 | `GET /api/segments` | 지도 범위 내 세그먼트 목록 반환 |
| 2 | `GET /api/segments/:id/status` | 특정 세그먼트 현재 상태 반환 |
| 3 | `POST /api/alerts/check` | 현재 위치 기반 접근 경고 판단 |
| 4 | `GET /api/segments/:id/detail` | 세그먼트 상세 및 규칙 반환 |

---

## 11. 비기능 요구사항

- 상태 계산 응답은 빠르게 처리
- 위치 권한 거부 시 앱 크래시 없이 안내
- 규칙 로직은 테스트 가능해야 함
- 시간 경계값 테스트 가능 (06:59/07:00/10:00/10:01)
- 새로운 규제 유형 추가 시 기존 구조 대폭 수정 불필요

---

## 12. 기술 스택

| 계층 | 선택 |
|---|---|
| Frontend | React Native + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 또는 Supabase |
| Infra | Render / Railway / Fly.io 중 택1 |
| Map | 네이버 지도 SDK 또는 카카오맵 SDK (연동 쉬운 쪽 우선) |

---

## 13. 핵심 설계 원칙

1. 규칙 엔진은 UI와 분리
2. 지도 데이터와 규칙 데이터는 분리
3. 모든 규칙은 하드코딩보다 테이블/설정 기반
4. regulation_type 기반 공통 구조로 설계 (bus_lane 전용 하드코딩 금지)
5. MVP는 서울 일부 구간만 지원, 정확도 우선

---

## 14. 향후 확장 방향

### 14-1. 규제 추가

- 어린이보호구역
- 주정차 단속 구역
- 고속도로 버스전용차로
- 차량 종류별 세부 예외 규칙

### 14-2. 경로 안내 확장

- 목적지 입력
- 경로 상 규제 위험 구간 사전 안내

### 14-3. 실시간성 확장

- 공공데이터 연동
- 사용자 신고
- 운영 규칙 업데이트 관리 화면

### 14-4. 수익화 확장

- 고급 경고 기능
- 상용차/법인차 대상 B2B 플랜
- 지역 확장

---

## 15. 확장 가능한 구조 원칙

1. bus_lane 전용 구조로 하드코딩하지 말고 regulation_type 기반 공통 구조로 설계
2. 세그먼트 정보와 규칙 정보를 분리
3. 규칙 엔진은 순수 함수 또는 독립 service로 분리
