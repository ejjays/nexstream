const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configure storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../temp/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// AI Separation Endpoint
router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const inputPath = req.file.path;
  const outputDir = path.join(__dirname, '../../temp/stems');
  const fileName = path.parse(req.file.filename).name;

  // IMPORTANT: Since we removed 'lameenc', we MUST tell demucs to output WAV
  // We use the 'htdemucs_ft' model which is Fine-Tuned for better vocal clarity (less metallic artifacts)
  const demucsArgs = ['--two-stems=vocals', '-n', 'htdemucs_ft', inputPath, '-o', outputDir];

  console.log(`Starting separation for: ${fileName}`);
  
  // Use spawn to stream output in real-time
  const demucsProcess = spawn('demucs', demucsArgs);

  // Stream output to console so user can see progress
  demucsProcess.stdout.on('data', (data) => {
    process.stdout.write(`Demucs: ${data.toString()}`);
  });

  demucsProcess.stderr.on('data', (data) => {
    // Demucs often outputs progress bars to stderr
    process.stderr.write(`Demucs: ${data.toString()}`);
  });

  demucsProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Demucs process exited with code ${code}`);
      return res.status(500).json({ error: 'Failed to process audio. Check server logs.' });
    }

    console.log('Separation complete!');
    
    // The files are usually in: temp/stems/htdemucs/[filename]/...
    const resultPath = path.join(outputDir, 'htdemucs', fileName);
    
    res.json({
      message: 'Success',
      folder: fileName,
      files: ['vocals.wav', 'no_vocals.wav'] // '--two-stems=vocals' gives us these two
    });
  });
});

// Get History Endpoint
router.get('/history', (req, res) => {
  // Now looking in the fine-tuned model folder
  const historyDir = path.join(__dirname, '../../temp/stems/htdemucs_ft');
  
  if (!fs.existsSync(historyDir)) {
    return res.json([]);
  }

  const folders = fs.readdirSync(historyDir).filter(file => {
    return fs.statSync(path.join(historyDir, file)).isDirectory();
  });

  // Sort by newest first (using filesystem time)
  const sortedFolders = folders.map(folder => ({
    name: folder,
    time: fs.statSync(path.join(historyDir, folder)).mtime.getTime()
  })).sort((a, b) => b.time - a.time);

  res.json(sortedFolders);
});

module.exports = router;
