import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import logger from './config/logger';
import { env } from './config/env';
import { apiKeyAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { supabase, supabaseAdmin } from './config/database';
import segmentRoutes from './routes/segments';

const app = express();
const PORT = env.port;

// --- Security headers ---
app.use(helmet());

// --- CORS ---
app.use(
  cors(
    env.corsOrigin
      ? { origin: env.corsOrigin.split(',').map((o) => o.trim()) }
      : undefined,
  ),
);

// --- Body parsing (16 KB limit) ---
app.use(express.json({ limit: '16kb' }));

// --- Trust proxy (for correct IP behind reverse proxy) ---
app.set('trust proxy', 1);

// --- Structured logging (pino-http) — GPS 좌표 마스킹 (F-04: PII 제거) ---
function maskUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  // lat / lng query 값을 소수점 2자리로 절삭 (~1km 정확도, 개인 식별 불가)
  return url.replace(/([?&](?:lat|lng)=)(-?\d+(?:\.\d+)?)/gi, (_m, prefix: string, val: string) => {
    const n = parseFloat(val);
    if (!isFinite(n)) return `${prefix}***`;
    return `${prefix}${n.toFixed(2)}`;
  });
}
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          method: req.method,
          url: maskUrl(req.url),
          remoteAddress: req.remoteAddress,
        };
      },
    },
  }),
);

// --- G-07: 운영 메트릭 수집 (모든 라우트 대상, 응답 finish 시 카운트) ---
app.use(metricsMiddleware);

// --- General rate limit: 120 req / min — IP+API key 조합 (F-03: 키 유출 시 IP별 격리) ---
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    keyGenerator: (req) => {
      const apiKey = req.header('X-API-Key') || 'no-key';
      const ip = req.ip || 'no-ip';
      return `${ip}|${apiKey}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// --- Liveness probe — process alive (no DB dependency) ---
app.get('/api/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Readiness probe — anon 클라이언트로 RLS 정책까지 검증 (F-17) ---
app.get('/api/health/ready', async (_req, res) => {
  const { error } = await supabase.from('road_segments').select('id').limit(1);
  if (error) {
    logger.error({ err: error }, 'Readiness check failed');
    return res.status(503).json({ status: 'not ready' });
  }
  return res.json({ status: 'ready' });
});

// --- G-07: Prometheus exposition (인증 없이 노출 — 라벨에 PII 없음) ---
app.get('/metrics', metricsHandler);

// --- API Key auth (applied to all routes below) ---
app.use(apiKeyAuth);

// --- Stricter rate limit for alert endpoint: 60 req / min ---
const alertLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => {
    const apiKey = req.header('X-API-Key') || 'no-key';
    const ip = req.ip || 'no-ip';
    return `${ip}|${apiKey}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/alerts', alertLimiter);

// --- Routes (versioned) ---
app.use('/api/v1', segmentRoutes);

// --- 글로벌 에러 핸들러 — asyncHandler가 next(err)로 위임한 예외 처리 ---
app.use(errorHandler);

// --- Start server ---
const server = app.listen(PORT, () => {
  logger.info(`Bus Lane API running on http://localhost:${PORT}`);
});

// --- Graceful shutdown ---
function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');
  server.close(() => {
    logger.info('Server closed gracefully');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// supabaseAdmin 사용 — 모듈 평가 부수효과로 import 유지
void supabaseAdmin;

export default app;
