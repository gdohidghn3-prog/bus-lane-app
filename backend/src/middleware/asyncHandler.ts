/**
 * Express 비동기 라우트 핸들러 래퍼 — try/catch 중복 제거
 *
 * 핸들러가 throw / reject 하면 next(err)로 넘긴다.
 * 글로벌 에러 미들웨어에서 통일된 500 응답을 반환.
 */
import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
