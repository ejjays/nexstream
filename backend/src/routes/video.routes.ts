import { Router } from "express";
import * as videoController from "../controllers/video.controller.js";

const router = Router();

router.get("/events", videoController.streamEvents);
router.get("/info", videoController.getVideoInformation);
router.get("/stream-urls", videoController.getStreamUrls);
router.post("/telemetry", videoController.reportTelemetry);
router.all("/convert", videoController.convertVideo);
router.get("/proxy", videoController.proxyStream);
router.get("/seed-intelligence", videoController.seedIntelligence);

export default router;
