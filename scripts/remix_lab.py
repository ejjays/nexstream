import sys
import subprocess
import os

# PLATINUM MASTER V53 - THE PERFECT PITCH
subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "faster-whisper", "groq", "ddgs", "pretty_midi", "mir_eval", "resampy<0.4.3"])

import gradio as gr
import shutil
from pathlib import Path
import json
import librosa
import numpy as np
import torch
from faster_whisper import WhisperModel
import re
from groq import Groq
from ddgs import DDGS
from scipy.ndimage import median_filter
import zipfile

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 22050 

WHISPER_MODEL = None
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

def detect_global_key(y, sr):
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_avg = np.mean(chroma, axis=1)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        best_score, best_key = -1, "C"
        for i in range(12):
            rotated_major = np.roll(major_profile, i); rotated_minor = np.roll(minor_profile, i)
            s_maj = np.corrcoef(chroma_avg, rotated_major)[0, 1]; s_min = np.corrcoef(chroma_avg, rotated_minor)[0, 1]
            if s_maj > best_score: best_score = s_maj; best_key = chord_labels[i]
            if s_min > best_score: best_score = s_min; best_key = f"{chord_labels[i]}m"
        return best_key
    except: return "C"

def extract_chord_names(text):
    if not text: return []
    pattern = r'\b[A-G][#b]?(?:m|maj7|m7|7|sus2|sus4|dim|aug|add9)?\b'
    return list(set(re.findall(pattern, text)))

def fetch_ultimate_guitar_chords(query_text):
    try:
        query = f"site:ultimate-guitar.com \"{query_text}\" chords"
        with DDGS() as ddgs: results = list(ddgs.text(query, max_results=3))
        if results: return extract_chord_names(" ".join([r.get('body','') for r in results]))
        return []
    except: return []

def refine_chords_with_llm(raw_chord_sheet, raw_chords_json, filename, mathematical_key, model_dir):
    if not GROQ_API_KEY: return raw_chord_sheet, raw_chords_json
    try:
        client = Groq(api_key=GROQ_API_KEY)
        system_prompt = f"""You are a master music theorist.
Goal: Refine AI chord transcription into a professional sheet.
TRUTH: Detected Key is {mathematical_key}.
STRICT RULES:
1. PRESERVE Major/Minor qualities detected by AI. DO NOT convert Major chords to Minor.
2. If AI detected 'maj7', '7', or 'add9', keep them. They are likely correct.
3. Clean up formatting but do not over-simplify.
4. If the key is Major, avoid excessive Minor chords.
Format: ---SHEET--- [Song] <Lyrics/Chords> ---CORRECTION_MAP--- {{"RawChord":"RefinedChord"}} ---END---"""
        user_prompt = f"FILENAME: {filename}\nRAW SHEET:\n{raw_chord_sheet}"
        resp = client.chat.completions.create(messages=[{"role":"system","content":system_prompt},{"role":"user","content":user_prompt}], model="llama-3.3-70b-versatile", temperature=0.1).choices[0].message.content
        with open(model_dir / "llm_correction_debug.txt", "w") as f: f.write(resp)
        s_part = re.search(r'---SHEET---(.*?)---CORRECTION_MAP---', resp, re.DOTALL)
        m_part = re.search(r'---CORRECTION_MAP---(.*?)---END---', resp, re.DOTALL)
        mapping = json.loads(m_part.group(1).strip()) if m_part else {}
        refined_json = [{"time": c["time"], "chord": mapping.get(c["chord"], c["chord"]), "end": c["end"], "is_passing": c.get("is_passing", False)} for c in raw_chords_json]
        return s_part.group(1).strip() if s_part else raw_chord_sheet, refined_json
    except: return raw_chord_sheet, raw_chords_json

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
                    c = chords[chord_idx]['chord']
                    if not gap_chords or gap_chords[-1] != c: gap_chords.append(c)
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
    if torch.cuda.is_available(): torch.cuda.empty_cache()
    return sheet

def snap_to_beats(chords, beats):
    if not beats: return chords
    snapped = []
    for c in chords:
        t1 = min(beats, key=lambda b: abs(b - c["time"])); t2 = min(beats, key=lambda b: abs(b - c["end"]))
        if t1 >= t2:
            idx = beats.index(t1); t2 = beats[idx+1] if idx+1 < len(beats) else t1 + 0.5
        snapped.append({"time": float(round(t1, 3)), "chord": c["chord"], "end": float(round(t2, 3)), "is_passing": c.get("is_passing", False)})
    return snapped

def get_chords_v53(bass_path, other_paths, drums_path, web_chords):
    try:
        y_b, _ = librosa.load(bass_path, sr=SR); y_d, _ = librosa.load(drums_path, sr=SR); y_o = None
        for p in other_paths:
            if not p or not os.path.exists(p): continue
            y, _ = librosa.load(p, sr=SR)
            if y_o is None: y_o = y
            else: ml = min(len(y_o), len(y)); y_o = y_o[:ml] + y[:ml]
        ml = min(len(y_d), len(y_b), len(y_o)); y_key_mix = (y_o[:ml] * 1.6) + (y_b[:ml] * 0.4)
        
        # V53: Auto-Tuning Engine
        tuning = librosa.estimate_tuning(y=y_key_mix, sr=SR)
        print(f"MIR V53: Estimated tuning offset: {tuning:.2f} cents.")
        
        onset_env = librosa.onset.onset_strength(y=y_key_mix, sr=SR)
        spectral_onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, units='frames')
        
        chroma_raw = librosa.feature.chroma_cqt(y=y_key_mix, sr=SR, tuning=tuning, bins_per_octave=24)
        if chroma_raw.shape[0] != 12: chroma_raw = librosa.feature.chroma_cqt(y=y_key_mix, sr=SR, tuning=tuning, n_chroma=12)
        chroma = librosa.decompose.nn_filter(chroma_raw, aggregate=np.median, metric='cosine')
        chroma = median_filter(chroma, size=(1, 7))
        
        global_key = detect_global_key(y_key_mix, SR); y_beat = y_d[:ml] + (y_b[:ml] * 1.1) + (y_o[:ml] * 0.9)
        tempo_data, beat_frames = librosa.beat.beat_track(y=y_beat, sr=SR)
        if len(beat_frames) == 0: beat_frames = np.arange(0, chroma.shape[1], 20)
        tempo = float(tempo_data[0]) if isinstance(tempo_data, np.ndarray) else float(tempo_data)
        beat_times = librosa.frames_to_time(beat_frames, sr=SR); beats_list = [float(round(b, 3)) for b in beat_times]
        
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        times = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=SR)

        templates, names, roots, base_weights = [], [], [], []
        for i in range(12):
            chord_types = [
                ([i,(i+4)%12,(i+7)%12], "", 2.0), ([i,(i+3)%12,(i+7)%12], "m", 2.0),
                ([i,(i+4)%12,(i+7)%12,(i+10)%12], "7", 1.2), ([i,(i+4)%12,(i+7)%12,(i+11)%12], "maj7", 1.2),
                ([i,(i+3)%12,(i+7)%12,(i+10)%12], "m7", 1.2), ([i,(i+5)%12,(i+7)%12], "sus4", 1.1),
                ([i,(i+2)%12,(i+7)%12], "sus2", 1.1), ([i,(i+4)%12,(i+7)%12,(i+2)%12], "add9", 1.1)
            ]
            for notes, suffix, weight in chord_types:
                c_n = chord_labels[i] + suffix; t = np.zeros(12); t[notes] = 1.0
                templates.append(t); names.append(c_n); roots.append(i); base_weights.append(weight)
        
        templates = np.array(templates); templates /= np.sqrt(np.sum(templates**2, axis=1))[:, np.newaxis]
        n_templates, n_beats = len(templates), len(beat_times); obs_matrix = np.zeros((n_templates, n_beats))
        S_b = np.abs(librosa.stft(y_b, n_fft=2048)); f_b = librosa.fft_frequencies(sr=SR); l_m = f_b < 200

        print(f"MIR V53: Auto-Tuned Master Engine (Global Key: {global_key}).")
        
        chroma_diff = np.linalg.norm(np.diff(chroma, axis=1), axis=0)
        h_threshold = np.median(chroma_diff) * 1.5
        change_points = np.unique(np.concatenate([np.where(chroma_diff > h_threshold)[0], spectral_onsets, [chroma.shape[1]]]))
        change_points.sort()
        energy = np.sum(chroma, axis=0)

        m_p = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        n_p = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        major_intervals = [0, 2, 4, 5, 7, 9, 11]
        
        for i in range(n_beats):
            start = beat_times[i]; end = beat_times[i+1] if (i+1) < n_beats else start + 0.5
            mask = (times >= start) & (times < end)
            if not np.any(mask): win_chroma = np.zeros(12)
            else:
                f_idx = np.where(mask)[0][0]; cp_idx = np.searchsorted(change_points, f_idx)
                s_idx = change_points[cp_idx-1] if cp_idx > 0 else 0; e_idx = change_points[cp_idx]
                seg_chroma = chroma[:, s_idx:e_idx]; seg_energy = energy[s_idx:e_idx]
                if np.sum(seg_energy) > 0: win_chroma = np.average(seg_chroma, axis=1, weights=seg_energy)
                else: win_chroma = np.mean(seg_chroma, axis=1)

            v_norm = np.linalg.norm(win_chroma)
            if v_norm > 1e-6: win_chroma /= v_norm

            w_start = beat_times[max(0, i-4)]; w_end = beat_times[min(n_beats-1, i+4)]
            w_mask = (times >= w_start) & (times < w_end)
            if np.any(w_mask):
                w_chroma = np.mean(chroma[:, w_mask], axis=1)
                b_s, b_r, b_min = -1, 0, False
                for k in range(12):
                    sm = np.corrcoef(w_chroma, np.roll(m_p, k))[0,1]
                    sn = np.corrcoef(w_chroma, np.roll(n_p, k))[0,1]
                    if sm > b_s: b_s = sm; b_r = k; b_min = False
                    if sn > b_s: b_s = sn; b_r = k; b_min = True
                maj_root = b_r if not b_min else (b_r + 3) % 12
                local_scale = [(maj_root + it) % 12 for it in major_intervals]
                local_root_w = {j: 0.1 for j in range(12)}
                for r in [maj_root, (maj_root+5)%12, (maj_root+7)%12]: local_root_w[r] = 5.0
                for r in [(maj_root+2)%12, (maj_root+4)%12, (maj_root+9)%12]: local_root_w[r] = 2.5
            else: local_root_w = {j: 1.0 for j in range(12)}; maj_root = 0; local_scale = range(12)

            b_bias = np.ones(n_templates); idx_s = librosa.time_to_frames(start, sr=SR); idx_e = max(idx_s+1, librosa.time_to_frames(end, sr=SR))
            if idx_s < S_b.shape[1]:
                spec = np.sum(S_b[l_m, idx_s:idx_e], axis=1)
                if spec.size > 0 and np.max(spec) > 0.1:
                    f_max = f_b[l_m][np.argmax(spec)]
                    if f_max > 0:
                        b_n = int(round(librosa.hz_to_midi(f_max))) % 12
                        for k in range(n_templates): 
                            if roots[k] == b_n: b_bias[k] = 10.0

            scores = np.dot(templates, win_chroma)
            for k in range(n_templates):
                web_b = 1.2 if names[k] in web_chords else 1.0
                dom_b = 1.2 if roots[k] == (maj_root+7)%12 and ("7" in names[k]) else 1.0
                dia_b = 1.0 if roots[k] in local_scale else 0.5
                scores[k] *= local_root_w[roots[k]] * base_weights[k] * b_bias[k] * web_b * dom_b * dia_b
            probs = np.exp(12 * (scores - np.max(scores))); obs_matrix[:, i] = probs / np.sum(probs)

        p_stay = 0.3; transition_matrix = np.zeros((n_templates, n_templates))
        for i in range(n_templates):
            for j in range(n_templates):
                if i == j: continue
                ri, rj = roots[i], roots[j]; weight = 1.0
                if (rj - ri) % 12 in {5, 7}: weight = 3.0 
                elif (rj - ri) % 12 in {1, 2, 10, 11}: weight = 1.5
                transition_matrix[i, j] = weight
            row_sum = np.sum(transition_matrix[i, :])
            transition_matrix[i, :] = (transition_matrix[i, :] / row_sum) * (1.0 - p_stay); transition_matrix[i, i] = p_stay

        path = librosa.sequence.viterbi(obs_matrix, transition_matrix)
        raw_list = []
        for i in range(n_beats):
            idx = path[i]; start = beat_times[i]; end = beat_times[i+1] if (i+1) < n_beats else start + 0.5
            raw_list.append({"time": start, "end": end, "chord": names[idx], "root_idx": roots[idx]})
        
        merged = []
        if raw_list:
            curr = dict(raw_list[0])
            for i in range(1, len(raw_list)):
                if raw_list[i]['chord'] == curr['chord']: curr['end'] = raw_list[i]['end']
                else: merged.append(curr); curr = dict(raw_list[i])
            merged.append(curr)
        
        result = []
        for i in range(len(merged)):
            c = merged[i]; dur = c['end'] - c['time']; is_p = False
            if dur < 0.9 and 0 < i < len(merged)-1:
                def is_s(p,c,n): d1=(c-p)%12; d2=(n-c)%12; return (d1 in {1,2} and d2 in {1,2}) or (d1 in {10,11} and d2 in {10,11})
                if is_s(merged[i-1]['root_idx'], c['root_idx'], merged[i+1]['root_idx']): is_p = True
            if dur < 0.25: is_p = True
            result.append({"time": float(round(c['time'], 3)), "chord": c['chord'], "end": float(round(c['end'], 3)), "is_passing": is_p})
        return snap_to_beats(result, beats_list), {"tempo": tempo, "beats": beats_list}, global_key
    except Exception as e:
        print(f"MIR Error: {e}"); return [{"time": 0, "chord": "Error", "end": 10}], {"tempo": 0, "beats": []}, "C"

def remix_audio(audio_path, stems_mode):
    if not audio_path: return [None]*6 + [[], {"tempo": 0, "beats": []}, "", None]
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"; model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
    subprocess.run(["demucs", "-d", device, "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True)
    if torch.cuda.is_available(): torch.cuda.empty_cache() 
    model_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
    v, d, b, o = str(model_dir/"vocals.wav"), str(model_dir/"drums.wav"), str(model_dir/"bass.wav"), str(model_dir/"other.wav")
    g = str(model_dir/"guitar.wav") if stems_mode == "6 Stems" else None
    p = str(model_dir/"piano.wav") if stems_mode == "6 Stems" else None
    web_knowledge = fetch_ultimate_guitar_chords(Path(audio_path).stem.replace('_',' '))
    chord_json, beat_json, math_key = get_chords_v53(b, [o, g, p], d, web_knowledge)
    raw_sheet = generate_aligned_chord_sheet(chord_json, v)
    refined_sheet, refined_json = refine_chords_with_llm(raw_sheet, chord_json, Path(audio_path).name, math_key, model_dir)
    
    chords_path = model_dir / "chords.json"
    sheet_path = model_dir / "chord_sheet_refined.txt"
    timeline_path = model_dir / "chord_timeline_debug.txt"
    with open(chords_path, "w") as f: json.dump({"chords": refined_json, "beats": beat_json}, f, indent=4)
    with open(sheet_path, "w") as f: f.write(refined_sheet)
    with open(timeline_path, "w") as f:
        for c in refined_json: f.write(f"{c['time']:.3f}s - {c['end']:.3f}s | {c['chord']:<10} | {'[PASSING]' if c.get('is_passing') else '[STRUCTURAL]'}\n")
    
    zip_path = "/kaggle/working/analysis_results.zip"
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        zipf.write(chords_path, arcname="chords.json")
        zipf.write(sheet_path, arcname="chord_sheet.txt")
        zipf.write(timeline_path, arcname="timeline.txt")
    print(f"V53: Results archived to {zip_path}")

    return v, d, b, o, g, p, refined_json, beat_json, refined_sheet, zip_path

with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI - Platinum Master v53")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
        stems_radio = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Mode")
    with gr.Row():
        v_out, d_out, b_out, o_out, g_out, p_out = [gr.Audio(label=l) for l in ["Vocals", "Drums", "Bass", "Other", "Guitar", "Piano"]]
    chord_out, beat_out, sheet_out = gr.JSON(label="Chords"), gr.JSON(label="Beats"), gr.Textbox(label="Lyrics", lines=20)
    file_out = gr.File(label="Download Results Zip")
    btn = gr.Button("Analyze", variant="primary")
    btn.click(fn=remix_audio, inputs=[audio_input, stems_radio], outputs=[v_out, d_out, b_out, o_out, g_out, p_out, chord_out, beat_out, sheet_out, file_out])
interface.launch(share=True, debug=True)
