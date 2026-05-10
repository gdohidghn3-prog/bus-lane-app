/**
 * 운영 메트릭 — Prometheus exposition format
 *
 * 외부 의존성 없이 in-process counter/gauge로 노출. 무인증 엔드포인트라
 * 라벨에 PII가 들어가지 않도록 path는 라우트 패턴만 기록한다.
 */
import type { Request, Response, NextFunction } from 'express';

interface CounterMap { [key: string]: number; }

const startedAt = Date.now();
const requestsTotal: CounterMap = Object.create(null);
const requestErrorsTotal: CounterMap = Object.create(null);
let alertsServedTotal = 0;
let segmentsServedTotal = 0;

// path를 라우트 패턴으로 정규화 (UUID/숫자 제거 — high-cardinality 방지)
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const route = normalizePath(req.path);
    const status = res.statusCode;
    const key = `${req.method} ${route} ${status}`;
    requestsTotal[key] = (requestsTotal[key] || 0) + 1;
    if (status >= 500) {
      requestErrorsTotal[key] = (requestErrorsTotal[key] || 0) + 1;
    }
    if (route.startsWith('/api/v1/alerts')) alertsServedTotal++;
    if (route.startsWith('/api/v1/segments')) segmentsServedTotal++;
  });
  next();
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function metricsHandler(_req: Request, res: Response): void {
  const lines: string[] = [];
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${uptimeSec}`);

  const mem = process.memoryUsage();
  lines.push('# HELP process_resident_memory_bytes Resident set size in bytes');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push(`process_resident_memory_bytes ${mem.rss}`);
  lines.push('# HELP process_heap_used_bytes Node heap used in bytes');
  lines.push('# TYPE process_heap_used_bytes gauge');
  lines.push(`process_heap_used_bytes ${mem.heapUsed}`);

  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, value] of Object.entries(requestsTotal)) {
    const [method, route, status] = key.split(' ');
    lines.push(
      `http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${value}`,
    );
  }

  lines.push('# HELP http_request_errors_total HTTP responses with status >= 500');
  lines.push('# TYPE http_request_errors_total counter');
  for (const [key, value] of Object.entries(requestErrorsTotal)) {
    const [method, route, status] = key.split(' ');
    lines.push(
      `http_request_errors_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${value}`,
    );
  }

  lines.push('# HELP alerts_served_total Total /api/v1/alerts responses');
  lines.push('# TYPE alerts_served_total counter');
  lines.push(`alerts_served_total ${alertsServedTotal}`);

  lines.push('# HELP segments_served_total Total /api/v1/segments responses');
  lines.push('# TYPE segments_served_total counter');
  lines.push(`segments_served_total ${segmentsServedTotal}`);

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(lines.join('\n') + '\n');
}
