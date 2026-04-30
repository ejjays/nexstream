import { Router } from 'express';
import * as keyChangerController from '../controllers/keychanger.controller.js';

const router = Router();

router.post('/detect', keyChangerController.upload.single('song'), keyChangerController.detectKey);
router.get('/detect-processed/:filename', keyChangerController.detectProcessedKey);
router.post('/convert', keyChangerController.upload.single('song'), keyChangerController.convertKey);
router.get('/download/:filename', keyChangerController.downloadFile);

export default router;
