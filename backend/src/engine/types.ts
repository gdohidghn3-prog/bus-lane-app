/**
 * 규칙 엔진 타입 정의
 *
 * regulation_type 기반 확장 구조:
 * - 현재: 'bus_lane'
 * - 향후: 'school_zone' | 'parking' | 'highway_bus_lane'
 *
 * 이 파일의 타입은 Express/DB에 의존하지 않는 순수 도메인 타입이다.
 */

// ========================================
// 세그먼트 & 규제 데이터 (DB에서 조회한 결과)
// ========================================

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat] 쌍 (GeoJSON 표준)
}

export interface RoadSegment {
  id: string;
  name: string;
  road_name: string;
  direction: string;
  segment_type: string;
  geometry: GeoJSONLineString;
  center_lat: number;
  center_lng: number;
  city: string;
  district: string | null;
  is_active: boolean;
}

export type RegulationType = 'bus_lane' | 'school_zone' | 'parking' | 'highway_bus_lane';
export type DayType = 'weekday' | 'saturday' | 'sunday' | 'holiday' | 'all';
export type EnforcementLevel = 'enforced' | 'advisory';

export interface VehicleException {
  vehicle_type: string;  // 'taxi', '9_plus', 'bus', 'emergency'
  label: string;         // '택시', '9인승 이상'
}

export interface Regulation {
  id: string;
  segment_id: string;
  regulation_type: RegulationType;
  description: string;
  enforcement_level: EnforcementLevel;
  penalty_info: string | null;
  source: string | null;
  is_active: boolean;
}

export interface RegulationRule {
  id: string;
  regulation_id: string;
  day_type: DayType;
  start_time: string;  // 'HH:MM'
  end_time: string;
  is_prohibited: boolean;
  exceptions: VehicleException[];
  priority: number;
  note: string | null;
}

// ========================================
// 평가 입력 & 출력
// ========================================

export interface EvaluationContext {
  datetime: Date;
  vehicleType?: string;  // 'general' | 'taxi' | '9_plus' | 'bus' | 'emergency'
  regulationType?: RegulationType;
}

export type SegmentStatus = 'allowed' | 'prohibited' | 'caution';

export interface EvaluationResult {
  status: SegmentStatus;
  reason: string;
  regulationType: RegulationType;
  activeRule: RegulationRule | null;
  regulation: Regulation | null;
  exceptions: VehicleException[];
  /** 현재 시간부터 상태 변경까지 남은 분 (caution 용) */
  minutesUntilChange: number | null;
}

export interface SegmentEvaluation {
  segment: RoadSegment;
  results: EvaluationResult[];
  /** 가장 높은 심각도 상태 (prohibited > caution > allowed) */
  overallStatus: SegmentStatus;
}

// ========================================
// 경고 (proximity alert)
// ========================================

export interface ProximityAlert {
  segmentId: string;
  segmentName: string;
  distanceMeters: number;
  status: SegmentStatus;
  reason: string;
  penaltyInfo: string | null;
}
