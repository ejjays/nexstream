import os
import subprocess
import json
import zipfile
import traceback
import numpy as np
import shutil
from pathlib import Path
from remix_lab.config import logger, GPU_0, GPU_1, OUTPUT_DIR
from remix_lab.model_manager import clear_vram, get_beat_models
from remix_lab.processing import get_chords_btc_max_accuracy

def remix_audio_dual_gpu(audio_path, stems_mode):
    try:
        if not audio_path: 
            return [None]*11
            
        if os.path.exists(OUTPUT_DIR):
            logger.info("[CLEANUP] Pre-clearing separated directory...")
            shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
        os.makedirs(OUTPUT_DIR, exist_ok=True)

        clear_vram()
        model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
        logger.info(f"Starting Demucs Separation on {GPU_0}...")
        subprocess.run(["demucs", "-d", GPU_0, "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True)
    
        stem_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
        v, d, b, o = [str(stem_dir/f"{s}.wav") for s in ["vocals", "drums", "bass", "other"]]
        g = str(stem_dir/"guitar.wav") if stems_mode == "6 Stems" and (stem_dir/"guitar.wav").exists() else None
        p = str(stem_dir/"piano.wav") if stems_mode == "6 Stems" and (stem_dir/"piano.wav").exists() else None
        
        logger.info("Starting Madmom Beat Tracking on CPU...")
        BEAT_FEAT, BEAT_DECODE = get_beat_models()
        beat_activations = BEAT_FEAT(audio_path)
        beats = BEAT_DECODE(beat_activations).tolist()
        tempo = round(60 / np.median(np.diff(beats))) if len(beats) > 1 else 120
        
        logger.info(f"Starting MAX ACCURACY BTC Chord Recognition on {GPU_1}...")
        chord_data, reasoning = get_chords_btc_max_accuracy(audio_path, beats, tempo=tempo, bass_audio_path=b, other_audio_path=o)
        
        sheet_text = f"MAX ACCURACY DUAL-T4 REPORT (VITERBI MODE)\nBPM: {tempo}\n" + "="*30 + "\n\n"
        for c in chord_data: sheet_text += f"[{c['time']}s] {c['chord']}\n"
        
        zip_p = "/kaggle/working/Kaggle_Dual_T4_Max_Accuracy_Results.zip"
        with zipfile.ZipFile(zip_p, 'w') as z:
            chords_file = stem_dir/"chords.json"
            with open(chords_file, "w") as f: json.dump(chord_data, f, indent=2)
            z.write(chords_file, arcname="chords.json")
            reasoning_file = stem_dir/"reasoning.txt"
            with open(reasoning_file, "w") as f: f.write(reasoning)
            z.write(reasoning_file, arcname="reasoning.txt")
        
        clear_vram()
        return v, d, b, o, g, p, chord_data, {"beats": beats, "tempo": tempo}, sheet_text, zip_p, reasoning

    except Exception as e:
        logger.error(f"Error in remix_audio_dual_gpu: {e}")
        err_msg = traceback.format_exc()
        return [None]*6 + [[], {}, f"🔥 FATAL ERROR:\n{str(e)}\n\n{err_msg}", None, f"Pipeline Crashed:\n{str(e)}"]
