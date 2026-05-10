/**
 * 환경변수 단일 진입점 — 분산된 process.env 접근을 한 파일로 통합한다.
 *
 * 검증·기본값·production 강제 규칙을 여기서만 관리.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (isProd) throw new Error(`${name} must be set in production`);
    return '';
  }
  return v;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
}

const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (!CORS_ORIGIN && isProd) {
  throw new Error('CORS_ORIGIN must be set in production');
}

// G-04: API_KEY는 production에서 필수. 16자 이상.
const API_KEY = process.env.API_KEY;
if (isProd) {
  if (!API_KEY) {
    throw new Error('API_KEY must be set in production');
  }
  if (API_KEY.length < 16) {
    throw new Error('API_KEY must be at least 16 characters in production');
  }
}

export const env = {
  nodeEnv: NODE_ENV,
  isProd,
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: CORS_ORIGIN,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  apiKey: API_KEY,
} as const;
