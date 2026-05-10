/**
 * API Key 인증 미들웨어
 *
 * X-API-Key 헤더를 검증한다.
 * API_KEY 환경 변수가 설정되지 않으면 인증을 건너뛴다 (개발 환경).
 * production에서는 API_KEY 필수.
 */
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import logger from '../config/logger';
import { env } from '../config/env';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = env.apiKey;

  if (!expectedKey) {
    if (env.isProd) {
      logger.error('API_KEY must be set in production — rejecting request');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }
    logger.warn('API_KEY is not set — skipping auth (dev mode only)');
    return next();
  }

  const providedKey = req.header('X-API-Key');

  if (!providedKey || !safeCompare(providedKey, expectedKey)) {
    logger.warn({ ip: req.ip, path: req.path }, 'Unauthorized API access attempt');
    res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
    return;
  }

  next();
}
