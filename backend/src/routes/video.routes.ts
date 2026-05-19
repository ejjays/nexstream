import { Router } from "express";
import {
  streamEvents,
  getVideoInformation,
  getStreamUrls,
  reportTelemetry,
  convertVideo,
  proxyStream,
  seedIntelligence
} from "../controllers/video.controller.js";

const router = Router();

router.get("/events", streamEvents);
router.get("/info", getVideoInformation);
router.get("/stream-urls", getStreamUrls);
router.post("/telemetry", reportTelemetry);
router.all("/convert", convertVideo);
router.get("/proxy", proxyStream);
router.get("/seed-intelligence", seedIntelligence);

export default router;
