/**
 * KST (Korea Standard Time) 유틸리티
 *
 * 서버가 어느 타임존에서 실행되더라도 항상 Asia/Seoul 기준으로
 * 날짜/시간을 계산한다.
 *
 * R-10: Intl.DateTimeFormat은 매 호출 인스턴스화 비용이 있으므로 모듈 상수로 캐싱.
 */

const KST_TIMEZONE = 'Asia/Seoul';

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIMEZONE,
  weekday: 'short',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const HM_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIMEZONE,
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
});

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Date 객체에서 KST 기준 요일을 반환한다 (0=Sun, 6=Sat).
 */
export function getKSTDay(date: Date): number {
  const parts = WEEKDAY_FORMATTER.format(date);
  return DAY_MAP[parts] ?? date.getDay();
}

/**
 * Date 객체에서 KST 기준 날짜 문자열 'YYYY-MM-DD'를 반환한다.
 */
export function getKSTDateString(date: Date): string {
  return DATE_FORMATTER.format(date); // 'YYYY-MM-DD'
}

/**
 * Date 객체에서 KST 기준 'HH:MM' 시간 문자열을 반환한다.
 */
export function getKSTTimeString(date: Date): string {
  // Intl may return "24:00" as "00:00" for midnight — we want "00:00" here
  const parts = TIME_FORMATTER.formatToParts(date);
  const h = (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(2, '0');
  const m = (parts.find((p) => p.type === 'minute')?.value ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Date 객체에서 KST 기준 시(hour)와 분(minute)을 반환한다.
 */
export function getKSTHoursMinutes(date: Date): { hours: number; minutes: number } {
  const parts = HM_FORMATTER.formatToParts(date);
  const hours = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return { hours, minutes };
}
