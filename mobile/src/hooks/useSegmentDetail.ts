/**
 * 세그먼트 상세 로딩 훅 — 컴포넌트가 services를 직접 호출하지 않도록 분리.
 *
 * R-06: SegmentDetailModal이 데이터/표시 책임 분리.
 */
import { useEffect, useState } from 'react';
import { getSegmentDetail } from '../services/api';
import type { SegmentDetail, VehicleType } from '../types';

interface DetailState {
  detail: SegmentDetail | null;
  loading: boolean;
}

export function useSegmentDetail(
  segmentId: string | null,
  vehicleType: VehicleType = 'general',
): DetailState {
  const [detail, setDetail] = useState<SegmentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!segmentId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getSegmentDetail(segmentId, vehicleType)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [segmentId, vehicleType]);

  return { detail, loading };
}
