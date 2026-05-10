/**
 * 지도 위 세그먼트 폴리라인 오버레이
 * 상태에 따라 색상 표시: 초록(allowed), 빨강(prohibited), 주황(caution)
 */
import React from 'react';
import { Polyline } from 'react-native-maps';
import type { MapSegment } from '../types';
import { STATUS_COLORS } from '../types';

interface Props {
  segments: MapSegment[];
  onSegmentPress: (segment: MapSegment) => void;
}

export function SegmentOverlay({ segments, onSegmentPress }: Props) {
  return (
    <>
      {segments.map((seg) => {
        const coords = seg.geometry.coordinates.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));

        return (
          <Polyline
            key={seg.id}
            coordinates={coords}
            strokeColor={STATUS_COLORS[seg.overallStatus]}
            strokeWidth={6}
            tappable
            onPress={() => onSegmentPress(seg)}
          />
        );
      })}
    </>
  );
}
