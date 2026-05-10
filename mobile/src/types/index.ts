/** 모바일 앱 타입 — 백엔드 API 응답 기반 */

export type SegmentStatus = 'allowed' | 'prohibited' | 'caution';

/** 차량 유형 */
export type VehicleType = 'general' | 'taxi' | '9_plus' | 'bus' | 'emergency';

/** 규제 유형 — backend RegulationType union과 일치 */
export type RegulationType = 'bus_lane' | 'school_zone' | 'parking' | 'highway_bus_lane';

/** 요일 유형 — backend DayType union과 일치 */
export type DayType = 'weekday' | 'saturday' | 'sunday' | 'holiday' | 'all';

/** 단속 강도 — backend EnforcementLevel union과 일치 */
export type EnforcementLevel = 'enforced' | 'advisory';

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  general: '일반 승용차',
  taxi: '택시',
  '9_plus': '9인승 이상 승합차',
  bus: '노선버스',
  emergency: '긴급차량',
};

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface VehicleException {
  vehicle_type: string;
  label: string;
}

export interface SegmentResult {
  status: SegmentStatus;
  reason: string;
  regulationType: RegulationType;
  minutesUntilChange: number | null;
  exceptions: VehicleException[];
}

export interface MapSegment {
  id: string;
  name: string;
  roadName: string;
  segmentType: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  overallStatus: SegmentStatus;
  results: SegmentResult[];
}

export interface SegmentsResponse {
  count: number;
  evaluatedAt: string;
  segments: MapSegment[];
}

export interface SegmentDetail {
  segment: {
    id: string;
    name: string;
    roadName: string;
    direction: string;
    segmentType: string;
    city: string;
    district: string | null;
  };
  overallStatus: SegmentStatus;
  evaluatedAt: string;
  regulations: {
    status: SegmentStatus;
    reason: string;
    regulationType: RegulationType;
    /** R-03: 백엔드는 r.regulation?.description 으로 undefined 가능 */
    description?: string;
    enforcementLevel?: EnforcementLevel;
    penaltyInfo?: string | null;
    source?: string | null;
    activeRule: {
      dayType: DayType;
      startTime: string;
      endTime: string;
      isProhibited: boolean;
      note: string | null;
    } | null;
    exceptions: VehicleException[];
    minutesUntilChange: number | null;
  }[];
}

export interface ProximityAlert {
  segmentId: string;
  segmentName: string;
  distanceMeters: number;
  status: SegmentStatus;
  reason: string;
  penaltyInfo: string | null;
}

export interface AlertsResponse {
  alertCount: number;
  checkedAt: string;
  alerts: ProximityAlert[];
}

export const STATUS_COLORS: Record<SegmentStatus, string> = {
  allowed: '#4CAF50',    // 초록 — 진입 가능
  prohibited: '#F44336', // 빨강 — 진입 금지
  caution: '#FF9800',    // 주황 — 주의
};

export const STATUS_LABELS: Record<SegmentStatus, string> = {
  allowed: '진입 가능',
  prohibited: '진입 금지',
  caution: '주의',
};
