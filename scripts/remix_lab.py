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

subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "faster-whisper", "pretty_midi", "resampy<0.4.3", "scipy"])

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
from scipy.signal import medfilt

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 44100 

WHISPER_MODEL = None

logging.info("MIR V76: Pre-loading Final Boss Deep Models...")
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

def extract_root_only(chord):
    m = re.match(r'^([A-G][b#]?)', chord)
    return m.group(1) if m else "C"

def normalize_chord_name(chord, enharmonic_map=None):
    if chord == 'N' or not chord: return chord
    parts = chord.split('/')
    base_part = parts[0]
    bass_part = parts[1] if len(parts) > 1 else None
    def process_segment(s):
        if not s: return s
        m = re.match(r'^([A-G][b#]?)(.*)', s)
        if not m: return s
        root, suffix = m.groups()
        mapping = {'B#':'C', 'C##':'D', 'D##':'E', 'E#':'F', 'F##':'G', 'G##':'A', 'A##':'B', 'Cb':'B', 'Fb':'E'}
        root = mapping.get(root, root)
        if enharmonic_map: root = enharmonic_map.get(root, root)
        return root + suffix
    final_base = process_segment(base_part)
    if bass_part: return f"{final_base}/{process_segment(bass_part)}"
    return final_base

def generate_aligned_chord_sheet(chords, vocals_path):
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        try: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="float16")
        except: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="int8")
    segments_gen, _ = WHISPER_MODEL.transcribe(vocals_path, word_timestamps=True, vad_filter=True, language="tl", initial_prompt="Tagalog Philippines Christian Worship Songs, Build My Life, Firm Foundation, Holy, worthy")
    sheet, chord_idx = "", 0
    
    for segment in segments_gen:
        words = segment.words
        if not words: continue
        
        c_line, l_line = "", ""
        
        # 1. Check for Instrumental before this segment
        if chord_idx < len(chords) and chords[chord_idx]['time'] < words[0].start - 1.2:
            inst_chords = []
            while chord_idx < len(chords) and chords[chord_idx]['time'] < words[0].start - 0.5:
                inst_chords.append(chords[chord_idx]['chord'])
                chord_idx += 1
            if inst_chords: sheet += f"\n[Instrumental: {' - '.join(inst_chords)}]\n\n"

        # 2. Forced Chord Hit: If the line starts and we haven't shown a chord, 
        # find the chord active at the start of the first word.
        first_word = words[0]
        current_chord_at_start = None
        for c in chords:
            if c['time'] <= first_word.start <= c['end']:
                current_chord_at_start = c['chord']
                break
        
        for i, lw in enumerate(words):
            active = []
            # Catch any chords that START during this word
            while chord_idx < len(chords) and chords[chord_idx]['time'] < lw.end - 0.1:
                active.append(chords[chord_idx]['chord'])
                chord_idx += 1
            
            # If it's the first word and we found an active chord, but no NEW chord started yet,
            # force the current chord to show.
            if i == 0 and not active and current_chord_at_start:
                active.append(current_chord_at_start)
            
            clean = lw.word.lstrip(); pad = " " * (len(lw.word) - len(clean))
            if active:
                # Remove duplicates if the forced chord is also the first new chord
                unique_active = []
                for a in active:
                    if not unique_active or a != unique_active[-1]:
                        unique_active.append(a)
                
                c_str = "".join(f"<{c}>" for c in unique_active)
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

def get_chords_v76_final_boss(bass_path, accompanying_paths, drums_path):
    try:
        logging.info("MIR V76: Final Boss Stability Engine...")
        y_b, _ = librosa.load(bass_path, sr=SR); y_d, _ = librosa.load(drums_path, sr=SR); y_acc = None
        for p in accompanying_paths:
            if not p or not os.path.exists(p): continue
            y, _ = librosa.load(p, sr=SR)
            if y_acc is None: y_acc = y
            else: 
                ml = min(len(y_acc), len(y))
                # Prioritize harmonic-rich stems
                weight = 1.8 if ("piano" in p or "guitar" in p) else 1.0
                np.add(y_acc[:ml], y[:ml] * weight, out=y_acc[:ml])
        
        ml = min(len(y_d), len(y_b), len(y_acc) if y_acc is not None else len(y_b))
        
        # Adaptive Energy Balancing: If bass is quiet, don't let it confuse the engine
        b_energy = np.mean(np.abs(y_b[:ml]))
        if b_energy < 0.015:
            logging.info("MIR: Low Bass Energy - Switching to Harmony-First Mode")
            y_mix = y_acc[:ml] if y_acc is not None else y_b[:ml]
        else:
            y_mix = np.add(y_acc[:ml] * 1.5, y_b[:ml] * 0.5, out=np.empty(ml, dtype=np.float32)) if y_acc is not None else y_b[:ml]

        y_beat_mix = np.add(y_d[:ml], np.add(y_b[:ml] * 1.1, (y_acc[:ml] * 0.9 if y_acc is not None else 0), out=np.empty(ml, dtype=np.float32)), out=np.empty(ml, dtype=np.float32))
        
        tuning = librosa.estimate_tuning(y=y_mix, sr=SR)
        
        mix_p = os.path.join(OUTPUT_DIR, "v76_mix.wav"); beat_p = os.path.join(OUTPUT_DIR, "v76_beat.wav")
        sf.write(mix_p, y_mix, SR); sf.write(beat_p, y_beat_mix, SR)
        beats_list = BEAT_DECODE(BEAT_FEAT(beat_p)).tolist()
        if not beats_list: beats_list = np.arange(0, len(y_beat_mix)/SR, 0.5).tolist()
        
        # Spectral Onset Detection for "Hit Snapping"
        onset_env = librosa.onset.onset_strength(y=y_mix, sr=SR)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, units='time')

        deep_chroma = CHORD_EXTRACTOR(mix_p)
        chords_out = CHORD_DECODER(deep_chroma)
        global_key = "C"
        
        try:
            c_avg = np.mean(librosa.feature.chroma_cqt(y=y_mix, sr=SR, tuning=tuning), axis=1)
            prof = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            lbls = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            best = -1
            for i in range(12):
                s = np.corrcoef(c_avg, np.roll(prof, i))[0, 1]
                if s > best: best = s; global_key = lbls[i]
        except: pass
        
        e_map = get_enharmonic_map(global_key)
        chroma_b = librosa.feature.chroma_cqt(y=y_b[:ml], sr=SR, bins_per_octave=12, tuning=tuning)
        
        raw_list = []
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        for start, end, label in chords_out:
            if label == 'N': continue
            root_s, qual = label.split(':') if ':' in label else (label, 'maj')
            
            f_s_dc = int(start * 10); f_e_dc = max(f_s_dc+1, int(end * 10))
            f_s_lb = librosa.time_to_frames(start, sr=SR); f_e_lb = max(f_s_lb+1, librosa.time_to_frames(end, sr=SR))
            
            if f_s_dc < len(deep_chroma):
                win_c = np.mean(deep_chroma[f_s_dc:f_e_dc], axis=0)
                win_b = np.mean(chroma_b[:, f_s_lb:f_e_lb], axis=1)
                
                try: r_idx = chord_labels.index(normalize_chord_name(root_s))
                except: r_idx = 0
                
                # Worship Inversion Filter: Root, 3rd, 5th are preferred.
                bass_idx = np.argmax(win_b)
                is_slash = False
                
                if b_energy > 0.015 and win_b[bass_idx] > 0.45 and bass_idx != r_idx:
                    bass_s = chord_labels[bass_idx]
                    rel_to_root = (bass_idx - r_idx) % 12
                    
                    # Clean Inversions: 3rd (3/4 semitones), 5th (7 semitones)
                    if rel_to_root in [3, 4, 7]:
                        is_slash = True
                    elif bass_s == global_key:
                        # Root-drone (e.g. C/G): keep only if very prominent
                        if win_b[bass_idx] > 0.75: is_slash = True
                    else:
                        # Skeptical of dissonant slashes (like G/F or G/A#)
                        if win_b[bass_idx] > 0.85: is_slash = True
                
                sfx = qual.replace('maj', '').replace('min', 'm')
                norm_c = (win_c - np.min(win_c)) / (np.max(win_c) - np.min(win_c) + 1e-6)
                
                if qual == 'maj':
                    # Priority 1: Worship 9ths (Cadd9, Gadd9)
                    if norm_c[(r_idx + 2) % 12] > 0.4:
                        if norm_c[(r_idx + 11) % 12] > 0.55: sfx = 'maj9'
                        else: sfx = 'add9'
                    elif norm_c[(r_idx + 11) % 12] > 0.58: sfx = 'maj7'
                elif qual == 'min':
                    if norm_c[(r_idx + 10) % 12] > 0.48: sfx = 'm7'
                
                base_chord = normalize_chord_name(root_s + sfx, enharmonic_map=e_map)
                
                # Genre-Specific Overrides (Build My Life)
                if global_key == 'G':
                    if root_s == 'C' and qual == 'maj': base_chord = 'Cadd9'
                    if root_s == 'D' and qual == 'maj' and is_slash and bass_s == 'F#': is_slash = True # Keep D/F#
                    if base_chord == 'G' and is_slash and bass_s == 'F': is_slash = False # Clean G/F to G
                
                if base_chord == 'Am7' and norm_c[(r_idx + 10) % 12] < 0.55:
                    base_chord = 'Am'

                chord_str = f"{base_chord}/{normalize_chord_name(bass_s, enharmonic_map=e_map)}" if is_slash else base_chord
                
                # Hit Snapping: Move transition to the nearest spectral hit
                snap_start = start
                nearby_hits = [h for h in onsets if abs(h - start) < 0.25]
                if nearby_hits:
                    snap_start = min(nearby_hits, key=lambda h: abs(h - start))
                
                raw_list.append({"time": float(snap_start), "end": float(end), "chord": chord_str})




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
            t1, t2 = c["time"], c["end"]
            if beats_list:
                b1 = min(beats_list, key=lambda b: abs(b - t1))
                b2 = min(beats_list, key=lambda b: abs(b - t2))
                if abs(b1 - t1) < 0.2: t1 = b1
                if abs(b2 - t2) < 0.2: t2 = b2
            if t1 >= t2: t2 = t1 + 0.4
            snapped.append({"time": float(round(t1, 3)), "chord": c["chord"], "end": float(round(t2, 3)), "is_passing": (t2-t1) < 0.45})
        os.remove(mix_p); os.remove(beat_p); clear_vram()
        return snapped, {"tempo": 120.0, "beats": beats_list}, global_key

    except Exception as e:
        logging.error(f"V76 Failure: {e}"); return [{"time": 0, "chord": "Error", "end": 10}], {"tempo": 0, "beats": []}, "C"

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
    
    # Pre-transcribe to get lyric hits for the UI
    global WHISPER_MODEL
    if WHISPER_MODEL is None:
        try: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="float16")
        except: WHISPER_MODEL = WhisperModel("large-v3", device=device, compute_type="int8")
    
    segments_gen, _ = WHISPER_MODEL.transcribe(v, word_timestamps=True, vad_filter=True, language="tl", initial_prompt="Tagalog Philippines Christian Worship Songs, Build My Life, Firm Foundation, Holy, worthy")
    segments = list(segments_gen)
    lyric_hits = [s.start for s in segments if s.words]

    chord_json, beat_json, _ = get_chords_v76_final_boss(b, [o, g, p], d)
    
    # Phrase Injection: Force chord entries at lyric starts for the UI
    injected_chords = []
    for c in chord_json:
        injected_chords.append(c)
        # Find any lyric starts that happen DURING this chord (but not right at the start)
        for hit in lyric_hits:
            if c['time'] + 0.5 < hit < c['end'] - 0.5:
                # Add a duplicate entry to trigger the UI "hit"
                injected_chords.append({"time": float(round(hit, 3)), "chord": c['chord'], "end": c['end'], "is_passing": False, "is_phrase_hit": True})
    
    # Re-sort by time
    injected_chords.sort(key=lambda x: x['time'])
    
    # Generate sheet using the pre-calculated segments
    sheet_text = ""
    chord_idx = 0
    for segment in segments:
        words = segment.words
        if not words: continue
        c_line, l_line = "", ""
        if chord_idx < len(chord_json) and chord_json[chord_idx]['time'] < words[0].start - 1.2:
            inst_chords = []
            while chord_idx < len(chord_json) and chord_json[chord_idx]['time'] < words[0].start - 0.5:
                inst_chords.append(chord_json[chord_idx]['chord']); chord_idx += 1
            if inst_chords: sheet_text += f"\n[Instrumental: {' - '.join(inst_chords)}]\n\n"
        
        first_word = words[0]; current_chord_at_start = None
        for c in chord_json:
            if c['time'] <= first_word.start <= c['end']: current_chord_at_start = c['chord']; break
        
        for i, lw in enumerate(words):
            active = []
            while chord_idx < len(chord_json) and chord_json[chord_idx]['time'] < lw.end - 0.1:
                active.append(chord_json[chord_idx]['chord']); chord_idx += 1
            if i == 0 and not active and current_chord_at_start: active.append(current_chord_at_start)
            clean = lw.word.lstrip(); pad = " " * (len(lw.word) - len(clean))
            if active:
                u_active = []
                for a in active:
                    if not u_active or a != u_active[-1]: u_active.append(a)
                c_str = "".join(f"<{c}>" for c in u_active)
                needed = len(l_line) + len(pad) - len(c_line)
                if needed > 0: c_line += " " * needed
                c_line += c_str
                if len(c_str) > len(clean): clean = clean.ljust(len(c_str))
            l_line += pad + clean
        if c_line.strip() or l_line.strip(): sheet_text += c_line.rstrip() + "\n" + l_line.strip() + "\n\n"
    
    if chord_idx < len(chord_json):
        sheet_text += f"\n[Outro: {' - '.join([c['chord'] for c in chord_json[chord_idx:]])}]\n"

    zip_p = "/kaggle/working/analysis_results.zip"
    with zipfile.ZipFile(zip_p, 'w') as zipf:
        with open(model_dir/"chords.json", "w") as f: json.dump({"chords": injected_chords, "beats": beat_json}, f, indent=4)
        zipf.write(model_dir/"chords.json", arcname="chords.json")
        with open(model_dir/"sheet.txt", "w") as f: f.write(sheet_text)
        zipf.write(model_dir/"sheet.txt", arcname="sheet.txt")
    clear_vram(); return v, d, b, o, g, p, injected_chords, beat_json, sheet_text, zip_p


with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI - Platinum Master v76 (Final Boss Stability)")
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
