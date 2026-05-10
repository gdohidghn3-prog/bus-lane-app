/**
 * 글로벌 에러 핸들러 — 모든 라우트의 catch 블록을 한 곳에서 처리
 */
import { ErrorRequestHandler } from 'express';
import logger from '../config/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error({ err, method: req.method, path: req.path }, 'unhandled route error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};
