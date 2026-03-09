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
from madmom.audio.chroma import DeepChromaProcessor
from madmom.features.chords import DeepChromaChordRecognitionProcessor
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
from madmom.processors import SequentialProcessor

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 22050 

WHISPER_MODEL = None

logging.info("MIR V72: Pre-loading Final Boss Deep Models...")
CHORD_EXTRACTOR = DeepChromaProcessor()
CHORD_DECODER = DeepChromaChordRecognitionProcessor()
CHORD_ENGINE = SequentialProcessor([CHORD_EXTRACTOR, CHORD_DECODER])
BEAT_FEAT = RNNBeatProcessor()
BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)

def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()

def get_enharmonic_map(key):
    flat_keys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
    if any(k in key for k in flat_keys):
        return {'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab'}
    return {'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#'}

def normalize_chord_name(chord, enharmonic_map=None):
    if chord == 'N' or not chord: return chord
    parts = chord.split('/')
    base_part = parts[0]
    bass_part = parts[1] if len(parts) > 1 else None
    
    def process_segment(s):
        if not s: return s
        root = s[0]
        if len(s) > 1 and s[1] in ['#', 'b']:
            root = s[:2]
            suffix = s[2:]
        else:
            suffix = s[1:]
        mapping = {'B#':'C', 'C##':'D', 'D##':'E', 'E#':'F', 'F##':'G', 'G##':'A', 'A##':'B', 'Cb':'B', 'Fb':'E'}
        root = mapping.get(root, root)
        if enharmonic_map:
            root = enharmonic_map.get(root, root)
        return root + suffix

    final_base = process_segment(base_part)
    if bass_part:
        return f"{final_base}/{process_segment(bass_part)}"
    return final_base

def generate_aligned_chord_sheet(chords, vocals_path):
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        try: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="float16")
        except: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="int8")
    segments_gen, _ = WHISPER_MODEL.transcribe(vocals_path, word_timestamps=True, vad_filter=True, language="tl")
    sheet, chord_idx = "", 0
    for segment in segments_gen:
        words = segment.words
        c_line, l_line = "", ""
        if words and chord_idx < len(chords) and chords[chord_idx]['time'] < words[0].start - 1.0:
            inst_chords = []
            while chord_idx < len(chords) and chords[chord_idx]['time'] < words[0].start - 0.5:
                inst_chords.append(chords[chord_idx]['chord'])
                chord_idx += 1
            if inst_chords: sheet += f"\n[Instrumental: {' - '.join(inst_chords)}]\n\n"
        for lw in words:
            active = []
            while chord_idx < len(chords) and chords[chord_idx]['time'] < lw.end:
                active.append(chords[chord_idx]['chord'])
                chord_idx += 1
            clean = lw.word.lstrip(); pad = " " * (len(lw.word) - len(clean))
            if active:
                c_str = "".join(f"<{c}>" for c in active)
                needed = len(l_line) + len(pad) - len(c_line)
                if needed > 0: c_line += " " * needed
                c_line += c_str
                if len(c_str) > len(clean): clean = clean.ljust(len(c_str))
            l_line += pad + clean
        if c_line.strip() or l_line.strip():
            sheet += c_line.rstrip() + "\n" + l_line.strip() + "\n\n"
    if chord_idx < len(chords):
        sheet += f"\n[Outro: {' - '.join([c['chord'] for c in chords[chord_idx:]])}]\n"
    clear_vram()
    return sheet

def get_chords_v72_universal(bass_path, other_paths, drums_path):
    try:
        logging.info("MIR V72: Universal Root & Quality Fusion...")
        y_b, _ = librosa.load(bass_path, sr=SR); y_d, _ = librosa.load(drums_path, sr=SR); y_o = None
        for p in other_paths:
            if not p or not os.path.exists(p): continue
            y, _ = librosa.load(p, sr=SR)
            if y_o is None: y_o = y
            else: ml = min(len(y_o), len(y)); np.add(y_o[:ml], y[:ml], out=y_o[:ml])
        ml = min(len(y_d), len(y_b), len(y_o) if y_o is not None else len(y_b))
        y_mix = np.add(y_o[:ml], y_b[:ml], out=np.empty(ml, dtype=np.float32)) if y_o is not None else y_b[:ml]
        y_beat_mix = np.add(y_d[:ml], np.add(y_b[:ml] * 1.1, (y_o[:ml] * 0.9 if y_o is not None else 0), out=np.empty(ml, dtype=np.float32)), out=np.empty(ml, dtype=np.float32))
        tuning = librosa.estimate_tuning(y=y_mix, sr=SR)
        if abs(tuning) > 0.02:
            y_mix = librosa.effects.pitch_shift(y_mix, sr=SR, n_steps=-tuning)
            y_beat_mix = librosa.effects.pitch_shift(y_beat_mix, sr=SR, n_steps=-tuning)
            y_b_t = librosa.effects.pitch_shift(y_b[:ml], sr=SR, n_steps=-tuning)
        else: y_b_t = y_b[:ml]
        mix_p = os.path.join(OUTPUT_DIR, "v72_mix.wav"); beat_p = os.path.join(OUTPUT_DIR, "v72_beat.wav")
        sf.write(mix_p, y_mix, SR); sf.write(beat_p, y_beat_mix, SR)
        beats_list = BEAT_DECODE(BEAT_FEAT(beat_p)).tolist()
        if not beats_list: beats_list = np.arange(0, len(y_beat_mix)/SR, 0.5).tolist()
        deep_chroma = CHORD_EXTRACTOR(mix_p); chords_out = CHORD_DECODER(deep_chroma); global_key = "C"
        try:
            c_avg = np.mean(librosa.feature.chroma_cqt(y=y_mix, sr=SR), axis=1)
            prof = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            lbls = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            best = -1
            for i in range(12):
                s = np.corrcoef(c_avg, np.roll(prof, i))[0, 1]
                if s > best: best = s; global_key = lbls[i]
        except: pass
        e_map = get_enharmonic_map(global_key)
        chroma_b = librosa.decompose.nn_filter(librosa.feature.chroma_cqt(y=y_b_t, sr=SR, bins_per_octave=24), aggregate=np.median, metric='cosine')
        raw_list = []
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        for start, end, label in chords_out:
            if label == 'N': continue
            root_s, qual = label.split(':') if ':' in label else (label, 'maj')
            try: r_idx = chord_labels.index(normalize_chord_name(root_s))
            except: r_idx = 0
            f_s_dc = int(start * 10); f_e_dc = max(f_s_dc+1, int(end * 10))
            f_s_lb = librosa.time_to_frames(start, sr=SR); f_e_lb = max(f_s_lb+1, librosa.time_to_frames(end, sr=SR))
            if f_s_dc < len(deep_chroma):
                win_c = np.mean(deep_chroma[f_s_dc:f_e_dc], axis=0); win_b = np.mean(chroma_b[:, f_s_lb:f_e_lb], axis=1)
                b_idx = np.argmax(win_b)
                if win_b[b_idx] > 0.85 and b_idx != r_idx:
                    s_b = qual.replace('maj', '').replace('min', 'm')
                    if win_c[r_idx] > 0.4: root_s = f"{chord_labels[r_idx]}{s_b}/{chord_labels[b_idx]}"
                    else: root_s = f"{chord_labels[b_idx]}{s_b}"
                thresh = (win_c[r_idx] + win_c[(r_idx+7)%12]) / 2.0 * 0.6
                sfx = qual.replace('maj', '').replace('min', 'm')
                if qual == 'maj':
                    if win_c[(r_idx + 11) % 12] > thresh: sfx = 'maj7'
                    elif win_c[(r_idx + 10) % 12] > thresh: sfx = '7'
                    elif win_c[(r_idx + 2) % 12] > thresh * 0.8: sfx = 'add9'
                elif qual == 'min':
                    if win_c[(r_idx + 10) % 12] > thresh: sfx = 'm7'
                    if win_c[(r_idx + 6) % 12] > thresh * 0.85: sfx = 'm7b5'
                raw_list.append({"time": float(start), "end": float(end), "chord": normalize_chord_name(root_s + (sfx if '/' not in root_s else ""), enharmonic_map=e_map)})
        merged = []
        if raw_list:
            curr = dict(raw_list[0])
            for i in range(1, len(raw_list)):
                if raw_list[i]['chord'] == curr['chord']: curr['end'] = raw_list[i]['end']
                else:
                    if (curr['end'] - curr['time']) >= 0.35: merged.append(curr); curr = dict(raw_list[i])
                    else: curr['chord'] = raw_list[i]['chord']; curr['end'] = raw_list[i]['end']
            merged.append(curr)
        snapped = []
        for c in merged:
            t1 = min(beats_list, key=lambda b: abs(b - c["time"])); t2 = min(beats_list, key=lambda b: abs(b - c["end"]))
            if t1 >= t2: idx = beats_list.index(t1); t2 = beats_list[idx+1] if idx+1 < len(beats_list) else t1 + 0.5
            snapped.append({"time": float(round(t1, 3)), "chord": c["chord"], "end": float(round(t2, 3)), "is_passing": (t2-t1) < 0.4})
        os.remove(mix_p); os.remove(beat_p); clear_vram()
        return snapped, {"tempo": 120.0, "beats": beats_list}, global_key
    except Exception as e:
        logging.error(f"V72 Failure: {e}"); return [{"time": 0, "chord": "Error", "end": 10}], {"tempo": 0, "beats": []}, "C"

def remix_audio(audio_path, stems_mode):
    if not audio_path: return [None]*10
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"; model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
    subprocess.run(["demucs", "-d", device, "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True); clear_vram()
    model_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
    v, d, b, o = str(model_dir/"vocals.wav"), str(model_dir/"drums.wav"), str(model_dir/"bass.wav"), str(model_dir/"other.wav")
    g = str(model_dir/"guitar.wav") if stems_mode == "6 Stems" else None
    p = str(model_dir/"piano.wav") if stems_mode == "6 Stems" else None
    chord_json, beat_json, _ = get_chords_v72_universal(b, [o, g, p], d)
    sheet_text = generate_aligned_chord_sheet(chord_json, v)
    zip_p = "/kaggle/working/analysis_results.zip"
    with zipfile.ZipFile(zip_p, 'w') as zipf:
        with open(model_dir/"chords.json", "w") as f: json.dump({"chords": chord_json, "beats": beat_json}, f, indent=4)
        zipf.write(model_dir/"chords.json", arcname="chords.json")
        with open(model_dir/"sheet.txt", "w") as f: f.write(sheet_text)
        zipf.write(model_dir/"sheet.txt", arcname="sheet.txt")
    clear_vram(); return v, d, b, o, g, p, chord_json, beat_json, sheet_text, zip_p

with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI - Platinum Master v72 (Universal Master)")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
        stems_radio = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Mode")
    with gr.Row():
        v_out, d_out, b_out, o_out, g_out, p_out = [gr.Audio(label=l) for l in ["Vocals", "Drums", "Bass", "Other", "Guitar", "Piano"]]
    chord_out, beat_out, sheet_out = gr.JSON(label="Neural Chords"), gr.JSON(label="Beats"), gr.Textbox(label="Sheet", lines=20)
    file_out = gr.File(label="Download Zip")
    btn = gr.Button("Analyze", variant="primary")
    btn.click(fn=remix_audio, inputs=[audio_input, stems_radio], outputs=[v_out, d_out, b_out, o_out, g_out, p_out, chord_out, beat_out, sheet_out, file_out])
interface.launch(share=True, debug=True)
