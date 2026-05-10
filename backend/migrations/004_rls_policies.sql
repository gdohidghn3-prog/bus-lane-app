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
