/**
 * 지리 유틸리티 — 거리 계산, bbox 필터링
 */

import type { Coordinate, GeoJSONLineString } from './types';

const EARTH_RADIUS_KM = 6371;

/**
 * 두 좌표 사이 거리 (미터, Haversine)
 */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1000;
}

/**
 * 사용자 위치에서 폴리라인(세그먼트)까지의 최소 거리 (미터)
 */
export function distanceToPolyline(point: Coordinate, geometry: GeoJSONLineString): number {
  const coords = geometry.coordinates;
  let minDist = Infinity;

  for (let i = 0; i < coords.length - 1; i++) {
    const a: Coordinate = { lat: coords[i][1], lng: coords[i][0] };
    const b: Coordinate = { lat: coords[i + 1][1], lng: coords[i + 1][0] };
    const dist = distanceToLineSegment(point, a, b);
    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

/**
 * 점에서 선분까지의 거리 (미터, 근사)
 */
function distanceToLineSegment(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const ab = { lat: b.lat - a.lat, lng: b.lng - a.lng };
  const ap = { lat: p.lat - a.lat, lng: p.lng - a.lng };
  const t = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
  const proj: Coordinate = {
    lat: a.lat + t * ab.lat,
    lng: a.lng + t * ab.lng,
  };
  return distanceMeters(p, proj);
}

function dot(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return a.lat * b.lat + a.lng * b.lng;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * BBox 계산 (중심 + 반경 km)
 */
export function bboxFromCenter(center: Coordinate, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(center.lat)));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}
