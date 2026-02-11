const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');

// Server-Sent Events for progress updates
router.get('/events', videoController.streamEvents);

// Get Video Info (and Spotify resolution)
router.get('/info', videoController.getVideoInformation);

// Convert and Download Video/Audio
router.all('/convert', videoController.convertVideo);

// Hidden Seeder Route
router.get('/seed-intelligence', videoController.seedIntelligence);

module.exports = router;