import sys
import subprocess
import os
import gc
import logging
import json
import re
import zipfile
import shutil
import socket
import types
import traceback
import urllib.request
from pathlib import Path
from scipy import signal
import numpy as np
import torch

if not hasattr(np, 'float'): np.float = float
if not hasattr(np, 'int'): np.int = int

logging.basicConfig(level=logging.INFO, format='%(asctime)s - BTC-TRANSFORMER - %(message)s')
OUTPUT_DIR = "/kaggle/working/separated"

POSSIBLE_REPO_PATHS = ["/kaggle/working/BTC_ISMIR2019", "/kaggle/working/BTC-ISMIR19"]
BTC_REPO_DIR = "/kaggle/working/BTC_ISMIR2019"
for p in POSSIBLE_REPO_PATHS:
    if os.path.exists(p):
        BTC_REPO_DIR = p
        break

os.makedirs(OUTPUT_DIR, exist_ok=True)
SR_MODEL = 22050
WHISPER_MODEL = None
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

if BTC_REPO_DIR not in sys.path:
    sys.path.append(BTC_REPO_DIR)

def bootstrap():
    if not os.path.exists(BTC_REPO_DIR):
        logging.info("Cloning BTC Repo...")
        subprocess.run(["git", "clone", "https://github.com/jayg996/BTC-ISMIR19.git", BTC_REPO_DIR])
    try:
        import madmom
    except ImportError:
        logging.info("Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "mir_eval", "demucs", "gradio", "faster-whisper"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/CPJKU/madmom.git"])
    weights_path = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
    os.makedirs(os.path.dirname(weights_path), exist_ok=True)
    if not os.path.exists(weights_path) or os.path.getsize(weights_path) < 1000000:
        url = "https://media.githubusercontent.com/media/jayg996/BTC-ISMIR19/master/test/btc_model_large_voca.pt"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(weights_path, 'wb') as out_file:
                shutil.copyfileobj(response, out_file)
        except Exception:
            fallback = "https://github.com/jayg996/BTC-ISMIR19/raw/master/test/btc_model_large_voca.pt"
            subprocess.run(["wget", "-O", weights_path, fallback])

bootstrap()

import gradio as gr
from faster_whisper import WhisperModel
import librosa
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor

BTC_MODEL = None
GLOBAL_MEAN = None
GLOBAL_STD = None

def load_btc_model():
    global BTC_MODEL, GLOBAL_MEAN, GLOBAL_STD
    if BTC_MODEL is None:
        try:
            from btc_model import BTC_model
        except ImportError:
            from btc_model import BTC as BTC_model
        config = {
            'feature_size': 144, 'hidden_size': 128, 'num_layers': 8, 'num_heads': 4,
            'total_key_depth': 128, 'total_value_depth': 128, 'filter_size': 128,
            'input_dropout': 0.1, 'layer_dropout': 0.1, 'attention_dropout': 0.1,
            'relu_dropout': 0.1, 'use_mask': True, 'probs_out': True,
            'num_chords': 170, 'timestep': 108, 'max_length': 108, 'large_voca': True
        }
        BTC_MODEL = BTC_model(config=config).to(DEVICE)
        weights = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
        checkpoint = torch.load(weights, map_location=DEVICE, weights_only=False)
        GLOBAL_MEAN = checkpoint['mean']
        GLOBAL_STD = checkpoint['std']
        if 'model' in checkpoint:
            BTC_MODEL.load_state_dict(checkpoint['model'])
        else:
            BTC_MODEL.load_state_dict(checkpoint)
        BTC_MODEL.eval()
        logging.info("💎 BTC TRANSFORMER READY.")

load_btc_model()

CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CHORD_QUALITIES = ['min', 'maj', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2', 'sus4']
VOCAB = {}
VOCAB[169] = 'N'
VOCAB[168] = 'X'
for i in range(168):
    root = CHORD_ROOTS[i // 14]
    quality = CHORD_QUALITIES[i % 14]
    VOCAB[i] = f"{root}:{quality}" if quality != 'maj' else root

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
    if chord in ['N', 'X', None]: return chord
    chord = chord.replace(':minmaj7', 'm(maj7)').replace(':maj7', 'maj7').replace(':min7', 'm7').replace(':maj6', '6').replace(':min6', 'm6').replace(':maj', '').replace(':min', 'm').replace(':hdim7', 'm7b5').replace(':', '')
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

def get_chords_btc(bass_p, acc_paths):
    try:
        y_b, _ = librosa.load(bass_p, sr=SR_MODEL)
        y_acc = None
        for p in acc_paths:
            if p and os.path.exists(p):
                y, _ = librosa.load(p, sr=SR_MODEL)
                if y_acc is None: y_acc = y
                else: 
                    ml = min(len(y_acc), len(y))
                    np.add(y_acc[:ml], y[:ml], out=y_acc[:ml])
        ml = min(len(y_b), len(y_acc) if y_acc is not None else len(y_b))
        y_mix = (y_acc[:ml] * 0.8) + (y_b[:ml] * 0.2)
        feature = librosa.cqt(y_mix, sr=SR_MODEL, n_bins=144, bins_per_octave=24, hop_length=2048)
        feature = np.log(np.abs(feature) + 1e-6).T
        feature = (feature - GLOBAL_MEAN) / GLOBAL_STD
        n_timestep = 108
        hop_time = 2048 / SR_MODEL
        num_pad = n_timestep - (feature.shape[0] % n_timestep)
        feature = np.pad(feature, ((0, num_pad), (0, 0)), mode="constant", constant_values=0)
        num_instance = feature.shape[0] // n_timestep
        predictions = []
        with torch.no_grad():
            feat_tensor = torch.tensor(feature, dtype=torch.float32).unsqueeze(0).to(DEVICE)
            for t in range(num_instance):
                sub_feat = feat_tensor[:, n_timestep * t:n_timestep * (t + 1), :]
                res = BTC_MODEL.self_attn_layers(sub_feat)
                attn_out = res[0] if isinstance(res, tuple) else res
                logits = BTC_MODEL.output_layer(attn_out)
                pred_out = logits[0] if isinstance(logits, tuple) else logits
                pred = torch.argmax(pred_out, dim=-1).squeeze().cpu().numpy()
                predictions.extend(pred)
        final_chords = []
        curr, start = None, 0
        for i, idx in enumerate(predictions):
            name = VOCAB.get(idx, "N")
            if name != curr:
                if curr and curr != "N":
                    final_chords.append({"time": start, "end": i * hop_time, "chord": curr})
                curr, start = name, i * hop_time
        if curr and curr != "N":
            final_chords.append({"time": start, "end": len(predictions) * hop_time, "chord": curr})
        lbls = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        chroma_mix = librosa.feature.chroma_cqt(y=y_mix, sr=SR_MODEL)
        global_key = lbls[np.argmax(np.mean(chroma_mix, axis=1))]
        e_map = get_enharmonic_map(global_key)
        for c in final_chords:
            c['chord'] = normalize_chord_name(c['chord'], e_map)
            c['time'] = round(c['time'], 3)
            c['end'] = round(c['end'], 3)
        return final_chords, global_key
    except Exception as e:
        logging.error(f"BTC Engine Failed: {e}")
        return [], "C"

def remix_audio_btc(audio_path, stems_mode):
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
    chord_data, key = get_chords_btc(b, [o, g, p])
    beat_activations = BEAT_FEAT(audio_path)
    beats = BEAT_DECODE(beat_activations).tolist()
    tempo = 120
    if len(beats) > 1:
        intervals = np.diff(beats)
        tempo = round(60 / np.median(intervals))
    sheet_text = f"BTC SOTA SONG REPORT\nKEY: {key}\nBPM: {tempo}\n" + "="*30 + "\n\n"
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
    zip_p = "/kaggle/working/BTC_Results.zip"
    with zipfile.ZipFile(zip_p, 'w') as z:
        with open(model_dir/"chords.json", "w") as f: json.dump(chord_data, f, indent=2)
        z.write(model_dir/"chords.json", arcname="chords.json")
        with open(model_dir/"sheet.txt", "w") as f: f.write(sheet_text)
        z.write(model_dir/"sheet.txt", arcname="sheet.txt")
    clear_vram()
    return v, d, b, o, g, p, chord_data, {"beats": beats, "tempo": tempo}, sheet_text, zip_p

with gr.Blocks(theme=gr.themes.Soft()) as interface:
    gr.Markdown("# 🚀 BTC Transformer Lab - SOTA Chord Recognition")
    with gr.Row():
        audio_in = gr.Audio(type="filepath", label="Master Track")
        mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Demux Detail")
    btn = gr.Button("💎 RUN TRANSFORMER ANALYSIS", variant="primary")
    with gr.Row():
        v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
    with gr.Row():
        c_json = gr.JSON(label="BTC Transformer Output")
        b_json = gr.JSON(label="Madmom Beat Pulse")
    sheet_o = gr.Textbox(label="Lead Sheet", lines=20)
    file_o = gr.File(label="Download BTC Results")
    btn.click(remix_audio_btc, [audio_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o], api_name="remix_audio")

if __name__ == "__main__":
    interface.launch(share=True, debug=True)
