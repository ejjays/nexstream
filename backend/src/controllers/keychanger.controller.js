const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const wav = require('wav-decoder');

const TEMP_DIR = path.join(__dirname, '../../temp');
const uploadDir = path.join(TEMP_DIR, 'uploads');
const processedDir = path.join(TEMP_DIR, 'processed');

let Essentia;
let essentia;

// lazy load essentia
async function getEssentia() {
    if (essentia) return essentia;
    try {
        Essentia = require('essentia.js');
        essentia = new Essentia.Essentia(Essentia.EssentiaWASM);
        return essentia;
    } catch (e) {
        console.error("❌ Essentia WASM failed", e.message);
        return null;
    }
}

[uploadDir, processedDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});

exports.upload = multer({ storage: storage });

const keyMap = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const detectKeyFromFile = async (filePath) => {
    const essentia = await getEssentia();
    if (!essentia) throw new Error('Essentia engine not available');

    return new Promise((resolve, reject) => {
        const tempWavPath = path.join(uploadDir, `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);

        ffmpeg(filePath)
            .toFormat('wav')
            .audioChannels(1)
            .audioFrequency(44100)
            .on('end', () => {
                const buffer = fs.readFileSync(tempWavPath);
                wav.decode(buffer).then((audioData) => {
                    const signal = audioData.channelData[0];
                    const audioVector = essentia.arrayToVector(signal);
                    
                    const keyResult = essentia.KeyExtractor(audioVector);
                    
                    const frameSize = 4096;
                    const hopSize = 2048;
                    
                    const pcpVector = new essentia.module.VectorVectorFloat();
                    
                    for (let i = 0; i < Math.min(signal.length, 44100 * 30); i += hopSize) {
                        if (i + frameSize > signal.length) break;
                        
                        const frame = signal.slice(i, i + frameSize);
                        const frameVec = essentia.arrayToVector(frame);
                        
                        const windowed = essentia.Windowing(frameVec).frame;
                        const spectrum = essentia.Spectrum(windowed).spectrum;
                        const peaks = essentia.SpectralPeaks(spectrum);
                        const hpcp = essentia.HPCP(peaks.frequencies, peaks.magnitudes).hpcp;
                        
                        pcpVector.push_back(hpcp);
                        
                        frameVec.delete();
                    }
                    
                    const chordsResult = essentia.ChordsDetection(pcpVector);
                    
                    audioVector.delete();
                    pcpVector.delete();
                    fs.unlink(tempWavPath, () => {});
                    
                    const uniqueChords = [];
                    if (chordsResult && chordsResult.chords) {
                        const chordsArray = essentia.vectorToArray(chordsResult.chords);
                        chordsArray.forEach(c => {
                            if (uniqueChords[uniqueChords.length - 1] !== c) {
                                uniqueChords.push(c);
                            }
                        });
                    }
                    
                    resolve({ 
                        key: keyResult.key, 
                        scale: keyResult.scale,
                        chords: uniqueChords.filter(c => c !== 'N').slice(0, 12)
                    });
                }).catch((err) => {
                    fs.unlink(tempWavPath, () => {});
                    reject(err);
                });
            })
            .on('error', (err) => {
                fs.unlink(tempWavPath, () => {});
                reject(err);
            })
            .save(tempWavPath);
    });
};

exports.detectKey = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const result = await detectKeyFromFile(req.file.path);
        res.json(result);
    } catch (err) {
        console.error('[KeyChanger] Detection Error:', err);
        res.status(500).json({ error: 'Audio analysis failed' });
    } finally {
        fs.unlink(req.file.path, () => {});
    }
};

exports.detectProcessedKey = async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(processedDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const result = await detectKeyFromFile(filePath);
        res.json(result);
    } catch (err) {
        console.error('[KeyChanger] Processed Detection Error:', err);
        res.status(500).json({ error: 'Analysis failed' });
    }
};

exports.convertKey = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalKey, targetKey } = req.body;

    if (!originalKey || !targetKey || keyMap[originalKey] === undefined || keyMap[targetKey] === undefined) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Invalid keys provided' });
    }

    const originalVal = keyMap[originalKey];
    const targetVal = keyMap[targetKey];
    
    let semitones = targetVal - originalVal;
    
    if (semitones > 6) semitones -= 12;
    if (semitones < -6) semitones += 12;

    const pitchScale = Math.pow(2, semitones / 12);

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname);
    const baseName = path.basename(req.file.originalname, ext).replace(/[^a-zA-Z0-9\s.-]/g, '_');
    
    const outputFilename = `${Date.now()}__${targetKey}__${baseName}${ext}`;
    const outputPath = path.join(processedDir, outputFilename);

    ffmpeg(inputPath)
        .audioFilters(`rubberband=pitch=${pitchScale}`) 
        .on('end', () => {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers.host;
            res.json({ 
                success: true, 
                filename: outputFilename,
                downloadUrl: `${protocol}://${host}/api/key-changer/download/${outputFilename}` 
            });
            fs.unlink(inputPath, () => {});
        })
        .on('error', (err) => {
            console.error('[KeyChanger] Conversion Error:', err);
            res.status(500).json({ error: 'Conversion failed. Make sure FFmpeg has librubberband support.', details: err.message });
            fs.unlink(inputPath, () => {});
        })
        .save(outputPath);
};

exports.downloadFile = (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(processedDir, filename);

    if (fs.existsSync(filePath)) {
        let prettyName = filename;
        const parts = filename.split('__');
        
        if (parts.length >= 3) {
            const key = parts[1];
            const nameWithExt = parts.slice(2).join('__'); 
            const ext = path.extname(nameWithExt);
            const name = path.basename(nameWithExt, ext);
            
            const cleanName = name.replace(/_+/g, ' ').trim();
            prettyName = `(${key}) ${cleanName}${ext}`;
        }

        res.download(filePath, prettyName, (err) => {
            if (err) {
                if (err.code === 'ECONNABORTED' || err.code === 'EPIPE') {
                    return;
                }
                console.error('[KeyChanger] Download Error:', err);
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
};