/**
 * API 서비스 — 백엔드와의 통신
 */
import type { AlertsResponse, Coordinate, SegmentDetail, SegmentsResponse } from "../types";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || (
  __DEV__ ? "http://10.0.2.2:3000/api/v1" : (() => { throw new Error("EXPO_PUBLIC_API_URL not set"); })()
);

const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "";

// F-09: 모든 호출에 기본 타임아웃 (포어/백 공통)
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchJSON<T>(url: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 외부 signal과 timeout signal 결합
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  const externalSignal = options?.signal;
  const onExternalAbort = () => timeoutController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) timeoutController.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }

  try {
    const res = await fetch(url, {
      ...options,
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * BBox 내 세그먼트 + 현재 상태 조회
 */
export async function getSegments(
  center: Coordinate,
  radius: number = 2,
  vehicleType: string = "general",
  signal?: AbortSignal,
): Promise<SegmentsResponse> {
  const params = new URLSearchParams({
    lat: center.lat.toString(),
    lng: center.lng.toString(),
    radius: radius.toString(),
    vehicleType,
  });
  return fetchJSON<SegmentsResponse>(`${API_BASE}/segments?${params}`, { signal });
}

/**
 * 단일 세그먼트 상세 조회
 */
export async function getSegmentDetail(
  segmentId: string,
  vehicleType: string = "general",
  signal?: AbortSignal,
): Promise<SegmentDetail> {
  const params = new URLSearchParams({ vehicleType });
  return fetchJSON<SegmentDetail>(`${API_BASE}/segments/${segmentId}/detail?${params}`, { signal });
}

/**
 * 접근 경고 체크
 */
export async function checkAlerts(
  location: Coordinate,
  vehicleType: string = "general",
  alertRadius: number = 500,
  signal?: AbortSignal,
): Promise<AlertsResponse> {
  return fetchJSON<AlertsResponse>(`${API_BASE}/alerts/check`, {
    method: "POST",
    body: JSON.stringify({
      lat: location.lat,
      lng: location.lng,
      vehicleType,
      alertRadius,
    }),
    signal,
  });
}
