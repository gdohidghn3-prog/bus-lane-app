/**
 * 위치 추적 훅 — 권한 거부 시 앱이 죽지 않아야 한다 (비기능 요구사항)
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { Coordinate } from '../types';

interface LocationState {
  location: Coordinate | null;
  error: string | null;
  permissionGranted: boolean;
  loading: boolean;
}

export function useLocation(intervalMs: number = 5000): LocationState {
  const [state, setState] = useState<LocationState>({
    location: null,
    error: null,
    permissionGranted: false,
    loading: true,
  });
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          if (mounted) {
            setState({
              location: null,
              error: '위치 권한이 거부되었습니다. 설정에서 위치 권한을 허용해주세요.',
              permissionGranted: false,
              loading: false,
            });
          }
          return;
        }

        if (mounted) {
          setState((prev) => ({ ...prev, permissionGranted: true }));
        }

        // 초기 위치 (빠른 응답)
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (mounted) {
          setState((prev) => ({
            ...prev,
            location: { lat: initial.coords.latitude, lng: initial.coords.longitude },
            loading: false,
          }));
        }

        // 연속 추적
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: intervalMs,
            distanceInterval: 20, // 20미터 이동 시에만 업데이트
          },
          (loc) => {
            if (mounted) {
              setState((prev) => ({
                ...prev,
                location: { lat: loc.coords.latitude, lng: loc.coords.longitude },
                error: null,
              }));
            }
          },
        );
      } catch (err) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            error: `위치를 가져올 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
            loading: false,
          }));
        }
      }
    }

    start();

    return () => {
      mounted = false;
      watchRef.current?.remove();
    };
  }, [intervalMs]);

  return state;
}
