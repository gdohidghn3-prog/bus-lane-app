/**
 * API 라우트
 *
 * GET  /api/v1/segments           — BBox 내 세그먼트 + 현재 상태
 * GET  /api/v1/segments/:id       — 단일 세그먼트 현재 상태
 * GET  /api/v1/segments/:id/detail — 세그먼트 상세 + 규칙 전체
 * POST /api/v1/alerts/check       — 현재 위치 기반 접근 경고
 */
import { Router } from 'express';
import {
  evaluateNearbySegments,
  evaluateSegmentById,
  checkProximityAlerts,
} from '../services/segment-service';
import type { EvaluationContext } from '../engine/types';
import {
  isValidLatLng,
  sanitizeRadius,
  sanitizeAlertRadius,
  sanitizeVehicleType,
  sanitizeRegulationType,
  isValidUUID,
} from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  serializeSegmentSummary,
  serializeSegmentCurrent,
  serializeSegmentDetail,
} from './segment-dto';

const router = Router();

// ========================================
// GET /api/v1/segments?lat=37.57&lng=126.98&radius=2&vehicleType=general
// ========================================
router.get(
  '/segments',
  asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (!isValidLatLng(lat, lng)) {
      return res.status(400).json({ error: 'lat and lng are required as valid numbers' });
    }

    const radius = sanitizeRadius(req.query.radius);
    const vehicleType = sanitizeVehicleType(req.query.vehicleType);
    const regulationType = sanitizeRegulationType(req.query.regulationType);

    const context: EvaluationContext = {
      datetime: new Date(),
      vehicleType,
      regulationType,
    };

    const evaluations = await evaluateNearbySegments({ lat, lng }, context, radius);

    return res.json({
      count: evaluations.length,
      evaluatedAt: new Date().toISOString(),
      context: { lat, lng, radius, vehicleType, regulationType: regulationType || 'all' },
      segments: evaluations.map(serializeSegmentSummary),
    });
  }),
);

// ========================================
// GET /api/v1/segments/:id — 세그먼트 현재 상태
// ========================================
router.get(
  '/segments/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid segment ID format' });
    }
    const vehicleType = sanitizeVehicleType(req.query.vehicleType);

    const context: EvaluationContext = { datetime: new Date(), vehicleType };
    const evaluation = await evaluateSegmentById(id, context);

    if (!evaluation) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    return res.json(serializeSegmentCurrent(evaluation, new Date().toISOString()));
  }),
);

// ========================================
// GET /api/v1/segments/:id/detail — 전체 규칙 포함 상세
// ========================================
router.get(
  '/segments/:id/detail',
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid segment ID format' });
    }
    const vehicleType = sanitizeVehicleType(req.query.vehicleType);

    const context: EvaluationContext = { datetime: new Date(), vehicleType };
    const evaluation = await evaluateSegmentById(id, context);

    if (!evaluation) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    return res.json(serializeSegmentDetail(evaluation, new Date().toISOString()));
  }),
);

// ========================================
// POST /api/v1/alerts/check — 접근 경고
// ========================================
router.post(
  '/alerts/check',
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;

    if (!isValidLatLng(lat, lng)) {
      return res.status(400).json({ error: 'lat and lng (valid numbers) are required' });
    }

    const vehicleType = sanitizeVehicleType(req.body.vehicleType);
    const alertRadius = sanitizeAlertRadius(req.body.alertRadius);

    const context: EvaluationContext = { datetime: new Date(), vehicleType };
    const alerts = await checkProximityAlerts({ lat, lng }, context, alertRadius);

    return res.json({
      alertCount: alerts.length,
      checkedAt: new Date().toISOString(),
      alerts,
    });
  }),
);

export default router;
