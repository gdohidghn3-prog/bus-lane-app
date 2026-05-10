/**
 * 세그먼트 상태 폴링 훅
 *
 * - AbortController로 중복 요청 취소
 * - AsyncStorage 오프라인 캐시
 * - 50m 이동 임계값으로 불필요한 fetch 방지
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSegments, checkAlerts } from '../services/api';
import type { Coordinate, MapSegment, ProximityAlert, VehicleType } from '../types';
import { distanceMeters } from '../utils/geo';
import { toUserMessage } from '../utils/errors';

interface SegmentState {
  segments: MapSegment[];
  alerts: ProximityAlert[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  cacheTimestamp: Date | null;
  isOffline: boolean;
}

const POLL_INTERVAL_MS = 30_000; // 30초마다 상태 갱신
const DISTANCE_THRESHOLD_M = 50; // 50m 미만 이동 시 fetch 건너뜀
const CACHE_KEY = '@bus_lane_segments_cache';

export function useSegments(location: Coordinate | null, vehicleType: VehicleType = 'general') {
  const [state, setState] = useState<SegmentState>({
    segments: [],
    alerts: [],
    loading: false,
    error: null,
    lastUpdated: null,
    cacheTimestamp: null,
    isOffline: false,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchLocationRef = useRef<Coordinate | null>(null);
  const lastFetchVehicleTypeRef = useRef<VehicleType | null>(null);

  const refresh = useCallback(async (force: boolean = false) => {
    if (!location) return;

    // F-08: vehicleType이 직전 fetch와 다르면 거리 임계값 무시
    const vehicleTypeChanged = lastFetchVehicleTypeRef.current !== vehicleType;

    // 거리 임계값 체크 (force 또는 vehicleType 변경 시는 건너뜀)
    if (
      !force &&
      !vehicleTypeChanged &&
      lastFetchLocationRef.current &&
      distanceMeters(lastFetchLocationRef.current, location) < DISTANCE_THRESHOLD_M
    ) {
      return;
    }

    // 이전 요청 취소
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [segResponse, alertResponse] = await Promise.all([
        getSegments(location, 2, vehicleType, controller.signal),
        checkAlerts(location, vehicleType, 500, controller.signal),
      ]);

      lastFetchLocationRef.current = location;
      lastFetchVehicleTypeRef.current = vehicleType;

      const newState: SegmentState = {
        segments: segResponse.segments,
        alerts: alertResponse.alerts,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        cacheTimestamp: null,
        isOffline: false,
      };

      setState(newState);

      // 성공 시 캐시 저장
      const cacheData = {
        segments: segResponse.segments,
        alerts: alertResponse.alerts,
        timestamp: new Date().toISOString(),
      };
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData)).catch(() => {});
    } catch (err) {
      // AbortError는 무시
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      // fetch 실패 시 캐시에서 로드
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            segments: MapSegment[];
            alerts: ProximityAlert[];
            timestamp: string;
          };
          setState({
            segments: parsed.segments,
            alerts: parsed.alerts,
            loading: false,
            error: '오프라인 — 캐시된 데이터 표시 중',
            lastUpdated: null,
            cacheTimestamp: new Date(parsed.timestamp),
            isOffline: true,
          });
          return;
        }
      } catch {
        // 캐시 읽기도 실패
      }

      // G-10: raw error 대신 사용자 친화 메시지로 매핑
      setState((prev) => ({
        ...prev,
        loading: false,
        error: toUserMessage(err),
        isOffline: false,
      }));
    }
  }, [location?.lat, location?.lng, vehicleType]);

  // 위치 변경 시 즉시 fetch + 주기적 폴링
  useEffect(() => {
    if (!location) return;

    refresh(false);

    timerRef.current = setInterval(() => refresh(true), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [refresh]);

  const lastFetchLocation = lastFetchLocationRef.current;

  return { ...state, refresh: () => refresh(true), lastFetchLocation };
}
