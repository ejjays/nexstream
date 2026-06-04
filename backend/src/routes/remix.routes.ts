import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'node:url';
import * as remixController from '../controllers/remix.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '../../temp/uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100mb limit
});

router.post('/register-engine', remixController.registerEngine);
router.get('/engine-status', remixController.getEngineStatus);
router.post('/process', upload.single('file'), remixController.processAudio);
router.post('/wake-engine', remixController.wakeEngine);
router.post('/save', remixController.saveRemix);
router.get('/stems/:id/:file', remixController.serveStem);
router.get('/history', remixController.getHistory);
router.post('/rename', remixController.renameRemix);
router.delete('/delete/:id', remixController.deleteRemix);
router.get('/export/:id', remixController.exportRemix);
router.get('/extract/:id', remixController.extractRemix);

export default router;
