-- 001_initial_schema.sql
-- regulation_type 기반 확장 구조: bus_lane → school_zone, parking, highway 등 추가 가능

-- PostGIS 확장 (Supabase에서는 대시보드에서 활성화)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ========================================
-- 도로 세그먼트 (지리적 구간)
-- ========================================
CREATE TABLE road_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- '종로 중앙차로 1구간'
  road_name TEXT NOT NULL,                     -- '종로'
  direction TEXT NOT NULL DEFAULT 'both',      -- 'eastbound', 'westbound', 'both'
  segment_type TEXT NOT NULL DEFAULT 'central', -- 'central', 'curbside'
  geometry JSONB NOT NULL,                     -- GeoJSON LineString { type, coordinates }
  center_lat DOUBLE PRECISION NOT NULL,        -- bbox 필터용 중심점
  center_lng DOUBLE PRECISION NOT NULL,
  city TEXT NOT NULL DEFAULT '서울',
  district TEXT,                               -- '종로구'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',                 -- 확장 필드
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_segments_center ON road_segments (center_lat, center_lng);
CREATE INDEX idx_segments_city ON road_segments (city, is_active);

-- ========================================
-- 규제 정의 (세그먼트에 붙는 규제)
-- ========================================
CREATE TABLE regulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES road_segments(id) ON DELETE CASCADE,
  regulation_type TEXT NOT NULL,               -- 'bus_lane' | 'school_zone' | 'parking' | 'highway_bus_lane'
  description TEXT NOT NULL,                   -- '평일 07:00~21:00 중앙버스전용차로'
  enforcement_level TEXT NOT NULL DEFAULT 'enforced', -- 'enforced' | 'advisory'
  penalty_info TEXT,                           -- '범칙금 6만원, 벌점 10점'
  source TEXT,                                 -- '서울시 교통정보과'
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regulations_segment ON regulations (segment_id, regulation_type);
CREATE INDEX idx_regulations_type ON regulations (regulation_type, is_active);

-- ========================================
-- 규제 규칙 (시간/요일별 세부 규칙)
-- ========================================
CREATE TABLE regulation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id UUID NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
  day_type TEXT NOT NULL,                      -- 'weekday' | 'saturday' | 'sunday' | 'holiday' | 'all'
  start_time TIME NOT NULL,                    -- '07:00'
  end_time TIME NOT NULL,                      -- '21:00'
  is_prohibited BOOLEAN NOT NULL DEFAULT TRUE, -- true = 일반 차량 진입 금지
  exceptions JSONB NOT NULL DEFAULT '[]',      -- [{"vehicle_type":"taxi","label":"택시"},{"vehicle_type":"9_plus","label":"9인승 이상"}]
  priority INTEGER NOT NULL DEFAULT 0,         -- 높을수록 우선
  note TEXT,                                   -- '토요일 해제'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_regulation ON regulation_rules (regulation_id, day_type);

-- ========================================
-- 공휴일 테이블 (요일 판별용)
-- ========================================
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,                          -- '설날', '추석'
  holiday_type TEXT NOT NULL DEFAULT 'national', -- 'national' | 'substitute' | 'temporary'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_holidays_date ON holidays (date);
