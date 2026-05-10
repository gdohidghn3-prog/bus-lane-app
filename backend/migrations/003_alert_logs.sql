-- 003_alert_logs.sql
-- 경고 로그 테이블 (apps/api 스키마에서 이관, 위치 정보 그리드 익명화)

CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES road_segments(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('proximity_warning', 'proximity_danger', 'status_change')),
  user_lat_grid DOUBLE PRECISION,
  user_lng_grid DOUBLE PRECISION,
  status TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_logs_created ON alert_logs (created_at DESC);
CREATE INDEX idx_alert_logs_segment ON alert_logs (segment_id, created_at DESC);
