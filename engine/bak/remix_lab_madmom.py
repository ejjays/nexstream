import sys
import subprocess
import os
import gc
import logging
import json
import re
import zipfile
import shutil
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - PLATINUM-MIR - %(message)s')
OUTPUT_DIR = "/kaggle/working/separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 44100 
WHISPER_MODEL = None

def bootstrap():
    try:
        import madmom
    except ImportError:
        subprocess.check_call(["apt-get", "update", "-y"])
        subprocess.check_call(["apt-get", "install", "-y", "libfftw3-dev", "libavcodec-dev", "libavformat-dev", "libswresample-dev"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cython", "mido", "soundfile"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/CPJKU/madmom.git"])
    
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "faster-whisper", "pretty_midi", "resampy<0.4.3", "scipy"])

bootstrap()

import gradio as gr
import librosa
import numpy as np
import torch
from faster_whisper import WhisperModel
import soundfile as sf
from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor

CHORD_FEAT = CNNChordFeatureProcessor()
CHORD_DECODE = CRFChordRecognitionProcessor()
BEAT_FEAT = RNNBeatProcessor()
BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)

def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()

def get_enharmonic_map(key):
    flats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
    if key in flats:
        return {'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab'}
    return {'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#'}

def normalize_chord_name(chord, enharmonic_map=None):
    if chord == 'N' or not chord: return chord
    parts = chord.split('/')
    root_part = parts[0]
    bass_part = parts[1] if len(parts) > 1 else None

    def fix(s):
        m = re.match(r'^([A-G][b#]?)(.*)', s)
        if not m: return s
        r, sfx = m.groups()
        r = {'B#':'C', 'Cb':'B', 'Fb':'E', 'E#':'F'}.get(r, r)
        if enharmonic_map: r = enharmonic_map.get(r, r)
        return r + sfx

    res = fix(root_part)
    if bass_part: res += f"/{fix(bass_part)}"
    return res

def get_chords_v76_2(bass_p, acc_paths, drums_p):
    try:
        y_b, _ = librosa.load(bass_p, sr=SR)
        y_d, _ = librosa.load(drums_p, sr=SR)
        y_acc = None
        
        for p in acc_paths:
            if p and os.path.exists(p):
                y, _ = librosa.load(p, sr=SR)
                if y_acc is None: y_acc = y
                else: 
                    ml = min(len(y_acc), len(y))
                    np.add(y_acc[:ml], y[:ml] * 1.5, out=y_acc[:ml])
        
        ml = min(len(y_d), len(y_b), len(y_acc) if y_acc is not None else len(y_b))
        y_mix = np.add(y_acc[:ml] * 1.6, y_b[:ml] * 0.4, out=np.empty(ml, dtype=np.float32)) if y_acc is not None else y_b[:ml]
        
        mix_p = os.path.join(OUTPUT_DIR, "engine_mix.wav")
        sf.write(mix_p, y_mix, SR)
        
        chord_features = CHORD_FEAT(mix_p)
        madmom_preds = CHORD_DECODE(chord_features)
        beats = BEAT_DECODE(BEAT_FEAT(mix_p)).tolist()
        
        lbls = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        chroma_mix = librosa.feature.chroma_cqt(y=y_mix, sr=SR)
        c_avg = np.mean(chroma_mix, axis=1)
        global_key = lbls[np.argmax(c_avg)]
        e_map = get_enharmonic_map(global_key)
        
        hop_length = 512
        chroma_bass = librosa.feature.chroma_cqt(y=y_b[:ml], sr=SR, hop_length=hop_length)
        
        final_chords = []
        for start, end, label in madmom_preds:
            if label == 'N': continue
            
            root_s = label.split(':')[0] if ':' in label else label
            clean_root = normalize_chord_name(root_s).replace('Bb','A#').replace('Eb','D#').replace('Ab','G#').replace('Db','C#').replace('Gb','F#')
            try: r_idx = lbls.index(clean_root)
            except: r_idx = 0
            
            s_frame = int(librosa.time_to_frames(start, sr=SR, hop_length=hop_length))
            e_frame = int(librosa.time_to_frames(end, sr=SR, hop_length=hop_length))
            seg_bass_chroma = np.median(chroma_bass[:, s_frame:e_frame+1], axis=1)
            
            s_sample = int(start * SR)
            e_sample = int(end * SR)
            y_b_seg = y_b[s_sample:e_sample]
            bass_energy = np.sqrt(np.mean(y_b_seg**2)) if len(y_b_seg) > 0 else 0
            
            b_idx = np.argmax(seg_bass_chroma)
            chord_str = label 
            
            if bass_energy > 0.02 and b_idx != r_idx and seg_bass_chroma[b_idx] > 0.70:
                interval = (b_idx - r_idx) % 12
                if interval in [3, 4, 7, 10, 11]:
                    chord_str += f"/{lbls[b_idx]}"
            
            final_chords.append({
                "time": float(round(start, 3)), 
                "end": float(round(end, 3)), 
                "chord": normalize_chord_name(chord_str, e_map)
            })
            
        if os.path.exists(mix_p):
            os.remove(mix_p)
            
        return final_chords, beats, global_key
    except Exception as e:
        logging.error(f"Engine V76.2 Failed: {e}")
        return [], [], "C"

def remix_audio(audio_path, stems_mode):
    if not audio_path: return [None]*10
    clear_vram()
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
    
    subprocess.run(["demucs", "-d", device, "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True)
    
    model_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
    v, d, b, o = [str(model_dir/f"{s}.wav") for s in ["vocals", "drums", "bass", "other"]]
    g = str(model_dir/"guitar.wav") if stems_mode == "6 Stems" else None
    p = str(model_dir/"piano.wav") if stems_mode == "6 Stems" else None
    
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="float16")
    
    segments_gen, _ = WHISPER_MODEL.transcribe(v, word_timestamps=True)
    segments = list(segments_gen)
    
    chord_data, beats, key = get_chords_v76_2(b, [o, g, p], d)
    
    sheet_text = f"SONG ANALYSIS REPORT\nKEY: {key}\n" + "="*30 + "\n\n"
    c_idx = 0
    for seg in segments:
        words = seg.words
        if not words: continue
        c_line, w_line = "", ""
        for w in words:
            active_chords = []
            while c_idx < len(chord_data) and chord_data[c_idx]['time'] < w.end:
                active_chords.append(chord_data[c_idx]['chord'])
                c_idx += 1
            
            w_text = w.word.strip()
            if active_chords:
                chord_str = "".join([f"[{c}]" for c in active_chords])
                c_line += chord_str.ljust(len(w_text) + 2)
                w_line += w_text + "  "
            else:
                c_line += " " * (len(w_text) + 2)
                w_line += w_text + "  "
        
        sheet_text += c_line.rstrip() + "\n" + w_line.strip() + "\n\n"

    zip_p = "/kaggle/working/Platinum_Results.zip"
    with zipfile.ZipFile(zip_p, 'w') as z:
        with open(model_dir/"chords.json", "w") as f: json.dump(chord_data, f, indent=2)
        z.write(model_dir/"chords.json", arcname="chords.json")
        with open(model_dir/"sheet.txt", "w") as f: f.write(sheet_text)
        z.write(model_dir/"sheet.txt", arcname="sheet.txt")

    clear_vram()
    return v, d, b, o, g, p, chord_data, {"beats": beats}, sheet_text, zip_p

with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
    gr.Markdown("# 🏆 Remix Lab V76.2 - Platinum Hybrid MIR")
    with gr.Row():
        audio_in = gr.Audio(type="filepath", label="Master Track (Source)")
        mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Decomposition Depth")
    
    btn = gr.Button("🔥 EXECUTE FULL ANALYSIS", variant="primary")
    
    with gr.Row():
        v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
    
    with gr.Row():
        c_json = gr.JSON(label="Validated Chord Timeline")
        b_json = gr.JSON(label="Beat Pulse Map")
        
    sheet_o = gr.Textbox(label="Musical Lead Sheet (Aligned)", lines=20)
    file_o = gr.File(label="Download Platinum Analysis Zip")

    btn.click(remix_audio, [audio_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o])

if __name__ == "__main__":
    interface.launch(share=True, debug=True)
