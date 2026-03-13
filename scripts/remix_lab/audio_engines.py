import torch
import numpy as np
import librosa
import concurrent.futures
from pathlib import Path
from remix_lab.config import GPU_1, SR_MODEL, logger
from remix_lab import model_manager
from remix_lab.theory_utils import CHORD_ROOTS

def extract_cqt_feature(audio_input):
    if isinstance(audio_input, str):
        y, _ = librosa.load(audio_input, sr=SR_MODEL)
    else:
        y = audio_input

    cqt_layer = model_manager.get_cqt_main()
    y_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(0).to(GPU_1)

    with torch.no_grad():
        cqt_out = cqt_layer(y_tensor).squeeze(0)
        feature_tensor = torch.log(cqt_out + 1e-6).T
        feature = feature_tensor.cpu().numpy()

    feature = (feature - model_manager.GLOBAL_MEAN) / model_manager.GLOBAL_STD
    return feature


def extract_bass_pitch_per_beat(bass_audio_path, beats, e_map):
    logger.info(f"[BASS ENGINE] Loading bass stem: {Path(bass_audio_path).name}")
    y_bass, _ = librosa.load(bass_audio_path, sr=SR_MODEL)
    
    logger.info("[BASS ENGINE] Running targeted CQT on low frequencies (C1-C4) via nnAudio...")
    cqt_layer = model_manager.get_cqt_bass()
    y_tensor = torch.tensor(y_bass, dtype=torch.float32).unsqueeze(0).to(GPU_1)
    with torch.no_grad():
        bass_cqt = cqt_layer(y_tensor).squeeze(0).cpu().numpy()
    
    bass_chroma = np.zeros((12, bass_cqt.shape[1]))
    for i in range(36):
        bass_chroma[i % 12, :] += bass_cqt[i, :]
        
    beat_frames = librosa.time_to_frames(beats, sr=SR_MODEL, hop_length=512)
    
    dominant_bass_notes = []
    
    for i in range(len(beats)-1):
        f_s = int(beat_frames[i])
        f_e = int(beat_frames[i+1])
        
        if f_e > f_s and f_s < bass_chroma.shape[1]:
            segment_chroma = np.mean(bass_chroma[:, f_s:f_e], axis=1)
            best_idx = np.argmax(segment_chroma)
            if segment_chroma[best_idx] > 0.05: 
                raw_note = CHORD_ROOTS[best_idx]
                final_note = e_map.get(raw_note, raw_note) if e_map else raw_note
                dominant_bass_notes.append(final_note)
            else:
                dominant_bass_notes.append(None)
        else:
            dominant_bass_notes.append(None)
            
    return dominant_bass_notes

def run_btc_batched_logits(audio_inputs, beats):
    batch_features = []
    max_len = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        batch_features = list(executor.map(extract_cqt_feature, audio_inputs))
        
    for feature in batch_features:
        if feature.shape[0] > max_len:
            max_len = feature.shape[0]
            
    n_timestep, overlap = 108, 4
    step = n_timestep // overlap
    num_pad = n_timestep - (max_len % n_timestep)
    padded_max_len = max_len + num_pad
    
    padded_features = []
    for f in batch_features:
        pad_amount = padded_max_len - f.shape[0]
        padded_f = np.pad(f, ((0, pad_amount), (0, 0)), mode="constant", constant_values=0)
        padded_features.append(padded_f)
        
    feat_tensor = torch.tensor(np.array(padded_features), dtype=torch.float32).to(GPU_1)
    batch_size = len(audio_inputs)
    seq_len = padded_max_len
    
    logits_sum = np.zeros((batch_size, seq_len, 170), dtype=np.float32)
    logits_count = np.zeros(seq_len, dtype=np.float32)
    
    with torch.no_grad():
        for start_idx in range(0, seq_len - n_timestep + 1, step):
            sub_feat = feat_tensor[:, start_idx:start_idx + n_timestep, :]
            
            dummy_labels = torch.zeros((batch_size, n_timestep), dtype=torch.long).to(GPU_1)
            
            logits = model_manager.BTC_MODEL(sub_feat, dummy_labels)
            
            pred_out = logits[0] if isinstance(logits, tuple) else logits
            
            logits_np = pred_out.cpu().numpy()
            logits_sum[:, start_idx:start_idx + n_timestep, :] += logits_np
            logits_count[start_idx:start_idx + n_timestep] += 1
            
    avg_logits = logits_sum / np.maximum(logits_count[None, :, None], 1)
    
    beat_frames = librosa.time_to_frames(beats, sr=SR_MODEL, hop_length=2048)
    
    beat_intervals = []
    for i in range(len(beats)-1):
        f_s = int(beat_frames[i])
        f_e = int(beat_frames[i+1])
        beat_intervals.append((f_s, f_e, float(beats[i]), float(beats[i+1])))
        
    n_intervals = len(beat_intervals)
    batch_segment_logits = np.zeros((batch_size, n_intervals, 170))
    batch_segment_energies = np.zeros((batch_size, n_intervals)) # Tracking silence
    times = []
    
    for i, (f_s, f_e, t_s, t_e) in enumerate(beat_intervals):
        for b in range(batch_size):
            valid_len_b = batch_features[b].shape[0]
            eff_f_s = min(f_s, valid_len_b - 1)
            eff_f_e = min(f_e, valid_len_b)
            
            if eff_f_e > eff_f_s:
                batch_segment_logits[b, i] = np.mean(avg_logits[b, eff_f_s:eff_f_e], axis=0)
                batch_segment_energies[b, i] = np.mean(batch_features[b][eff_f_s:eff_f_e])
            elif eff_f_s >= 0 and eff_f_s < valid_len_b:
                batch_segment_logits[b, i] = avg_logits[b, eff_f_s]
                batch_segment_energies[b, i] = np.mean(batch_features[b][eff_f_s])
            else:
                batch_segment_logits[b, i] = np.zeros(170)
                
        if len(times) < n_intervals:
            times.append((t_s, t_e))
            
    return batch_segment_logits, batch_segment_energies, times

def viterbi_decoding(beat_logits, transition_penalty=5.0):
    N, V = beat_logits.shape
    if N == 0: return []
    
    dp = np.zeros((N, V))
    ptr = np.zeros((N, V), dtype=int)
    
    dp[0] = beat_logits[0]
    
    for t in range(1, N):
        prev_max_idx = np.argmax(dp[t-1])
        prev_max_score = dp[t-1, prev_max_idx]
        
        stay_scores = dp[t-1]
        change_scores = prev_max_score - transition_penalty
        stay_mask = stay_scores >= change_scores
        
        dp[t] = np.where(stay_mask, stay_scores, change_scores) + beat_logits[t]
        ptr[t] = np.where(stay_mask, np.arange(V), prev_max_idx)
                
    path = np.zeros(N, dtype=int)
    path[-1] = np.argmax(dp[-1])
    for t in range(N-1, 0, -1):
        path[t-1] = ptr[t, path[t]]
        
    return path
