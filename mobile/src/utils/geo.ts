/**
 * 지리 좌표 유틸 — Haversine 거리 계산
 *
 * 백엔드의 backend/src/engine/geo-utils.ts 와 동일 알고리즘.
 * 모바일은 단일 사용처(useSegments)이므로 별도 모듈로 분리.
 */
import type { Coordinate } from '../types';

/** 두 좌표 사이 거리 (미터, Haversine) */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
