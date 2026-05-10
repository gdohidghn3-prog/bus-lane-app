/**
 * 규칙 엔진 — UI/Express에 의존하지 않는 순수 함수 모듈
 *
 * 핵심 함수:
 *   evaluateSegment(segment, regulations, rules, holidays, context) -> SegmentEvaluation
 *
 * 확장 방법:
 *   새 regulation_type 추가 시 이 파일의 evaluate()만 수정하고
 *   나머지 (API, DB, UI)는 regulation_type 필드를 그대로 전달.
 */

import type {
  DayType,
  EvaluationContext,
  EvaluationResult,
  Regulation,
  RegulationRule,
  RoadSegment,
  SegmentEvaluation,
  SegmentStatus,
  VehicleException,
} from "./types";
import { getKSTDay, getKSTDateString, getKSTTimeString, getKSTHoursMinutes } from "./kst-utils";

// 시간 정규화 — DB는 HH:MM:SS, 엔진은 HH:MM (F-06)
function normalizeTime(t: string | null | undefined): string {
  if (!t) return "00:00";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function normalizeRule(r: RegulationRule): RegulationRule {
  return {
    ...r,
    start_time: normalizeTime(r.start_time),
    end_time: normalizeTime(r.end_time),
  };
}

export function evaluateSegment(
  segment: RoadSegment,
  regulations: Regulation[],
  rules: RegulationRule[],
  holidayDates: Set<string>,
  context: EvaluationContext,
): SegmentEvaluation {
  const results: EvaluationResult[] = [];

  for (const reg of regulations) {
    if (!reg.is_active) continue;
    if (context.regulationType && reg.regulation_type !== context.regulationType) continue;

    const regRules = rules.filter((r) => r.regulation_id === reg.id);
    const result = evaluateRegulation(reg, regRules, holidayDates, context);
    results.push(result);
  }

  const overallStatus = resolveOverallStatus(results);

  return { segment, results, overallStatus };
}

export function evaluateRegulation(
  regulation: Regulation,
  rules: RegulationRule[],
  holidayDates: Set<string>,
  context: EvaluationContext,
): EvaluationResult {
  const { datetime, vehicleType = "general" } = context;
  const dayType = getDayType(datetime, holidayDates);
  const currentTime = formatTime(datetime);

  const normalizedRules = rules.map(normalizeRule);

  // F-07: 자정 교차 규칙(end <= start)은 어제 dayType 규칙도 후보에 포함
  const yesterdayType = getDayType(new Date(datetime.getTime() - 24 * 60 * 60 * 1000), holidayDates);

  const applicableRules = normalizedRules
    .filter((r) => {
      const matchesToday = r.day_type === dayType || r.day_type === "all";
      const isCrossMidnight = r.end_time <= r.start_time && r.end_time !== "24:00";
      const matchesYesterday =
        isCrossMidnight && (r.day_type === yesterdayType || r.day_type === "all");
      return matchesToday || matchesYesterday;
    })
    .sort((a, b) => b.priority - a.priority);

  if (applicableRules.length === 0) {
    return makeResult("allowed", "해당 요일에 적용되는 규칙이 없습니다.", regulation, null);
  }

  const activeRule = applicableRules.find((r) => isTimeInRange(currentTime, r.start_time, r.end_time));

  if (!activeRule) {
    const nextRule = findNextRule(applicableRules, currentTime);
    const minutesUntil = nextRule ? minutesUntilTime(datetime, nextRule.start_time) : null;

    if (minutesUntil !== null && minutesUntil <= 30 && nextRule?.is_prohibited) {
      return makeResult(
        "caution",
        `${minutesUntil}분 후 진입 금지 시작 (${nextRule.start_time}부터)`,
        regulation,
        nextRule,
        minutesUntil,
      );
    }

    return makeResult("allowed", "현재 운영 시간이 아닙니다. 진입 가능합니다.", regulation, null);
  }

  if (!activeRule.is_prohibited) {
    return makeResult("allowed", activeRule.note || "현재 진입이 허용되어 있습니다.", regulation, activeRule);
  }

  const exceptions = parseExceptions(activeRule.exceptions);
  const isExempt = exceptions.some((e) => e.vehicle_type === vehicleType);

  if (isExempt) {
    const exemptLabel = exceptions.find((e) => e.vehicle_type === vehicleType)?.label || vehicleType;
    return makeResult(
      "allowed",
      `${exemptLabel} 차량은 예외 적용되어 진입 가능합니다.`,
      regulation,
      activeRule,
    );
  }

  const minutesUntilEnd = minutesUntilTime(datetime, activeRule.end_time);
  if (minutesUntilEnd <= 30) {
    return {
      status: "caution",
      reason: `현재 진입 금지 중이며, ${minutesUntilEnd}분 후 해제됩니다 (${activeRule.end_time}까지).`,
      regulationType: regulation.regulation_type,
      activeRule,
      regulation,
      exceptions,
      minutesUntilChange: minutesUntilEnd,
    };
  }

  return {
    status: "prohibited",
    reason: `${regulation.description} — 현재 진입이 금지되어 있습니다.`,
    regulationType: regulation.regulation_type,
    activeRule,
    regulation,
    exceptions,
    minutesUntilChange: minutesUntilEnd,
  };
}

export function getDayType(date: Date, holidayDates: Set<string>): DayType {
  const dateStr = formatDate(date);
  if (holidayDates.has(dateStr)) return "holiday";

  const day = getKSTDay(date);
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

function formatDate(date: Date): string {
  return getKSTDateString(date);
}

function formatTime(date: Date): string {
  return getKSTTimeString(date);
}

export function isTimeInRange(current: string, start: string, end: string): boolean {
  const c = normalizeTime(current);
  const s = normalizeTime(start);
  const e = normalizeTime(end);

  if (e === "24:00") return c >= s;

  if (e <= s) {
    return c >= s || c < e;
  }
  return c >= s && c < e;
}

function minutesUntilTime(now: Date, targetTime: string): number {
  const t = normalizeTime(targetTime);
  const [h, m] = t.split(":").map(Number);
  const { hours: nowH, minutes: nowM } = getKSTHoursMinutes(now);

  const nowMinutes = nowH * 60 + nowM;
  let targetMinutes = h * 60 + m;

  if (h === 24) targetMinutes = 24 * 60;

  if (targetMinutes <= nowMinutes) targetMinutes += 24 * 60;
  return targetMinutes - nowMinutes;
}

function findNextRule(rules: RegulationRule[], currentTime: string): RegulationRule | null {
  const c = normalizeTime(currentTime);
  const future = rules
    .filter((r) => normalizeTime(r.start_time) > c && r.is_prohibited)
    .sort((a, b) => normalizeTime(a.start_time).localeCompare(normalizeTime(b.start_time)));
  return future[0] || null;
}

function parseExceptions(raw: VehicleException[] | string): VehicleException[] {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw || [];
}

function resolveOverallStatus(results: EvaluationResult[]): SegmentStatus {
  if (results.some((r) => r.status === "prohibited")) return "prohibited";
  if (results.some((r) => r.status === "caution")) return "caution";
  return "allowed";
}

function makeResult(
  status: SegmentStatus,
  reason: string,
  regulation: Regulation,
  activeRule: RegulationRule | null,
  minutesUntilChange: number | null = null,
): EvaluationResult {
  return {
    status,
    reason,
    regulationType: regulation.regulation_type,
    activeRule,
    regulation,
    exceptions: activeRule ? parseExceptions(activeRule.exceptions) : [],
    minutesUntilChange,
  };
}
