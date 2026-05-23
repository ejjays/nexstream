import { Router } from 'express';
import {
  streamEvents,
  getVideoInformation,
  getStreamUrls,
  reportTelemetry,
  convertVideo,
  proxyStream,
  seedIntelligence,
} from '../controllers/video.controller.js';
import { concurrencyGuard } from '../utils/network/security.util.js';

const router = Router();

router.get('/events', streamEvents);
router.get('/info', getVideoInformation);
router.get('/stream-urls', getStreamUrls);
router.post('/telemetry', reportTelemetry);
router.all('/convert', concurrencyGuard(2), convertVideo);
router.get('/proxy', concurrencyGuard(2), proxyStream);
router.get('/seed-intelligence', seedIntelligence);

export default router;
