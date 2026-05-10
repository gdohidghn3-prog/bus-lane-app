/**
 * 입력 검증 헬퍼
 */

const VALID_VEHICLE_TYPES = ['general', 'taxi', 'bus', '9_plus', 'emergency'] as const;
type VehicleType = (typeof VALID_VEHICLE_TYPES)[number];

/**
 * 위도/경도가 유효한 숫자인지 검증한다.
 */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    isFinite(lat) &&
    isFinite(lng)
  );
}

/**
 * radius 검증: 양수 유한수, 최대 10 (km)
 */
export function sanitizeRadius(raw: unknown, defaultValue: number = 2): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (isNaN(n) || !isFinite(n) || n <= 0) return defaultValue;
  return Math.min(n, 10);
}

/**
 * alertRadius 검증: 양수 유한수, 최대 2000 (m)
 */
export function sanitizeAlertRadius(raw: unknown, defaultValue: number = 500): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (isNaN(n) || !isFinite(n) || n <= 0) return defaultValue;
  return Math.min(n, 2000);
}

/**
 * vehicleType 검증: 허용 목록에 없으면 'general' 반환
 */
export function sanitizeVehicleType(raw: unknown): VehicleType {
  if (typeof raw === 'string' && VALID_VEHICLE_TYPES.includes(raw as VehicleType)) {
    return raw as VehicleType;
  }
  return 'general';
}

/**
 * regulationType 검증: 허용 목록에 없으면 undefined 반환
 */
const VALID_REGULATION_TYPES = ['bus_lane', 'school_zone', 'parking', 'highway_bus_lane'] as const;
type RegulationTypeValue = (typeof VALID_REGULATION_TYPES)[number];

export function sanitizeRegulationType(raw: unknown): RegulationTypeValue | undefined {
  if (typeof raw === 'string' && (VALID_REGULATION_TYPES as readonly string[]).includes(raw)) {
    return raw as RegulationTypeValue;
  }
  return undefined;
}

/**
 * UUID 형식 검증
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
