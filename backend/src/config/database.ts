/**
 * Supabase 클라이언트 설정
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from './logger';
import { env } from './env';

if (!env.supabaseServiceKey) {
  logger.warn('SUPABASE_SERVICE_KEY is not set — falling back to anon key');
}

/** 일반 클라이언트 (anon key, RLS 적용) */
export const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  global: {
    fetch: (url: any, options: any) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(8000) }),
  },
});

/** 서비스 클라이언트 (service key, RLS 우회) — 서버 전용 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceKey || env.supabaseAnonKey,
  {
    global: {
      fetch: (url: any, options: any) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(8000) }),
    },
  },
);
