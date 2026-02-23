const express = require("express");
const router = express.Router();
const videoController = require("../controllers/video.controller");

router.get("/events", videoController.streamEvents);

router.get("/info", videoController.getVideoInformation);

router.get("/stream-urls", videoController.getStreamUrls);

router.post("/telemetry", videoController.reportTelemetry);

router.all("/convert", videoController.convertVideo);

router.get("/proxy", videoController.proxyStream);

router.get("/seed-intelligence", videoController.seedIntelligence);

module.exports = router;
