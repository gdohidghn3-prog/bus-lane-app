/**
 * /segments 라우트 DTO 직렬화 — JSON 응답 구조를 한 곳에서 관리
 */
import type { EvaluationResult, SegmentEvaluation } from '../engine/types';

export function serializeResult(r: EvaluationResult) {
  return {
    status: r.status,
    reason: r.reason,
    regulationType: r.regulationType,
    minutesUntilChange: r.minutesUntilChange,
    exceptions: r.exceptions,
  };
}

export function serializeSegmentSummary(ev: SegmentEvaluation) {
  return {
    id: ev.segment.id,
    name: ev.segment.name,
    roadName: ev.segment.road_name,
    segmentType: ev.segment.segment_type,
    geometry: ev.segment.geometry,
    overallStatus: ev.overallStatus,
    results: ev.results.map(serializeResult),
  };
}

export function serializeSegmentCurrent(ev: SegmentEvaluation, evaluatedAt: string) {
  return {
    id: ev.segment.id,
    name: ev.segment.name,
    roadName: ev.segment.road_name,
    overallStatus: ev.overallStatus,
    evaluatedAt,
    results: ev.results.map((r) => ({
      status: r.status,
      reason: r.reason,
      regulationType: r.regulationType,
      minutesUntilChange: r.minutesUntilChange,
      penaltyInfo: r.regulation?.penalty_info,
      exceptions: r.exceptions,
    })),
  };
}

export function serializeSegmentDetail(ev: SegmentEvaluation, evaluatedAt: string) {
  return {
    segment: {
      id: ev.segment.id,
      name: ev.segment.name,
      roadName: ev.segment.road_name,
      direction: ev.segment.direction,
      segmentType: ev.segment.segment_type,
      geometry: ev.segment.geometry,
      city: ev.segment.city,
      district: ev.segment.district,
    },
    overallStatus: ev.overallStatus,
    evaluatedAt,
    regulations: ev.results.map((r) => ({
      status: r.status,
      reason: r.reason,
      regulationType: r.regulationType,
      description: r.regulation?.description,
      enforcementLevel: r.regulation?.enforcement_level,
      penaltyInfo: r.regulation?.penalty_info,
      source: r.regulation?.source,
      activeRule: r.activeRule
        ? {
            dayType: r.activeRule.day_type,
            startTime: r.activeRule.start_time,
            endTime: r.activeRule.end_time,
            isProhibited: r.activeRule.is_prohibited,
            note: r.activeRule.note,
          }
        : null,
      exceptions: r.exceptions,
      minutesUntilChange: r.minutesUntilChange,
    })),
  };
}
