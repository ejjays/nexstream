const express = require('express');
const router = express.Router();
const keyChangerController = require('../controllers/keychanger.controller');

router.post('/detect', keyChangerController.upload.single('song'), keyChangerController.detectKey);
router.get('/detect-processed/:filename', keyChangerController.detectProcessedKey);
router.post('/convert', keyChangerController.upload.single('song'), keyChangerController.convertKey);
router.get('/download/:filename', keyChangerController.downloadFile);

module.exports = router;