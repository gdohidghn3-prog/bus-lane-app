/**
 * 규칙 엔진 단위 테스트 — "규칙 로직은 테스트 가능해야 한다" (비기능 요구사항)
 *
 * DB/Express에 의존하지 않는 순수 함수이므로 빠르게 테스트 가능.
 */
import { describe, expect, it } from 'vitest';
import { evaluateRegulation, getDayType, isTimeInRange } from './rule-engine';
import type { Regulation, RegulationRule, EvaluationContext } from './types';

// ========================================
// 테스트 데이터 팩토리
// ========================================
const makeRegulation = (overrides?: Partial<Regulation>): Regulation => ({
  id: 'reg-1',
  segment_id: 'seg-1',
  regulation_type: 'bus_lane',
  description: '평일 07:00~21:00 중앙버스전용차로',
  enforcement_level: 'enforced',
  penalty_info: '범칙금 5만원',
  source: '서울시',
  is_active: true,
  ...overrides,
});

const makeRule = (overrides?: Partial<RegulationRule>): RegulationRule => ({
  id: 'rule-1',
  regulation_id: 'reg-1',
  day_type: 'weekday',
  start_time: '07:00',
  end_time: '21:00',
  is_prohibited: true,
  exceptions: [
    { vehicle_type: 'bus', label: '노선버스' },
    { vehicle_type: 'taxi', label: '택시' },
  ],
  priority: 10,
  note: null,
  ...overrides,
});

const makeWeekendRule = (): RegulationRule => ({
  id: 'rule-2',
  regulation_id: 'reg-1',
  day_type: 'saturday',
  start_time: '00:00',
  end_time: '23:59',
  is_prohibited: false,
  exceptions: [],
  priority: 5,
  note: '토요일 해제',
});

const holidays = new Set(['2026-01-01', '2026-05-05']);

function ctx(hour: number, minute: number, date?: Date): EvaluationContext {
  const d = date || new Date(2026, 3, 14, hour, minute); // 2026-04-14 (화요일)
  d.setHours(hour, minute, 0, 0);
  return { datetime: d, vehicleType: 'general' };
}

// ========================================
// getDayType 테스트
// ========================================
describe('getDayType', () => {
  it('평일 판별', () => {
    expect(getDayType(new Date(2026, 3, 14), holidays)).toBe('weekday'); // 화요일
  });

  it('토요일 판별', () => {
    expect(getDayType(new Date(2026, 3, 18), holidays)).toBe('saturday');
  });

  it('일요일 판별', () => {
    expect(getDayType(new Date(2026, 3, 19), holidays)).toBe('sunday');
  });

  it('공휴일 판별 (신정)', () => {
    expect(getDayType(new Date(2026, 0, 1), holidays)).toBe('holiday');
  });

  it('KST 기준 날짜로 요일 판별', () => {
    // 2026-04-14 화요일 — KST에서도 화요일이어야 함
    const tuesday = new Date(2026, 3, 14, 12, 0);
    expect(getDayType(tuesday, new Set())).toBe('weekday');
  });
});

// ========================================
// isTimeInRange 테스트
// ========================================
describe('isTimeInRange', () => {
  it('일반 범위 내 시간', () => {
    expect(isTimeInRange('10:00', '07:00', '21:00')).toBe(true);
  });

  it('일반 범위 밖 시간', () => {
    expect(isTimeInRange('05:00', '07:00', '21:00')).toBe(false);
  });

  it('24:00 센티널 — 23:59도 포함', () => {
    expect(isTimeInRange('23:59', '07:00', '24:00')).toBe(true);
  });

  it('24:00 센티널 — 시작 시간과 같으면 포함', () => {
    expect(isTimeInRange('07:00', '07:00', '24:00')).toBe(true);
  });

  it('24:00 센티널 — 시작 시간 이전은 제외', () => {
    expect(isTimeInRange('06:59', '07:00', '24:00')).toBe(false);
  });

  it('자정 교차 — 23:30은 23:00~01:00 범위에 포함', () => {
    expect(isTimeInRange('23:30', '23:00', '01:00')).toBe(true);
  });

  it('자정 교차 — 00:30은 23:00~01:00 범위에 포함', () => {
    expect(isTimeInRange('00:30', '23:00', '01:00')).toBe(true);
  });

  it('자정 교차 — 12:00은 23:00~01:00 범위에 미포함', () => {
    expect(isTimeInRange('12:00', '23:00', '01:00')).toBe(false);
  });

  it('23:59 end_time — 23:59는 미포함 (기존 동작 유지)', () => {
    // end가 '23:59'이면 current < end이므로 23:59는 제외
    expect(isTimeInRange('23:59', '00:00', '23:59')).toBe(false);
  });
});

// ========================================
// evaluateRegulation 테스트
// ========================================
describe('evaluateRegulation', () => {
  const reg = makeRegulation();
  const rules = [makeRule(), makeWeekendRule()];

  it('평일 운영 시간 내 — 일반 차량 금지', () => {
    const result = evaluateRegulation(reg, rules, holidays, ctx(10, 0));
    expect(result.status).toBe('prohibited');
    expect(result.reason).toContain('금지');
  });

  it('평일 운영 시간 외 (새벽) — 허용', () => {
    const result = evaluateRegulation(reg, rules, holidays, ctx(5, 0));
    expect(result.status).toBe('allowed');
    expect(result.reason).toContain('운영 시간이 아닙니다');
  });

  it('평일 운영 종료 30분 전 — caution', () => {
    const result = evaluateRegulation(reg, rules, holidays, ctx(20, 40));
    expect(result.status).toBe('caution');
    expect(result.minutesUntilChange).toBeLessThanOrEqual(30);
  });

  it('평일 운영 시작 30분 전 — caution', () => {
    const result = evaluateRegulation(reg, rules, holidays, ctx(6, 35));
    expect(result.status).toBe('caution');
    expect(result.reason).toContain('분 후');
  });

  it('택시 — 예외 적용으로 허용', () => {
    const result = evaluateRegulation(reg, rules, holidays, {
      datetime: new Date(2026, 3, 14, 10, 0),
      vehicleType: 'taxi',
    });
    expect(result.status).toBe('allowed');
    expect(result.reason).toContain('예외');
  });

  it('토요일 — 해제 규칙으로 허용', () => {
    const saturday = new Date(2026, 3, 18, 10, 0);
    const result = evaluateRegulation(reg, rules, holidays, { datetime: saturday });
    expect(result.status).toBe('allowed');
    expect(result.reason).toContain('토요일 해제');
  });

  it('공휴일 — holiday 규칙이 없지만 holidays 셋에 있으면 규칙 없음 → 허용', () => {
    const holiday = new Date(2026, 0, 1, 10, 0); // 신정
    const result = evaluateRegulation(reg, rules, holidays, { datetime: holiday });
    // holiday 요일에 매칭되는 규칙이 없음 → 허용
    expect(result.status).toBe('allowed');
  });

  it('규칙이 없는 경우 — 허용', () => {
    const result = evaluateRegulation(reg, [], holidays, ctx(10, 0));
    expect(result.status).toBe('allowed');
    expect(result.reason).toContain('적용되는 규칙이 없습니다');
  });

  it('24:00 종료 시간 규칙 — 23:59에도 활성 (종료 임박 caution)', () => {
    const rule24 = makeRule({ end_time: '24:00' });
    const result = evaluateRegulation(reg, [rule24], holidays, ctx(23, 59));
    // 23:59는 07:00~24:00 범위 내이고, 종료 1분 전이므로 caution
    expect(result.status).toBe('caution');
    expect(result.minutesUntilChange).toBe(1);
  });

  it('24:00 종료 시간 규칙 — 23:00에는 금지', () => {
    const rule24 = makeRule({ end_time: '24:00' });
    const result = evaluateRegulation(reg, [rule24], holidays, ctx(23, 0));
    // 23:00은 07:00~24:00 범위 내, 종료까지 60분이므로 prohibited
    expect(result.status).toBe('prohibited');
  });

  it('24:00 종료 시간 규칙 — 05:00에는 미적용 (허용)', () => {
    const rule24 = makeRule({ end_time: '24:00' });
    const result = evaluateRegulation(reg, [rule24], holidays, ctx(5, 0));
    expect(result.status).toBe('allowed');
  });
});

// ========================================
// F-06: DB의 'HH:MM:SS' 포맷도 처리해야 한다
// ========================================
describe('TIME 형식 정규화 (F-06)', () => {
  const reg = makeRegulation();

  it('HH:MM:SS 포맷 규칙도 평일 운영시간 내로 평가', () => {
    const ruleWithSeconds = makeRule({ start_time: '07:00:00', end_time: '21:00:00' } as any);
    const result = evaluateRegulation(reg, [ruleWithSeconds], holidays, ctx(10, 0));
    expect(result.status).toBe('prohibited');
  });

  it('HH:MM:SS 24:00:00 센티널도 인식', () => {
    const ruleWithSeconds = makeRule({ start_time: '07:00:00', end_time: '24:00:00' } as any);
    const result = evaluateRegulation(reg, [ruleWithSeconds], holidays, ctx(23, 0));
    // 23:00은 07:00~24:00 활성, 종료까지 60분 → prohibited
    expect(result.status).toBe('prohibited');
  });

  it('isTimeInRange도 HH:MM:SS 입력 정규화', () => {
    expect(isTimeInRange('10:00:00', '07:00:00', '21:00:00')).toBe(true);
  });
});

// ========================================
// F-07: 자정 교차 규칙은 어제 dayType도 검사해야 한다
// ========================================
describe('자정 교차 day_type 처리 (F-07)', () => {
  const reg = makeRegulation();
  // 평일 22:00 ~ 02:00 금지 (예: 야간 도심 진입 제한 시뮬레이션)
  const nightRule = makeRule({
    day_type: 'weekday',
    start_time: '22:00',
    end_time: '02:00',
    priority: 20,
  });

  it('평일 23:00 — 활성', () => {
    // 2026-04-14 화요일 23:00
    const d = new Date(2026, 3, 14, 23, 0);
    const result = evaluateRegulation(reg, [nightRule], holidays, { datetime: d });
    expect(result.status).toBe('prohibited');
  });

  it('수요일 01:00 — 어제(화요일=평일) 시작 규칙도 인식', () => {
    // 2026-04-15 수요일 01:00 — 평일 dayType이지만, 자정 교차 규칙이 어제 시작했음
    const d = new Date(2026, 3, 15, 1, 0);
    const result = evaluateRegulation(reg, [nightRule], holidays, { datetime: d });
    expect(result.status).toBe('prohibited');
  });

  it('일요일 01:00 — 어제(토요일) 시작 weekday 규칙은 미적용', () => {
    // 2026-04-19 일요일 01:00. 어제 토요일은 weekday 아님 → 미적용 → allowed
    const d = new Date(2026, 3, 19, 1, 0);
    const result = evaluateRegulation(reg, [nightRule], holidays, { datetime: d });
    expect(result.status).toBe('allowed');
  });
});
