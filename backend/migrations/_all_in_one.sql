-- =============================================
-- 버스전용차로 — 전체 마이그레이션 + 시드 통합 SQL
-- 한 번에 실행하면 5개 마이그레이션 + 시드가 순서대로 적용됨
-- =============================================

-- ##### 001 INITIAL SCHEMA #####
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

-- ##### 002 CONSTRAINTS #####
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

-- ##### 003 ALERT LOGS #####
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

-- ##### 004 RLS POLICIES #####
-- 004_rls_policies.sql
-- 읽기 전용 anon 접근 + 쓰기는 service key만

ALTER TABLE road_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_segments" ON road_segments
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY "anon_read_regulations" ON regulations
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

CREATE POLICY "anon_read_rules" ON regulation_rules
  FOR SELECT TO anon, authenticated
  USING (TRUE);

CREATE POLICY "anon_read_holidays" ON holidays
  FOR SELECT TO anon, authenticated
  USING (TRUE);

-- alert_logs는 anon 읽기·쓰기 모두 차단 (service key만 INSERT)
-- 명시적 정책 없음 = RLS 활성화 시 거부됨

-- ##### 005 RETENTION + FK #####
-- 005_alert_logs_retention_and_fk.sql
-- F-13: alert_logs 90일 자동 삭제 (개인정보처리방침 준수)
-- F-15: alert_logs.segment_id FK 정책을 SET NULL로 명확화
--
-- 적용:
--   pg_cron 확장이 Supabase Free에서도 사용 가능 (대시보드 → Database → Extensions → pg_cron 활성화).
--   본 마이그레이션은 pg_cron 활성화를 가정한다.

-- ========================================
-- F-15: segment_id FK 정책 변경 (RESTRICT → SET NULL)
-- ========================================
-- road_segments 삭제 시 alert_logs는 segment_id를 NULL로 유지 (이력 보존).
ALTER TABLE alert_logs
  DROP CONSTRAINT IF EXISTS alert_logs_segment_id_fkey;

ALTER TABLE alert_logs
  ADD CONSTRAINT alert_logs_segment_id_fkey
  FOREIGN KEY (segment_id) REFERENCES road_segments(id) ON DELETE SET NULL;

-- ========================================
-- F-13: 90일 보존 정책 — pg_cron 일일 작업
-- ========================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 90일 초과 alert_logs 행을 매일 03:00 KST (= 18:00 UTC)에 삭제
-- 동일 작업명이 있으면 unschedule 후 재등록 (멱등성)
DO $$
BEGIN
  PERFORM cron.unschedule('alert_logs_cleanup_90d')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert_logs_cleanup_90d');
EXCEPTION WHEN OTHERS THEN
  -- pg_cron이 아직 활성화 안 됐거나 권한 부족 — 로그만 남기고 무시
  RAISE NOTICE 'pg_cron unschedule skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'alert_logs_cleanup_90d',
    '0 18 * * *',
    $cmd$DELETE FROM alert_logs WHERE created_at < NOW() - INTERVAL '90 days'$cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule failed (extension not enabled?): %', SQLERRM;
END $$;

-- ##### SEED — 서울 30개 구간 #####
-- seoul_bus_lanes.sql
-- 서울 주요 버스전용차로 30개 노선 시드 데이터
-- 좌표는 실제 도로 중심선 기준 근사값
-- 모든 INSERT는 ON CONFLICT DO NOTHING으로 멱등성 보장

-- ========================================
-- 중앙버스전용차로 (Central) 1~15
-- ========================================

-- 1. 종로 중앙버스전용차로 (24시간)
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('종로 중앙차로', '종로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9669,37.5710],[126.9720,37.5712],[126.9780,37.5715],[126.9850,37.5718],[126.9920,37.5722],[126.9980,37.5725],[127.0040,37.5728]]}',
  37.5718, 126.9850, '서울', '종로구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 2. 강남대로 중앙차로
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('강남대로 중앙차로', '강남대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0275,37.4979],[127.0282,37.5015],[127.0288,37.5050],[127.0293,37.5090],[127.0298,37.5130]]}',
  37.5050, 127.0288, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 3. 시흥대로 중앙차로
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('시흥대로 중앙차로', '시흥대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9282,37.4980],[126.9350,37.5020],[126.9420,37.5060],[126.9490,37.5100],[126.9560,37.5140]]}',
  37.5060, 126.9420, '서울', '동작구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 4. 도봉로 중앙차로
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('도봉로 중앙차로', '도봉로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0255,37.6100],[127.0260,37.6050],[127.0265,37.6000],[127.0270,37.5950],[127.0275,37.5900]]}',
  37.6000, 127.0265, '서울', '강북구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 5. 천호대로 중앙차로
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('천호대로 중앙차로', '천호대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0700,37.5380],[127.0770,37.5375],[127.0840,37.5370],[127.0910,37.5365],[127.0980,37.5360],[127.1050,37.5355]]}',
  37.5370, 127.0840, '서울', '강동구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 6. 올림픽대로 여의도~마포
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('올림픽대로 중앙차로', '올림픽대로', 'inbound', 'central',
  '{"type":"LineString","coordinates":[[126.9320,37.5265],[126.9350,37.5290],[126.9380,37.5330],[126.9420,37.5360],[126.9460,37.5395]]}',
  37.5330, 126.9390, '서울', '영등포구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 7. 테헤란로 강남역~삼성역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('테헤란로 중앙차로', '테헤란로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0276,37.4979],[127.0350,37.5010],[127.0450,37.5040],[127.0550,37.5065],[127.0631,37.5088]]}',
  37.5040, 127.0450, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 8. 한강대로 용산~노량진
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('한강대로 중앙차로', '한강대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9645,37.5295],[126.9640,37.5250],[126.9635,37.5200],[126.9628,37.5150],[126.9620,37.5100]]}',
  37.5200, 126.9635, '서울', '용산구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 9. 반포대로 고속터미널~반포
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('반포대로 중앙차로', '반포대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0020,37.5045],[127.0025,37.5000],[127.0030,37.4950],[127.0035,37.4900],[127.0038,37.4860]]}',
  37.4950, 127.0030, '서울', '서초구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 10. 송파대로 잠실~문정
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('송파대로 중앙차로', '송파대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.1005,37.5130],[127.1010,37.5085],[127.1015,37.5040],[127.1020,37.4990],[127.1025,37.4940]]}',
  37.5040, 127.1015, '서울', '송파구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 11. 동부간선도로 성수~중랑
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('동부간선도로 중앙차로', '동부간선도로', 'both', 'central',
  '{"type":"LineString","coordinates":[[127.0450,37.5440],[127.0465,37.5500],[127.0480,37.5560],[127.0495,37.5620],[127.0510,37.5680],[127.0525,37.5740]]}',
  37.5590, 127.0488, '서울', '성동구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 12. 수색로 수색~연신내
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('수색로 중앙차로', '수색로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9100,37.5820],[126.9120,37.5860],[126.9140,37.5900],[126.9160,37.5940],[126.9180,37.5980]]}',
  37.5900, 126.9140, '서울', '은평구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 13. 통일로 구파발~광화문
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('통일로 중앙차로', '통일로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9190,37.6370],[126.9250,37.6250],[126.9340,37.6100],[126.9450,37.5950],[126.9560,37.5830],[126.9680,37.5720],[126.9755,37.5720]]}',
  37.6050, 126.9430, '서울', '은평구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 14. 의주로 서대문~서울역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('의주로 중앙차로', '의주로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9560,37.5680],[126.9580,37.5660],[126.9600,37.5640],[126.9620,37.5615],[126.9650,37.5590]]}',
  37.5640, 126.9600, '서울', '중구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 15. 세종대로 광화문~서울역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('세종대로 중앙차로', '세종대로', 'both', 'central',
  '{"type":"LineString","coordinates":[[126.9770,37.5755],[126.9768,37.5720],[126.9765,37.5680],[126.9763,37.5640],[126.9760,37.5600]]}',
  37.5680, 126.9765, '서울', '중구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- ========================================
-- 가로변버스전용차로 (Curbside) 16~30
-- ========================================

-- 16. 신촌로 신촌역~이대역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('신촌로 가로변차로', '신촌로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[126.9368,37.5550],[126.9380,37.5565],[126.9395,37.5580],[126.9410,37.5595],[126.9425,37.5610]]}',
  37.5580, 126.9395, '서울', '서대문구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 17. 노량진로 노량진~대방
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('노량진로 가로변차로', '노량진로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[126.9425,37.5130],[126.9440,37.5110],[126.9455,37.5085],[126.9470,37.5060],[126.9485,37.5035]]}',
  37.5085, 126.9455, '서울', '동작구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 18. 영등포로 영등포역~여의도
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('영등포로 가로변차로', '영등포로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[126.9075,37.5155],[126.9120,37.5170],[126.9170,37.5190],[126.9220,37.5210],[126.9270,37.5230]]}',
  37.5190, 126.9170, '서울', '영등포구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 19. 양재대로 양재~수서
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('양재대로 가로변차로', '양재대로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0350,37.4840],[127.0400,37.4810],[127.0460,37.4775],[127.0530,37.4740],[127.0600,37.4710],[127.0670,37.4680]]}',
  37.4775, 127.0460, '서울', '서초구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 20. 방이동 올림픽공원~방이역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('올림픽로 가로변차로', '올림픽로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.1120,37.5185],[127.1100,37.5170],[127.1070,37.5155],[127.1040,37.5140],[127.1010,37.5125]]}',
  37.5155, 127.1070, '서울', '송파구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 21. 청담로 압구정~청담
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('청담로 가로변차로', '청담로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0280,37.5270],[127.0320,37.5260],[127.0370,37.5250],[127.0420,37.5240],[127.0470,37.5230]]}',
  37.5250, 127.0370, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 22. 봉은사로 삼성~봉은사
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('봉은사로 가로변차로', '봉은사로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0600,37.5088],[127.0590,37.5120],[127.0575,37.5155],[127.0560,37.5190],[127.0545,37.5220]]}',
  37.5155, 127.0575, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 23. 도산대로 논현~도산공원
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('도산대로 가로변차로', '도산대로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0310,37.5125],[127.0330,37.5150],[127.0350,37.5180],[127.0370,37.5210],[127.0390,37.5240]]}',
  37.5180, 127.0350, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 24. 삼성로 삼성역~선릉역
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('삼성로 가로변차로', '삼성로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0630,37.5090],[127.0600,37.5080],[127.0565,37.5070],[127.0530,37.5060],[127.0495,37.5050]]}',
  37.5070, 127.0565, '서울', '강남구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 25. 성내로 잠실~석촌
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('성내로 가로변차로', '성내로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0850,37.5130],[127.0860,37.5105],[127.0870,37.5080],[127.0880,37.5055],[127.0890,37.5030]]}',
  37.5080, 127.0870, '서울', '송파구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 26. 위례대로 위례~복정
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('위례대로 가로변차로', '위례대로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.1340,37.4780],[127.1330,37.4750],[127.1315,37.4720],[127.1300,37.4690],[127.1285,37.4660]]}',
  37.4720, 127.1315, '서울', '송파구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 27. 공항대로 김포공항~마곡
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('공항대로 가로변차로', '공항대로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[126.8010,37.5620],[126.8100,37.5610],[126.8200,37.5600],[126.8300,37.5590],[126.8400,37.5580],[126.8500,37.5570]]}',
  37.5595, 126.8250, '서울', '강서구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 28. 중앙로 수유~미아
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('중앙로 가로변차로', '중앙로', 'southbound', 'curbside',
  '{"type":"LineString","coordinates":[[127.0255,37.6380],[127.0258,37.6330],[127.0260,37.6280],[127.0263,37.6230],[127.0265,37.6180]]}',
  37.6280, 127.0260, '서울', '강북구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 29. 동일로 동대문~답십리
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('동일로 가로변차로', '동일로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0090,37.5710],[127.0130,37.5730],[127.0175,37.5755],[127.0220,37.5780],[127.0265,37.5805]]}',
  37.5755, 127.0175, '서울', '동대문구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- 30. 마장로 마장역~왕십리
INSERT INTO road_segments (name, road_name, direction, segment_type, geometry, center_lat, center_lng, city, district)
VALUES ('마장로 가로변차로', '마장로', 'both', 'curbside',
  '{"type":"LineString","coordinates":[[127.0390,37.5660],[127.0370,37.5645],[127.0345,37.5630],[127.0320,37.5615],[127.0295,37.5600]]}',
  37.5630, 127.0345, '서울', '성동구')
ON CONFLICT (road_name, name, city) DO NOTHING;

-- ========================================
-- 규제 정의 (각 세그먼트에 bus_lane 규제)
-- ========================================

-- 종로는 24시간 운영
INSERT INTO regulations (segment_id, regulation_type, description, enforcement_level, penalty_info, source)
SELECT s.id, 'bus_lane', '24시간 중앙버스전용차로', 'enforced',
  '승용차: 범칙금 5만원 / 승합차: 범칙금 4만원', '서울시 교통정보과'
FROM road_segments s
WHERE s.road_name = '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulations r WHERE r.segment_id = s.id AND r.regulation_type = 'bus_lane'
  );

-- 중앙차로 (종로 제외): 평일 07:00~21:00
INSERT INTO regulations (segment_id, regulation_type, description, enforcement_level, penalty_info, source)
SELECT s.id, 'bus_lane', '평일 07:00~21:00 중앙버스전용차로', 'enforced',
  '승용차: 범칙금 5만원 / 승합차: 범칙금 4만원', '서울시 교통정보과'
FROM road_segments s
WHERE s.segment_type = 'central' AND s.road_name != '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulations r WHERE r.segment_id = s.id AND r.regulation_type = 'bus_lane'
  );

-- 가로변차로: 평일 출퇴근시간
INSERT INTO regulations (segment_id, regulation_type, description, enforcement_level, penalty_info, source)
SELECT s.id, 'bus_lane', '평일 출퇴근시간 가로변버스전용차로', 'enforced',
  '승용차: 범칙금 5만원 / 승합차: 범칙금 4만원', '서울시 교통정보과'
FROM road_segments s
WHERE s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulations r WHERE r.segment_id = s.id AND r.regulation_type = 'bus_lane'
  );

-- ========================================
-- 규제 규칙 (시간/요일별)
-- ========================================

-- 종로 24시간: all days 00:00~24:00 금지 + 예외
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'all', '00:00', '24:00', TRUE,
  '[{"vehicle_type":"bus","label":"노선버스"},{"vehicle_type":"taxi","label":"택시"},{"vehicle_type":"9_plus","label":"9인승 이상 승합차"},{"vehicle_type":"emergency","label":"긴급차량"}]'::JSONB,
  10, '24시간 운영'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.road_name = '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'all'
  );

-- 중앙차로 (종로 제외): 평일 07:00~21:00 금지
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'weekday', '07:00', '21:00', TRUE,
  '[{"vehicle_type":"bus","label":"노선버스"},{"vehicle_type":"taxi","label":"택시 (일부 구간)"},{"vehicle_type":"9_plus","label":"9인승 이상 승합차"},{"vehicle_type":"emergency","label":"긴급차량"}]'::JSONB,
  10, '평일 주간 운영'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'central' AND s.road_name != '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'weekday'
  );

-- 중앙차로 (종로 제외): 토요일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'saturday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '토요일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'central' AND s.road_name != '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'saturday'
  );

-- 중앙차로 (종로 제외): 일요일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'sunday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '일요일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'central' AND s.road_name != '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'sunday'
  );

-- 중앙차로 (종로 제외): 공휴일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'holiday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '공휴일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'central' AND s.road_name != '종로' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'holiday'
  );

-- 가로변차로: 평일 출근 07:00~09:30 금지
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'weekday', '07:00', '09:30', TRUE,
  '[{"vehicle_type":"bus","label":"노선버스"},{"vehicle_type":"taxi","label":"택시"},{"vehicle_type":"9_plus","label":"9인승 이상 승합차"},{"vehicle_type":"emergency","label":"긴급차량"}]'::JSONB,
  10, '평일 출근시간 운영'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'weekday' AND rr.start_time = '07:00'
  );

-- 가로변차로: 평일 퇴근 17:00~20:30 금지
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'weekday', '17:00', '20:30', TRUE,
  '[{"vehicle_type":"bus","label":"노선버스"},{"vehicle_type":"taxi","label":"택시"},{"vehicle_type":"9_plus","label":"9인승 이상 승합차"},{"vehicle_type":"emergency","label":"긴급차량"}]'::JSONB,
  10, '평일 퇴근시간 운영'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'weekday' AND rr.start_time = '17:00'
  );

-- 가로변차로: 토요일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'saturday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '토요일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'saturday'
  );

-- 가로변차로: 일요일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'sunday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '일요일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'sunday'
  );

-- 가로변차로: 공휴일 해제
INSERT INTO regulation_rules (regulation_id, day_type, start_time, end_time, is_prohibited, exceptions, priority, note)
SELECT r.id, 'holiday', '00:00', '24:00', FALSE, '[]'::JSONB, 5, '공휴일 전일 해제'
FROM regulations r
JOIN road_segments s ON r.segment_id = s.id
WHERE r.regulation_type = 'bus_lane' AND s.segment_type = 'curbside' AND s.city = '서울'
  AND NOT EXISTS (
    SELECT 1 FROM regulation_rules rr WHERE rr.regulation_id = r.id AND rr.day_type = 'holiday'
  );

-- ========================================
-- 2026년 공휴일 (대체공휴일 포함)
-- ========================================
INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-01-01', '신정', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-02-16', '설날 전날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-02-17', '설날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-02-18', '설날 다음날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-02-19', '설날 대체공휴일', 'substitute')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-03-01', '삼일절', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-03-02', '삼일절 대체공휴일', 'substitute')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-05-05', '어린이날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-05-24', '부처님오신날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-05-25', '부처님오신날 대체공휴일', 'substitute')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-06-06', '현충일', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-08-15', '광복절', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-08-17', '광복절 대체공휴일', 'substitute')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-09-24', '추석 전날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-09-25', '추석', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-09-26', '추석 다음날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-10-03', '개천절', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-10-05', '개천절 대체공휴일', 'substitute')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-10-09', '한글날', 'national')
ON CONFLICT (date) DO NOTHING;

INSERT INTO holidays (date, name, holiday_type) VALUES
('2026-12-25', '성탄절', 'national')
ON CONFLICT (date) DO NOTHING;
