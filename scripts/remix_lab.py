import sys
import subprocess
import os
import gc
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

try:
    import madmom
except ImportError:
    logging.info("Installing Madmom...")
    subprocess.check_call(["apt-get", "update", "-y"])
    subprocess.check_call(["apt-get", "install", "-y", "libfftw3-dev", "libavcodec-dev", "libavformat-dev", "libswresample-dev"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "cython", "mido", "soundfile"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "git+https://github.com/CPJKU/madmom.git"])

subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "faster-whisper", "pretty_midi", "resampy<0.4.3"])

import gradio as gr
import shutil
from pathlib import Path
import json
import librosa
import numpy as np
import torch
from faster_whisper import WhisperModel
import re
import zipfile
import soundfile as sf
from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 22050 

WHISPER_MODEL = None

logging.info("MIR V64: Pre-loading Neural Models...")
CHORD_FEAT = CNNChordFeatureProcessor()
CHORD_DECODE = CRFChordRecognitionProcessor()
BEAT_FEAT = RNNBeatProcessor()
BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)

def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()

def normalize_chord_name(chord):
    if chord == 'N' or not chord: return chord
    base = chord.split('/')[0]
    suffix = ""
    if 'm7b5' in chord or 'hdim7' in chord: suffix = 'm7b5'; base = base.replace('m7b5', '').replace('hdim7', '')
    elif 'maj7' in chord: suffix = 'maj7'; base = base.replace('maj7', '')
    elif 'min7' in chord or 'm7' in chord: suffix = 'm7'; base = base.replace('min7', '').replace('m7', '')
    elif 'dim7' in chord: suffix = 'dim7'; base = base.replace('dim7', '')
    elif 'sus4' in chord: suffix = 'sus4'; base = base.replace('sus4', '')
    elif 'sus2' in chord: suffix = 'sus2'; base = base.replace('sus2', '')
    elif 'add9' in chord: suffix = 'add9'; base = base.replace('add9', '')
    elif 'min' in chord or 'm' in base: suffix = 'm'; base = base.replace('min', '').replace('m', '')
    elif '7' in chord: suffix = '7'; base = base.replace('7', '')
    elif 'dim' in chord: suffix = 'dim'; base = base.replace('dim', '')
    
    mapping = {'B#':'C', 'C##':'D', 'D##':'E', 'E#':'F', 'F##':'G', 'G##':'A', 'A##':'B', 'Db':'C#', 'Eb':'D#', 'Gb':'F#', 'Ab':'G#', 'Bb':'A#', 'Cb':'B', 'Fb':'E'}
    new_base = mapping.get(base, base)
    return new_base + suffix

def generate_aligned_chord_sheet(chords, vocals_path):
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        try: WHISPER_MODEL = WhisperModel("base", device=device, compute_type="float16")
        except: WHISPER_MODEL = WhisperModel("base", device=device, compute_type="int8")
    segments_gen, _ = WHISPER_MODEL.transcribe(vocals_path, word_timestamps=True, vad_filter=True)
    sheet, chord_idx = "", 0
    for segment in segments_gen:
        words = segment.words; current_line_words = []
        for w_idx, word in enumerate(words):
            current_line_words.append(word)
            pause = (w_idx < len(words) - 1 and words[w_idx+1].start - word.end > 1.2)
            if re.search(r'[.,;?!]', word.word) or pause or w_idx == len(words) - 1:
                line_start = current_line_words[0].start; gap_chords = []
                while chord_idx < len(chords) and chords[chord_idx]['time'] < line_start - 0.5:
                    c = chords[chord_idx]['chord']; gap_chords.append(c) if not gap_chords or gap_chords[-1] != c else None
                    chord_idx += 1
                if gap_chords: sheet += f"\n[Instrumental: {' - '.join(gap_chords)}]\n\n"
                c_line, l_line = "", ""
                for lw in current_line_words:
                    active = []
                    while chord_idx < len(chords) and chords[chord_idx]['time'] < lw.end:
                        active.append(chords[chord_idx]['chord']); chord_idx += 1
                    pos = len(l_line); clean = lw.word.lstrip(); pad = lw.word[:len(lw.word)-len(clean)]; l_line += pad + clean
                    if active:
                        c_str = "".join(f"<{c}>" for c in list(dict.fromkeys(active)))
                        c_line += (" " * max(0, pos + len(pad) - len(c_line))) + c_str
                sheet += c_line.rstrip() + "\n" + l_line.strip() + "\n\n"; current_line_words = []
    clear_vram()
    return sheet

def get_chords_v64_elite(bass_path, other_paths, drums_path):
    try:
        logging.info("MIR V64: Elite Neural-Harmonic Fusion...")
        y_b, _ = librosa.load(bass_path, sr=SR); y_d, _ = librosa.load(drums_path, sr=SR); y_o = None
        for p in other_paths:
            if not p or not os.path.exists(p): continue
            y, _ = librosa.load(p, sr=SR)
            if y_o is None: y_o = y
            else: ml = min(len(y_o), len(y)); np.add(y_o[:ml], y[:ml], out=y_o[:ml])
        
        ml = min(len(y_d), len(y_b), len(y_o))
        y_mix = np.add(y_o[:ml] * 1.6, y_b[:ml] * 0.4, out=np.empty(ml, dtype=np.float32))
        y_beat_mix = np.add(y_d[:ml], np.add(y_b[:ml] * 1.1, y_o[:ml] * 0.9, out=np.empty(ml, dtype=np.float32)), out=np.empty(ml, dtype=np.float32))
        
        tuning = librosa.estimate_tuning(y=y_mix, sr=SR)
        if abs(tuning) > 0.02:
            y_mix = librosa.effects.pitch_shift(y_mix, sr=SR, n_steps=-tuning)
            y_beat_mix = librosa.effects.pitch_shift(y_beat_mix, sr=SR, n_steps=-tuning)

        mix_p = os.path.join(OUTPUT_DIR, "v64_mix.wav"); beat_p = os.path.join(OUTPUT_DIR, "v64_beat.wav")
        sf.write(mix_p, y_mix, SR); sf.write(beat_p, y_beat_mix, SR)

        beats_list = BEAT_DECODE(BEAT_FEAT(beat_p)).tolist()
        if not beats_list: beats_list = np.arange(0, len(y_beat_mix)/SR, 0.5).tolist()
        
        chords_out = CHORD_DECODE(CHORD_FEAT(mix_p))
        chroma_o = librosa.decompose.nn_filter(librosa.feature.chroma_cqt(y=y_mix, sr=SR, bins_per_octave=24), aggregate=np.median, metric='cosine')
        chroma_b = librosa.decompose.nn_filter(librosa.feature.chroma_cqt(y=y_b, sr=SR, bins_per_octave=24), aggregate=np.median, metric='cosine')
        
        raw_list = []
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        for start, end, label in chords_out:
            if label == 'N': continue
            root_str, quality = label.split(':') if ':' in label else (label, 'maj')
            try: r_idx = chord_labels.index(normalize_chord_name(root_str))
            except: r_idx = 0
            
            f_s = librosa.time_to_frames(start, sr=SR); f_e = max(f_s+1, librosa.time_to_frames(end, sr=SR))
            win_o = np.mean(chroma_o[:, f_s:f_e], axis=1); win_b = np.mean(chroma_b[:, f_s:f_e], axis=1)
            
            bass_idx = np.argmax(win_b)
            if win_b[bass_idx] > 0.85 and bass_idx != r_idx:
                suffix_b = quality.replace('maj', '').replace('min', 'm')
                if win_o[r_idx] > 0.4: root_str = f"{chord_labels[r_idx]}{suffix_b}/{chord_labels[bass_idx]}"
                else: root_str = f"{chord_labels[bass_idx]}{suffix_b}"
            
            threshold = (win_o[r_idx] + win_o[(r_idx+7)%12]) / 2.0 * 0.75
            suffix = quality.replace('maj', '').replace('min', 'm')
            if quality == 'maj':
                if win_o[(r_idx + 11) % 12] > threshold: suffix = 'maj7'
                elif win_o[(r_idx + 10) % 12] > threshold: suffix = '7'
                elif win_o[(r_idx + 2) % 12] > threshold * 0.8: suffix = 'add9'
            elif quality == 'min':
                if win_o[(r_idx + 10) % 12] > threshold: suffix = 'm7'
                if win_o[(r_idx + 6) % 12] > threshold * 0.9: suffix = 'm7b5'
            elif quality == 'dim':
                if win_o[(r_idx + 9) % 12] > threshold: suffix = 'dim7'
            
            c_final = normalize_chord_name(root_str + (suffix if '/' not in root_str else ""))
            raw_list.append({"time": float(start), "end": float(end), "chord": c_final})

        merged = []
        if raw_list:
            curr = dict(raw_list[0])
            for i in range(1, len(raw_list)):
                if raw_list[i]['chord'] == curr['chord']: curr['end'] = raw_list[i]['end']
                else:
                    if (curr['end'] - curr['time']) >= 0.3: merged.append(curr); curr = dict(raw_list[i])
                    else: curr['chord'] = raw_list[i]['chord']; curr['end'] = raw_list[i]['end']
            merged.append(curr)

        snapped = []
        for c in merged:
            t1 = min(beats_list, key=lambda b: abs(b - c["time"])); t2 = min(beats_list, key=lambda b: abs(b - c["end"]))
            if t1 >= t2: idx = beats_list.index(t1); t2 = beats_list[idx+1] if idx+1 < len(beats_list) else t1 + 0.5
            snapped.append({"time": float(round(t1, 3)), "chord": c["chord"], "end": float(round(t2, 3)), "is_passing": (t2-t1) < 0.4})

        os.remove(mix_p); os.remove(beat_p); clear_vram()
        return snapped, {"tempo": 120.0, "beats": beats_list}, "C"
    except Exception as e:
        logging.error(f"V64 Failure: {e}")
        return [{"time": 0, "chord": "Error", "end": 10}], {"tempo": 0, "beats": []}, "C"

def remix_audio(audio_path, stems_mode):
    if not audio_path: return [None]*10
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"; model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
    subprocess.run(["demucs", "-d", device, "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True)
    clear_vram()
    model_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
    v, d, b, o = str(model_dir/"vocals.wav"), str(model_dir/"drums.wav"), str(model_dir/"bass.wav"), str(model_dir/"other.wav")
    g = str(model_dir/"guitar.wav") if stems_mode == "6 Stems" else None
    p = str(model_dir/"piano.wav") if stems_mode == "6 Stems" else None
    
    chord_json, beat_json, math_key = get_chords_v64_elite(b, [o, g, p], d)
    sheet_text = generate_aligned_chord_sheet(chord_json, v)
    
    zip_path = "/kaggle/working/analysis_results.zip"
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        with open(model_dir/"chords.json", "w") as f: json.dump({"chords": chord_json, "beats": beat_json}, f, indent=4)
        zipf.write(model_dir/"chords.json", arcname="chords.json")
        with open(model_dir/"sheet.txt", "w") as f: f.write(sheet_text)
        zipf.write(model_dir/"sheet.txt", arcname="sheet.txt")
    
    clear_vram()
    return v, d, b, o, g, p, chord_json, beat_json, sheet_text, zip_path

with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI - Platinum Master v64 (Sovereign Elite)")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
        stems_radio = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Mode")
    with gr.Row():
        v_out, d_out, b_out, o_out, g_out, p_out = [gr.Audio(label=l) for l in ["Vocals", "Drums", "Bass", "Other", "Guitar", "Piano"]]
    chord_out, beat_out, sheet_out = gr.JSON(label="Chords"), gr.JSON(label="Beats"), gr.Textbox(label="Sheet", lines=20)
    file_out = gr.File(label="Download Zip")
    btn = gr.Button("Analyze", variant="primary")
    btn.click(fn=remix_audio, inputs=[audio_input, stems_radio], outputs=[v_out, d_out, b_out, o_out, g_out, p_out, chord_out, beat_out, sheet_out, file_out])
interface.launch(share=True, debug=True)
