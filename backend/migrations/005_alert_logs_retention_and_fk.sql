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
