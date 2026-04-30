import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import wav from 'wav-decoder';
import { fileURLToPath } from 'node:url';
import { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_DIR = path.join(__dirname, '../../temp');
const uploadDir = path.join(TEMP_DIR, 'uploads');
const processedDir = path.join(TEMP_DIR, 'processed');

import { ChordsResult } from '../types/index.js';

interface EssentiaVector {
    delete: () => void;
}

interface EssentiaPCVVector extends EssentiaVector {
    push_back: (val: EssentiaVector) => void;
}

interface EssentiaInstance {
    arrayToVector: (arr: Float32Array) => EssentiaVector;
    vectorToArray: (vec: EssentiaVector) => string[] | number[];
    KeyExtractor: (vec: EssentiaVector) => { key: string; scale: string };
    Windowing: (vec: EssentiaVector) => { frame: EssentiaVector };
    Spectrum: (vec: EssentiaVector) => { spectrum: EssentiaVector };
    SpectralPeaks: (vec: EssentiaVector) => { frequencies: EssentiaVector; magnitudes: EssentiaVector };
    HPCP: (freqs: EssentiaVector, mags: EssentiaVector) => { hpcp: EssentiaVector };
    ChordsDetection: (vec: EssentiaPCVVector) => { chords: EssentiaVector };
    module: {
        VectorVectorFloat: new () => EssentiaPCVVector;
    };
}

let essentia: EssentiaInstance | null = null;

async function getEssentia(): Promise<EssentiaInstance | null> {
    if (essentia) return essentia;
    try {
        const { default: Essentia } = await import('essentia.js');
        essentia = new (Essentia as any).Essentia((Essentia as any).EssentiaWASM) as EssentiaInstance;
        return essentia;
    } catch (e: unknown) {
        const error = e as Error;
        console.error("❌ Essentia WASM failed", error.message);
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

export const upload = multer({ storage: storage });

const keyMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const detectKeyFromFile = async (filePath: string): Promise<ChordsResult> => {
    const essentiaInstance = await getEssentia();
    if (!essentiaInstance) throw new Error('Essentia engine not available');

    return new Promise((resolve, reject) => {
        const tempWavPath = path.join(uploadDir, `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);

        ffmpeg(filePath)
            .toFormat('wav')
            .audioChannels(1)
            .audioFrequency(44100)
            .on('end', () => {
                const buffer = fs.readFileSync(tempWavPath);
                wav.decode(buffer).then((audioData: { channelData: Float32Array[] }) => {
                    const signal = audioData.channelData[0];
                    const audioVector = essentiaInstance.arrayToVector(signal);
                    const keyResult = essentiaInstance.KeyExtractor(audioVector);
                    const frameSize = 4096;
                    const hopSize = 2048;
                    const pcpVector = new essentiaInstance.module.VectorVectorFloat();
                    
                    for (let i = 0; i < Math.min(signal.length, 44100 * 30); i += hopSize) {
                        if (i + frameSize > signal.length) break;
                        const frame = signal.slice(i, i + frameSize);
                        const frameVec = essentiaInstance.arrayToVector(frame);
                        const windowed = essentiaInstance.Windowing(frameVec).frame;
                        const spectrum = essentiaInstance.Spectrum(windowed).spectrum;
                        const peaks = essentiaInstance.SpectralPeaks(spectrum);
                        const hpcp = essentiaInstance.HPCP(peaks.frequencies, peaks.magnitudes).hpcp;
                        pcpVector.push_back(hpcp);
                        frameVec.delete();
                    }
                    
                    const chordsResult = essentiaInstance.ChordsDetection(pcpVector);
                    audioVector.delete();
                    pcpVector.delete();
                    fs.unlink(tempWavPath, () => {});
                    
                    const uniqueChords: string[] = [];
                    if (chordsResult && chordsResult.chords) {
                        const chordsArray = essentiaInstance.vectorToArray(chordsResult.chords) as string[];
                        chordsArray.forEach((c: string) => {
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
                }).catch((err: Error) => {
                    fs.unlink(tempWavPath, () => {});
                    reject(err);
                });
            })
            .on('error', (err: Error) => {
                fs.unlink(tempWavPath, () => {});
                reject(err);
            })
            .save(tempWavPath);
    });
};

export const detectKey = async (req: Request, res: Response) => {
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

export const detectProcessedKey = async (req: Request, res: Response) => {
    const filename = String(req.params.filename);
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

export const convertKey = (req: Request, res: Response) => {
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
            const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
            const host = req.headers.host;
            res.json({ 
                success: true, 
                filename: outputFilename,
                downloadUrl: `${protocol}://${host}/api/key-changer/download/${outputFilename}` 
            });
            fs.unlink(inputPath, () => {});
        })
        .on('error', (err: unknown) => {
            const error = err as Error;
            console.error('[KeyChanger] Conversion Error:', error.message);
            res.status(500).json({ error: 'Conversion failed.', details: error.message });
            fs.unlink(inputPath, () => {});
        })
        .save(outputPath);
};

export const downloadFile = (req: Request, res: Response) => {
    const filename = String(req.params.filename);
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
                const error = err as Error & { code?: string };
                if (error.code === 'ECONNABORTED' || error.code === 'EPIPE') {
                    return;
                }
                console.error('[KeyChanger] Download Error:', err);
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
};
