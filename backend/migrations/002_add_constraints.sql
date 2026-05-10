-- 002_add_constraints.sql
-- CHECK 제약조건, updated_at 자동 갱신 트리거, 시드 멱등성을 위한 UNIQUE 제약조건

-- ========================================
-- CHECK constraints for enum-like columns
-- ========================================

-- regulation_type
ALTER TABLE regulations ADD CONSTRAINT chk_regulation_type
  CHECK (regulation_type IN ('bus_lane', 'school_zone', 'parking', 'highway_bus_lane'));

-- enforcement_level
ALTER TABLE regulations ADD CONSTRAINT chk_enforcement_level
  CHECK (enforcement_level IN ('enforced', 'advisory'));

-- day_type
ALTER TABLE regulation_rules ADD CONSTRAINT chk_day_type
  CHECK (day_type IN ('weekday', 'saturday', 'sunday', 'holiday', 'all'));

-- direction
ALTER TABLE road_segments ADD CONSTRAINT chk_direction
  CHECK (direction IN ('both', 'eastbound', 'westbound', 'northbound', 'southbound', 'inbound', 'outbound'));

-- segment_type
ALTER TABLE road_segments ADD CONSTRAINT chk_segment_type
  CHECK (segment_type IN ('central', 'curbside'));

-- ========================================
-- updated_at 자동 갱신 트리거
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_road_segments_updated_at
  BEFORE UPDATE ON road_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_regulations_updated_at
  BEFORE UPDATE ON regulations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================================
-- 시드 멱등성을 위한 UNIQUE 제약조건
-- ========================================

ALTER TABLE road_segments ADD CONSTRAINT uq_segment_identity
  UNIQUE (road_name, name, city);
