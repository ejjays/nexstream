import { Router } from 'express';
import {
  upload,
  detectKey,
  detectProcessedKey,
  convertKey,
  downloadFile,
} from '../controllers/keychanger.controller.js';

const router = Router();

router.post('/detect', upload.single('song'), detectKey);
router.get('/detect-processed/:filename', detectProcessedKey);
router.post('/convert', upload.single('song'), convertKey);
router.get('/download/:filename', downloadFile);

export default router;
