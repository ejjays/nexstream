!pip install -U demucs gradio librosa numpy torch lameenc

import gradio as gr
import shutil
import os
import subprocess
from pathlib import Path
import json
import librosa
import numpy as np
import torch
from scipy.ndimage import median_filter

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 22050 

def get_chords_split_brain(bass_path, other_path, drums_path):
    try:
        y_bass, _ = librosa.load(bass_path, sr=SR)
        y_other, _ = librosa.load(other_path, sr=SR)
        y_drums, _ = librosa.load(drums_path, sr=SR)
        
        tempo_data, beat_frames = librosa.beat.beat_track(y=y_drums, sr=SR)
        tempo = float(tempo_data[0]) if isinstance(tempo_data, np.ndarray) else float(tempo_data)
        beat_times = librosa.frames_to_time(beat_frames, sr=SR)
        
        if len(beat_times) == 0:
            beat_times = np.arange(0, len(y_other)/SR, 0.5)
            beat_frames = librosa.time_to_frames(beat_times, sr=SR)
        
        # Start both CQTs at a 'C' note to ensure index 0 aligns with 'C' in our chord_labels
        chroma_bass = librosa.feature.chroma_cqt(y=y_bass, sr=SR, fmin=librosa.note_to_hz('C1'), n_octaves=3)
        chroma_other = librosa.feature.chroma_cqt(y=y_other, sr=SR, fmin=librosa.note_to_hz('C2'), n_octaves=6)
        
        bass_sync = librosa.util.sync(chroma_bass, beat_frames, aggregate=np.median)
        other_sync = librosa.util.sync(chroma_other, beat_frames, aggregate=np.median)
        
        # Calculate energy per beat to detect when instruments are actually playing
        bass_rms = librosa.feature.rms(y=y_bass, frame_length=2048, hop_length=512)
        bass_rms_sync = librosa.util.sync(bass_rms, beat_frames, aggregate=np.median).flatten()
        bass_threshold = np.max(bass_rms_sync) * 0.15 # 15% of max volume
        
        other_rms = librosa.feature.rms(y=y_other, frame_length=2048, hop_length=512)
        other_rms_sync = librosa.util.sync(other_rms, beat_frames, aggregate=np.median).flatten()
        other_threshold = np.max(other_rms_sync) * 0.05 # 5% of max volume
        
        # Smooth out the bass chromagram to prevent rapidly flickering bass notes
        bass_sync = median_filter(bass_sync, size=(1, 5))
        
        bass_sync = librosa.util.normalize(bass_sync, axis=0)
        other_sync = librosa.util.normalize(other_sync, axis=0)
        
        major = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
        minor = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        templates = []
        labels = []
        for i in range(12): 
            templates.append(np.roll(major, i)); labels.append(chord_labels[i])
        for i in range(12): 
            templates.append(np.roll(minor, i)); labels.append(chord_labels[i] + 'm')
        templates = np.array(templates)

        scores_other = np.dot(templates, other_sync)
        bass_roots = np.argmax(bass_sync, axis=0)
        
        final_scores = scores_other.copy()
        
        for t in range(final_scores.shape[1]):
            # If the bass is playing below our dynamic threshold, skip the bass weighting
            if bass_rms_sync[t] < bass_threshold:
                continue
                
            b_idx = bass_roots[t]
            for c_idx in range(24):
                chord_root = c_idx % 12
                is_minor = c_idx >= 12
                interval = (b_idx - chord_root) % 12
                
                if interval == 0:
                    final_scores[c_idx, t] += 0.6
                elif (not is_minor and interval == 4) or (is_minor and interval == 3):
                    final_scores[c_idx, t] += 0.3
                elif interval == 7:
                    final_scores[c_idx, t] += 0.3
        
        # Smooth out probabilities to prevent 1-beat rapid flickering
        final_scores = median_filter(final_scores, size=(1, 5))
        best_indices = np.argmax(final_scores, axis=0)
        
        # Handle completely silent sections by holding the last known chord
        for i in range(1, len(best_indices)):
            if other_rms_sync[i] < other_threshold and bass_rms_sync[i] < bass_threshold:
                best_indices[i] = best_indices[i-1]
        
        final_chords = []
        num_segments = min(len(best_indices), len(beat_times))
        
        for i in range(num_segments):
            idx = int(best_indices[i])
            start = float(beat_times[i])
            
            if (i + 1) < len(beat_times):
                end = float(beat_times[i+1])
            else:
                end = start + (60.0/tempo if tempo > 0 else 0.5)
            
            chord_name = labels[idx]
            
            # Slash Chord Logic
            if bass_rms_sync[i] >= bass_threshold:
                b_idx = bass_roots[i]
                c_root = idx % 12
                is_minor = idx >= 12
                
                if b_idx != c_root:
                    interval = (b_idx - c_root) % 12
                    valid_slash = False
                    
                    # Only allow common, musically pleasing inversions to prevent noise
                    if interval == 7: # 5th (e.g. C/G)
                        valid_slash = True
                    elif not is_minor and interval == 4: # Major 3rd (e.g. C/E)
                        valid_slash = True
                    elif is_minor and interval == 3: # Minor 3rd (e.g. Am/C)
                        valid_slash = True
                    elif interval == 10: # Minor 7th (e.g. Am/G)
                        valid_slash = True
                    elif interval == 2 or interval == 5: # 2nd or 4th pedal point (e.g. C/D or F/G)
                        valid_slash = True
                        
                    if valid_slash:
                        chord_name = f"{chord_name}/{chord_labels[b_idx]}"
            
            if final_chords and final_chords[-1]['chord'] == chord_name:
                final_chords[-1]['end'] = float(round(end, 3))
            else:
                final_chords.append({
                    "time": float(round(start, 3)),
                    "chord": chord_name,
                    "end": float(round(end, 3))
                })
        
        if final_chords: final_chords[0]['time'] = 0.0
            
        beat_times_list = [float(round(b, 3)) for b in beat_times]
        return final_chords, {"tempo": tempo, "beats": beat_times_list}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return [{"time": 0, "chord": "Error", "end": 10}], {"tempo": 0, "beats": []}

def remix_audio(audio_path):
    if not audio_path: return None, None, None, None, []
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    command = [
        "demucs", "-d", device, "-n", "htdemucs", "--mp3", "--mp3-bitrate", "256", audio_path, "-o", OUTPUT_DIR
    ]
    subprocess.run(command, check=True)

    filename = Path(audio_path).stem
    model_dir = Path(OUTPUT_DIR) / "htdemucs" / filename
    
    vocals = str(model_dir / "vocals.mp3")
    drums = str(model_dir / "drums.mp3")
    bass = str(model_dir / "bass.mp3")
    other = str(model_dir / "other.mp3")
    
    chord_json, beat_json = get_chords_split_brain(bass, other, drums)
    
    if not chord_json:
         chord_json = [{"time": 0, "chord": "Empty", "end": 999}]
         beat_json = {"tempo": 0, "beats": []}
    
    # Save chords to JSON file in Colab
    json_path = model_dir / "chords.json"
    with open(json_path, "w") as f:
        json.dump({"chords": chord_json, "beats": beat_json}, f, indent=4)
    
    return vocals, drums, bass, other, chord_json, beat_json

with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
    with gr.Row():
        v_out = gr.Audio(label="Vocals")
        d_out = gr.Audio(label="Drums")
        b_out = gr.Audio(label="Bass")
        o_out = gr.Audio(label="Other")
    with gr.Row():
        chord_out = gr.JSON(label="Chords")
        beat_out = gr.JSON(label="Beats")
    btn = gr.Button("Analyze Song", variant="primary")
    btn.click(fn=remix_audio, inputs=audio_input, outputs=[v_out, d_out, b_out, o_out, chord_out, beat_out], api_name="remix_audio")

interface.launch(share=True, debug=True)
