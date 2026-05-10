/**
 * 세그먼트 서비스 — DB 조회 + 규칙 엔진 조합
 *
 * 읽기 쿼리: anon 클라이언트(supabase) — RLS 정책 적용
 * 쓰기 쿼리: admin 클라이언트(supabaseAdmin) — alert_logs INSERT 등
 */
import { supabase, supabaseAdmin } from '../config/database';
import { evaluateSegment } from '../engine/rule-engine';
import { bboxFromCenter, distanceToPolyline } from '../engine/geo-utils';
import { getKSTDateString } from '../engine/kst-utils';
import logger from '../config/logger';
import type {
  Coordinate,
  EvaluationContext,
  ProximityAlert,
  Regulation,
  RegulationRule,
  RoadSegment,
  SegmentEvaluation,
} from '../engine/types';

const DEFAULT_RADIUS_KM = 2;
const ALERT_RADIUS_METERS = 500;
const GRID_PRECISION = 0.001;

let holidayCache: Set<string> | null = null;
let holidayCacheDate = '';
let holidayPromise: Promise<Set<string>> | null = null;

async function getHolidays(): Promise<Set<string>> {
  const today = getKSTDateString(new Date());
  if (holidayCache && holidayCacheDate === today) return holidayCache;

  if (!holidayPromise) {
    holidayPromise = (async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('date')
        .gte('date', `${today.slice(0, 4)}-01-01`);
      if (error) {
        // F-05: 에러 시 빈 Set 캐싱 금지 — 다음 호출에서 재시도
        throw new Error(`holidays query failed: ${error.message}`);
      }
      const cache = new Set((data || []).map((h: { date: string }) => h.date));
      holidayCache = cache;
      holidayCacheDate = today;
      return cache;
    })().finally(() => {
      holidayPromise = null;
    });
  }
  return holidayPromise;
}

export async function getSegmentsInBBox(
  center: Coordinate,
  radiusKm: number = DEFAULT_RADIUS_KM,
): Promise<RoadSegment[]> {
  const bbox = bboxFromCenter(center, radiusKm);

  const { data, error } = await supabase
    .from('road_segments')
    .select('*')
    .eq('is_active', true)
    .gte('center_lat', bbox.minLat)
    .lte('center_lat', bbox.maxLat)
    .gte('center_lng', bbox.minLng)
    .lte('center_lng', bbox.maxLng)
    .limit(200);

  if (error) throw new Error(`DB query failed: ${error.message}`);
  return (data || []) as RoadSegment[];
}

export async function getSegmentById(id: string): Promise<RoadSegment | null> {
  const { data, error } = await supabase
    .from('road_segments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as RoadSegment;
}

async function getRegulationsForSegments(segmentIds: string[]): Promise<Regulation[]> {
  if (segmentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('regulations')
    .select('*')
    .in('segment_id', segmentIds)
    .eq('is_active', true);
  // F-05: RLS/DB 장애를 "규제 없음"으로 오판단하면 안 됨
  if (error) throw new Error(`regulations query failed: ${error.message}`);
  return (data || []) as Regulation[];
}

async function getRulesForRegulations(regulationIds: string[]): Promise<RegulationRule[]> {
  if (regulationIds.length === 0) return [];
  const { data, error } = await supabase
    .from('regulation_rules')
    .select('*')
    .in('regulation_id', regulationIds);
  if (error) throw new Error(`regulation_rules query failed: ${error.message}`);
  return (data || []) as RegulationRule[];
}

export async function evaluateNearbySegments(
  center: Coordinate,
  context: EvaluationContext,
  radiusKm: number = DEFAULT_RADIUS_KM,
): Promise<SegmentEvaluation[]> {
  const segments = await getSegmentsInBBox(center, radiusKm);
  if (segments.length === 0) return [];

  const segmentIds = segments.map((s) => s.id);
  const [regulations, holidays] = await Promise.all([
    getRegulationsForSegments(segmentIds),
    getHolidays(),
  ]);

  const regulationIds = regulations.map((r) => r.id);
  const rules = await getRulesForRegulations(regulationIds);

  return segments.map((segment) => {
    const segRegs = regulations.filter((r) => r.segment_id === segment.id);
    const segRules = rules.filter((r) =>
      segRegs.some((reg) => reg.id === r.regulation_id),
    );
    return evaluateSegment(segment, segRegs, segRules, holidays, context);
  });
}

export async function evaluateSegmentById(
  segmentId: string,
  context: EvaluationContext,
): Promise<SegmentEvaluation | null> {
  const segment = await getSegmentById(segmentId);
  if (!segment) return null;

  const [regulations, holidays] = await Promise.all([
    getRegulationsForSegments([segmentId]),
    getHolidays(),
  ]);

  const regulationIds = regulations.map((r) => r.id);
  const rules = await getRulesForRegulations(regulationIds);

  return evaluateSegment(segment, regulations, rules, holidays, context);
}

function gridify(value: number): number {
  return Math.round(value / GRID_PRECISION) * GRID_PRECISION;
}

function logAlertAsync(
  segmentId: string,
  alertType: 'proximity_warning' | 'proximity_danger' | 'status_change',
  status: string,
  message: string,
  location: Coordinate,
): void {
  const payload = {
    segment_id: segmentId,
    alert_type: alertType,
    user_lat_grid: gridify(location.lat),
    user_lng_grid: gridify(location.lng),
    status,
    message,
  };
  void (async () => {
    try {
      const { error } = await supabaseAdmin.from('alert_logs').insert(payload);
      if (error) logger.warn({ err: error }, 'alert_logs insert failed');
    } catch (err) {
      logger.warn({ err }, 'alert_logs insert exception');
    }
  })();
}

export async function checkProximityAlerts(
  location: Coordinate,
  context: EvaluationContext,
  alertRadiusMeters: number = ALERT_RADIUS_METERS,
): Promise<ProximityAlert[]> {
  // F-10: 클라이언트가 요청한 alertRadius를 미터→킬로미터로 변환해서 BBox 조회
  // (기존 1km 하드코딩 → alertRadius 기반 동적 계산, 최소 1km로 클램프)
  const radiusKm = Math.max(1, alertRadiusMeters / 1000);
  const evaluations = await evaluateNearbySegments(location, context, radiusKm);
  const alerts: ProximityAlert[] = [];

  for (const ev of evaluations) {
    if (ev.overallStatus === 'allowed') continue;

    const dist = distanceToPolyline(location, ev.segment.geometry);
    if (dist > alertRadiusMeters) continue;

    const topResult = ev.results.find((r) => r.status !== 'allowed') || ev.results[0];
    const reason = topResult?.reason || '';

    alerts.push({
      segmentId: ev.segment.id,
      segmentName: ev.segment.name,
      distanceMeters: Math.round(dist),
      status: ev.overallStatus,
      reason,
      penaltyInfo: topResult?.regulation?.penalty_info || null,
    });

    const alertType = dist <= 200 ? 'proximity_danger' : 'proximity_warning';
    logAlertAsync(ev.segment.id, alertType, ev.overallStatus, reason, location);
  }

  return alerts.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
