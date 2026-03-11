import sys
import subprocess
import os
import gc
import logging
import json
import re
import zipfile
from pathlib import Path
import numpy as np
import torch
if not hasattr(np, 'float'): np.float = float
if not hasattr(np, 'int'): np.int = int
import gradio as gr
from scipy import signal
logging.basicConfig(level=logging.INFO, format='%(asctime)s - MAX ACCURACY DUAL-T4 - %(message)s')
GPU_0 = "cuda:0" if torch.cuda.device_count() > 0 else "cpu"
GPU_1 = "cuda:1" if torch.cuda.device_count() > 1 else GPU_0
OUTPUT_DIR = "/kaggle/working/separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BTC_REPO_DIR = "/kaggle/working/BTC-ISMIR19"
def bootstrap():
    packages = ["transformers", "demucs", "gradio", "librosa", "scipy"]
    for pkg in packages:
        try:
            __import__(pkg)
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
    try:
        import madmom
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/CPJKU/madmom.git"])
    if not os.path.exists(BTC_REPO_DIR):
        logging.info("Downloading BTC-ISMIR19 repository directly to Kaggle...")
        subprocess.run(["git", "clone", "https://github.com/jayg996/BTC-ISMIR19.git", BTC_REPO_DIR], check=True)
    weights_path = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
    os.makedirs(os.path.dirname(weights_path), exist_ok=True)
    if not os.path.exists(weights_path) or os.path.getsize(weights_path) < 1000000:
        logging.info("Downloading BTC model weights (large_voca.pt)...")
        fallback_url = "https://github.com/jayg996/BTC-ISMIR19/raw/master/test/btc_model_large_voca.pt"
        subprocess.run(["wget", "-q", "-O", weights_path, fallback_url])
bootstrap()
import librosa
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
if BTC_REPO_DIR not in sys.path:
    sys.path.append(BTC_REPO_DIR)
BTC_MODEL = None
GLOBAL_MEAN = None
GLOBAL_STD = None
SR_MODEL = 22050
def load_btc_model():
    global BTC_MODEL, GLOBAL_MEAN, GLOBAL_STD
    if BTC_MODEL is None:
        try:
            from btc_model import BTC_model
        except ImportError:
            from btc_model import BTC as BTC_model
        config = {
            'feature_size': 144, 'hidden_size': 128, 'num_layers': 8, 'num_heads': 8,
            'total_key_depth': 128, 'total_value_depth': 128, 'filter_size': 128,
            'input_dropout': 0.1, 'layer_dropout': 0.1, 'attention_dropout': 0.1,
            'relu_dropout': 0.1, 'use_mask': True, 'probs_out': True,
            'num_chords': 170, 'timestep': 108, 'max_length': 108, 'large_voca': True
        }
        BTC_MODEL = BTC_model(config=config).to(GPU_1)
        weights = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
        if not os.path.exists(weights):
             logging.error("BTC Weights missing! Please run your sync_kaggle.sh or download weights.")
             return
        checkpoint = torch.load(weights, map_location=GPU_1, weights_only=False)
        GLOBAL_MEAN = checkpoint['mean']
        GLOBAL_STD = checkpoint['std']
        if 'model' in checkpoint:
            BTC_MODEL.load_state_dict(checkpoint['model'])
        else:
            BTC_MODEL.load_state_dict(checkpoint)
        BTC_MODEL.eval()
        logging.info("💎 BTC TRANSFORMER LOADED ON GPU 1.")
BEAT_FEAT = RNNBeatProcessor()
BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)
CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CHORD_QUALITIES = ['min', 'maj', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2', 'sus4']
VOCAB = {169: 'N', 168: 'X'}
for i in range(168):
    root = CHORD_ROOTS[i // 14]
    quality = CHORD_QUALITIES[i % 14]
    VOCAB[i] = f"{root}:{quality}" if quality != 'maj' else root
def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
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
def get_chords_btc_max_accuracy(master_audio_path, beats):
    load_btc_model()
    y, _ = librosa.load(master_audio_path, sr=SR_MODEL)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR_MODEL)
    global_key = CHORD_ROOTS[np.argmax(np.mean(chroma, axis=1))]
    e_map = get_enharmonic_map(global_key)
    feature = librosa.cqt(y, sr=SR_MODEL, n_bins=144, bins_per_octave=24, hop_length=2048)
    feature = np.log(np.abs(feature) + 1e-6).T
    feature = (feature - GLOBAL_MEAN) / GLOBAL_STD
    n_timestep = 108
    overlap = 4
    step = n_timestep // overlap
    num_pad = n_timestep - (feature.shape[0] % n_timestep)
    feature = np.pad(feature, ((0, num_pad + n_timestep), (0, 0)), mode="constant", constant_values=0)
    seq_len = feature.shape[0]
    logits_sum = np.zeros((seq_len, 170), dtype=np.float32)
    logits_count = np.zeros(seq_len, dtype=np.float32)
    with torch.no_grad():
        feat_tensor = torch.tensor(feature, dtype=torch.float32).unsqueeze(0).to(GPU_1)
        for start_idx in range(0, seq_len - n_timestep + 1, step):
            sub_feat = feat_tensor[:, start_idx:start_idx + n_timestep, :]
            res = BTC_MODEL.self_attn_layers(sub_feat)
            attn_out = res[0] if isinstance(res, tuple) else res
            logits = BTC_MODEL.output_layer(attn_out)
            pred_out = logits[0] if isinstance(logits, tuple) else logits
            logits_np = pred_out.squeeze(0).cpu().numpy()
            logits_sum[start_idx:start_idx + n_timestep] += logits_np
            logits_count[start_idx:start_idx + n_timestep] += 1
    avg_logits = logits_sum / np.maximum(logits_count[:, None], 1)
    valid_len = seq_len - num_pad - n_timestep
    avg_logits = avg_logits[:valid_len]
    hop_time = 2048 / SR_MODEL

    frame_to_time = {0: 0.0, valid_len: valid_len * hop_time}
    beat_frames = librosa.time_to_frames(beats, sr=SR_MODEL, hop_length=2048)
    for f, b in zip(beat_frames, beats):
        frame_idx = int(f)
        if frame_idx < valid_len:
            frame_to_time[frame_idx] = float(b)

    sorted_frames = sorted(list(frame_to_time.keys()))

    chord_data = []

    for i in range(len(sorted_frames)-1):
        f_s = sorted_frames[i]
        f_e = sorted_frames[i+1]

        if f_e <= f_s or f_s >= valid_len: continue

        segment_logits = avg_logits[f_s:f_e]
        if len(segment_logits) == 0: continue

        best_idx = np.argmax(np.mean(segment_logits, axis=0))
        raw_chord = VOCAB.get(best_idx, "N")

        if raw_chord not in ["N", "X"]:
            final_chord = normalize_chord_name(raw_chord, e_map)
        else:
            final_chord = "N"

        start_t = frame_to_time[f_s]
        end_t = frame_to_time[f_e]

        if chord_data and chord_data[-1]['chord'] == final_chord:
            chord_data[-1]['end'] = round(end_t, 3)
        else:
            if final_chord != "N":
                chord_data.append({"time": round(start_t, 3), "end": round(end_t, 3), "chord": final_chord})
    return chord_data
def remix_audio_dual_gpu(audio_path, stems_mode):
    if not audio_path: return [None]*10
    clear_vram()
    model_name = "htdemucs_ft" if stems_mode == "4 Stems" else "htdemucs_6s"
    logging.info(f"Starting Demucs Separation on {GPU_0}...")
    subprocess.run(["demucs", "-d", str(GPU_0), "-n", model_name, audio_path, "-o", OUTPUT_DIR], check=True)
    stem_dir = Path(OUTPUT_DIR) / model_name / Path(audio_path).stem
    v, d, b, o = [str(stem_dir/f"{s}.wav") for s in ["vocals", "drums", "bass", "other"]]
    g = str(stem_dir/"guitar.wav") if stems_mode == "6 Stems" and (stem_dir/"guitar.wav").exists() else None
    p = str(stem_dir/"piano.wav") if stems_mode == "6 Stems" and (stem_dir/"piano.wav").exists() else None
    logging.info(f"Starting Madmom Beat Tracking on {GPU_1}...")
    beat_activations = BEAT_FEAT(audio_path)
    beats = BEAT_DECODE(beat_activations).tolist()
    tempo = round(60 / np.median(np.diff(beats))) if len(beats) > 1 else 120
    logging.info(f"Starting MAX ACCURACY BTC Chord Recognition on {GPU_1}...")
    chord_data = get_chords_btc_max_accuracy(audio_path, beats)
    sheet_text = f"MAX ACCURACY DUAL-T4 REPORT\nBPM: {tempo}\n" + "="*30 + "\n\n"
    for c in chord_data:
        sheet_text += f"[{c['time']}s] {c['chord']}\n"
    zip_p = "/kaggle/working/Kaggle_Dual_T4_Max_Accuracy_Results.zip"
    with zipfile.ZipFile(zip_p, 'w') as z:
        chords_file = stem_dir/"chords.json"
        with open(chords_file, "w") as f: json.dump(chord_data, f, indent=2)
        z.write(chords_file, arcname="chords.json")
    clear_vram()
    return v, d, b, o, g, p, chord_data, {"beats": beats, "tempo": tempo}, sheet_text, zip_p
with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
    gr.Markdown("# 🚀 Kaggle Dual-T4 Max Accuracy Lab")
    gr.Markdown("**GPU 0:** Dedicated to HT-Demucs Separation.  \n**GPU 1:** Dedicated to BTC Transformer (Chords) & Madmom (Beats).")
    with gr.Row():
        audio_in = gr.Audio(type="filepath", label="Input Audio File")
        mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Separation Mode")
    btn = gr.Button("🔥 RUN MAX ACCURACY ANALYSIS", variant="primary")
    with gr.Row():
        v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
    with gr.Row():
        c_json = gr.JSON(label="BTC Chord Data")
        b_json = gr.JSON(label="Madmom Beat Data")
    sheet_o = gr.Textbox(label="Musical Timeline", lines=15)
    file_o = gr.File(label="Download Full Package (.zip)")
    btn.click(
        remix_audio_dual_gpu, 
        [audio_in, mode_in], 
        [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o], 
        api_name="remix_audio"
    )
if __name__ == "__main__":
    interface.launch(share=True, debug=True)