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

logging.basicConfig(level=logging.INFO, format='%(asctime)s - dual-t4 - %(message)s')

gpu0 = "cuda:0" if torch.cuda.device_count() > 0 else "cpu"
gpu1 = "cuda:1" if torch.cuda.device_count() > 1 else gpu0
out_dir = "/kaggle/working/separated"
os.makedirs(out_dir, exist_ok=True)
btc_path = "/kaggle/working/BTC-ISMIR19"

def bootstrap():
    pkgs = ["transformers", "demucs", "gradio", "librosa", "scipy"]
    for p in pkgs:
        try:
            __import__(p)
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", p])
    try:
        import madmom
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/CPJKU/madmom.git"])
    if not os.path.exists(btc_path):
        logging.info("cloning repo...")
        subprocess.run(["git", "clone", "https://github.com/jayg996/BTC-ISMIR19.git", btc_path], check=True)
    w_path = os.path.join(btc_path, "test/btc_model_large_voca.pt")
    os.makedirs(os.path.dirname(w_path), exist_ok=True)
    if not os.path.exists(w_path) or os.path.getsize(w_path) < 1000000:
        logging.info("getting weights...")
        url = "https://github.com/jayg996/BTC-ISMIR19/raw/master/test/btc_model_large_voca.pt"
        subprocess.run(["wget", "-q", "-O", w_path, url])

bootstrap()
import librosa
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
if btc_path not in sys.path:
    sys.path.append(btc_path)

model = None
mean = None
std = None
sr = 22050

def load_model():
    global model, mean, std
    if model is None:
        try:
            from btc_model import BTC_model
        except ImportError:
            from btc_model import BTC as BTC_model
        conf = {
            'feature_size': 144, 'hidden_size': 128, 'num_layers': 8, 'num_heads': 8,
            'total_key_depth': 128, 'total_value_depth': 128, 'filter_size': 128,
            'input_dropout': 0.1, 'layer_dropout': 0.1, 'attention_dropout': 0.1,
            'relu_dropout': 0.1, 'use_mask': True, 'probs_out': True,
            'num_chords': 170, 'timestep': 108, 'max_length': 108, 'large_voca': True
        }
        model = BTC_model(config=conf).to(gpu1)
        w = os.path.join(btc_path, "test/btc_model_large_voca.pt")
        if not os.path.exists(w):
             logging.error("weights missing")
             return
        ckpt = torch.load(w, map_location=gpu1, weights_only=False)
        mean = ckpt['mean']
        std = ckpt['std']
        if 'model' in ckpt:
            model.load_state_dict(ckpt['model'])
        else:
            model.load_state_dict(ckpt)
        model.eval()
        logging.info("btc loaded")

beat_feat = RNNBeatProcessor()
beat_decode = DBNBeatTrackingProcessor(fps=100)
roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
quals = ['min', 'maj', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2', 'sus4']
vocab = {169: 'N', 168: 'X'}
for i in range(168):
    r = roots[i // 14]
    q = quals[i % 14]
    vocab[i] = f"{r}:{q}" if q != 'maj' else r

def vram_fix():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def get_emap(key):
    flats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
    if key in flats:
        return {'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab'}
    return {'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#'}

def get_key_ks(chroma):
    c_sum = np.sum(chroma, axis=1)
    if np.sum(c_sum) == 0:
        return 'C' # silence
    m_prof = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    mi_prof = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    m_corrs = [np.corrcoef(c_sum, np.roll(m_prof, i))[0, 1] for i in range(12)]
    mi_corrs = [np.corrcoef(c_sum, np.roll(mi_prof, i))[0, 1] for i in range(12)]
    m_corrs = [0 if np.isnan(c) else c for c in m_corrs]
    mi_corrs = [0 if np.isnan(c) else c for c in mi_corrs]
    if max(m_corrs) > max(mi_corrs):
        return roots[m_corrs.index(max(m_corrs))]
    return roots[mi_corrs.index(max(mi_corrs))]

def norm_chord(chord, emap=None):
    if chord in ['N', 'X', None]: return chord
    chord = chord.replace(':minmaj7', 'm(maj7)').replace(':maj7', 'maj7').replace(':min7', 'm7').replace(':maj6', '6').replace(':min6', 'm6').replace(':maj', '').replace(':min', 'm').replace(':hdim7', 'm7b5').replace(':', '')
    pts = chord.split('/')
    r_pt = pts[0]
    b_pt = pts[1] if len(pts) > 1 else None
    def fix(s):
        m = re.match(r'^([A-G][b#]?)(.*)', s)
        if not m: return s
        root, sfx = m.groups()
        root = {'B#':'C', 'Cb':'B', 'Fb':'E', 'E#':'F'}.get(root, root)
        if emap: root = emap.get(root, root)
        return root + sfx
    res = fix(r_pt)
    if b_pt: res += f"/{fix(b_pt)}"
    return res

def get_chords_btc(audio, beats, tempo=120, bass_audio=None):
    load_model()
    y, _ = librosa.load(audio, sr=sr)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key = get_key_ks(chroma)
    emap = get_emap(key)
    f = librosa.cqt(y, sr=sr, n_bins=144, bins_per_octave=24, hop_length=2048)
    f = np.log(np.abs(f) + 1e-6).T
    f = (f - mean) / std
    
    b_chroma = None
    if bass_audio and os.path.exists(bass_audio):
        try:
            y_b, _ = librosa.load(bass_audio, sr=sr)
            b_chroma = librosa.feature.chroma_cqt(y=y_b, sr=sr, hop_length=2048, fmin=librosa.note_to_hz('C1'), n_octaves=4)
        except Exception as e:
            logging.warning(f"bass load failed: {e}")

    step = 108 // 4
    num_pad = 108 - (f.shape[0] % 108)
    f = np.pad(f, ((0, num_pad + 108), (0, 0)), mode="constant", constant_values=0)
    seq_len = f.shape[0]
    l_sum = np.zeros((seq_len, 170), dtype=np.float32)
    l_cnt = np.zeros(seq_len, dtype=np.float32)
    with torch.no_grad():
        t_f = torch.tensor(f, dtype=torch.float32).unsqueeze(0).to(gpu1)
        for i in range(0, seq_len - 108 + 1, step):
            sub = t_f[:, i:i + 108, :]
            res = model.self_attn_layers(sub)
            attn = res[0] if isinstance(res, tuple) else res
            logits = model.output_layer(attn)
            pred = logits[0] if isinstance(logits, tuple) else logits
            lnp = pred.squeeze(0).cpu().numpy()
            l_sum[i:i + 108] += lnp
            l_cnt[i:i + 108] += 1
    avg_l = l_sum / np.maximum(l_cnt[:, None], 1)
    v_len = seq_len - num_pad - 108
    avg_l = avg_l[:v_len]
    
    beat_f = librosa.time_to_frames(beats, sr=sr, hop_length=2048)
    f_map = {0: 0.0, v_len: v_len * (2048 / sr)}
    for f_idx, b_time in zip(beat_f, beats):
        idx = int(f_idx)
        if idx < v_len: f_map[idx] = float(b_time)

    frames = sorted(list(f_map.keys()))
    ch_data = []

    for i in range(len(frames)-1):
        s, e = frames[i], frames[i+1]
        if e <= s or s >= v_len: continue
        seg_l = avg_l[s:e]
        if len(seg_l) == 0: continue

        m_logits = np.mean(seg_l, axis=0)
        exp_l = np.exp(m_logits - np.max(m_logits))
        probs = exp_l / np.sum(exp_l)
        
        best = np.argmax(m_logits)
        raw = vocab.get(best, "N")
        conf = probs[best]

        if raw not in ["N", "X"]:
            # smart confidence check
            if conf < 0.70 and ':' in raw:
                r_pt, q_pt = raw.split(':')
                if q_pt in ['maj7', 'min7', 'sus4', 'sus2', 'maj6', 'min6', 'minmaj7', '7', 'hdim7']:
                    if q_pt in ['maj7', 'maj6', 'sus4', 'sus2', '7']: raw = f"{r_pt}:maj"
                    elif q_pt in ['min7', 'min6', 'minmaj7']: raw = f"{r_part}:min"
                    elif q_pt == 'hdim7': raw = f"{r_pt}:dim"
            
            final = norm_chord(raw, emap)
            if b_chroma is not None and e <= b_chroma.shape[1]:
                seg_b = b_chroma[:, s:e]
                if seg_b.shape[1] > 0:
                    b_idx = int(np.argmax(np.mean(seg_b, axis=1)))
                    b_note = roots[b_idx]
                    b_enh = emap.get(b_note, b_note)
                    r_root = raw.split(':')[0]
                    norm_root = emap.get(r_root, r_root)
                    if b_enh != norm_root: final = f"{final}/{b_enh}"
        else: final = "N"

        st, et = f_map[s], f_map[e]
        if ch_data and ch_data[-1]['chord'] == final:
            ch_data[-1]['end'] = round(et, 3)
        else:
            if final != "N": ch_data.append({"time": round(st, 3), "end": round(et, 3), "chord": final})

    # smoothing
    b_dur = 60.0 / max(tempo, 30)
    b_th = b_dur * 1.5 
    p_th = b_dur * 1.5

    for c in ch_data:
        dur = c['end'] - c['time']
        name = c['chord']
        if dur < b_th and '/' in name: name = name.split('/')[0]
        c['chord'] = name

    merged = []
    for c in ch_data:
        if merged and merged[-1]['chord'] == c['chord']: merged[-1]['end'] = c['end']
        else: merged.append(c)

    for c in merged:
        # flag passing chords
        c['is_passing'] = bool((c['end'] - c['time']) < p_th)
    return merged

def remix(audio, mode):
    if not audio: return [None]*10
    vram_fix()
    m_name = "htdemucs_ft" if mode == "4 Stems" else "htdemucs_6s"
    logging.info("separating...")
    subprocess.run(["demucs", "-d", str(gpu0), "-n", m_name, audio, "-o", out_dir], check=True)
    stem_dir = Path(out_dir) / m_name / Path(audio).stem
    v, d, b, o = [str(stem_dir/f"{s}.wav") for s in ["vocals", "drums", "bass", "other"]]
    g = str(stem_dir/"guitar.wav") if mode == "6 Stems" and (stem_dir/"guitar.wav").exists() else None
    p = str(stem_dir/"piano.wav") if mode == "6 Stems" and (stem_dir/"piano.wav").exists() else None
    logging.info("tracking beats...")
    act = beat_feat(audio)
    beats = beat_decode(act).tolist()
    tempo = round(60 / np.median(np.diff(beats))) if len(beats) > 1 else 120
    logging.info("recognizing chords...")
    chords = get_chords_btc(audio, beats, tempo=tempo, bass_audio=b)
    txt = f"dual-t4 report\nbpm: {tempo}\n" + "="*20 + "\n\n"
    for c in chords: txt += f"[{c['time']}s] {c['chord']}\n"
    zip_p = "/kaggle/working/results.zip"
    with zipfile.ZipFile(zip_p, 'w') as z:
        f = stem_dir/"chords.json"
        with open(f, "w") as j: json.dump(chords, j, indent=2)
        z.write(f, arcname="chords.json")
    vram_fix()
    return v, d, b, o, g, p, chords, {"beats": beats, "tempo": tempo}, txt, zip_p

with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
    gr.Markdown("# 🚀 dual-t4 accuracy lab")
    with gr.Row():
        audio_in = gr.Audio(type="filepath", label="audio")
        mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="mode")
    btn = gr.Button("run", variant="primary")
    with gr.Row():
        v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["vocals","drums","bass","other","guitar","piano"]]
    with gr.Row():
        c_j, b_j = gr.JSON(label="chords"), gr.JSON(label="beats")
    txt_o = gr.Textbox(label="timeline", lines=15)
    f_o = gr.File(label="zip")
    btn.click(remix, [audio_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_j, b_j, txt_o, f_o])

if __name__ == "__main__":
    interface.launch(share=True, debug=True)
