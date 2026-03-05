# 1. Install Dependencies
!pip install -U demucs gradio librosa numpy torch lameenc

import gradio as gr
import shutil
import os
import subprocess
from pathlib import Path
import librosa
import numpy as np
import torch

# Define output directory
OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 44100

def get_chords(bass_path, other_path):
    """Analyzes chords using the high-quality 256k stems."""
    print(f"--- Step 2: Analyzing Chords ---")
    try:
        y_bass, sr = librosa.load(bass_path, sr=SR)
        y_other, _ = librosa.load(other_path, sr=SR)
        min_len = min(len(y_bass), len(y_other))
        y_bass, y_other = y_bass[:min_len], y_other[:min_len]

        def normalize_stem(stem):
            rms = np.sqrt(np.mean(stem**2))
            if rms < 0.005: return stem
            return stem / (rms + 1e-6) * 0.1

        y = (1.0 * normalize_stem(y_bass)) + (0.7 * normalize_stem(y_other))
        y_harmonic, _ = librosa.effects.hpss(y)
        chroma = librosa.feature.chroma_cens(y=y_harmonic, sr=sr)
        chroma = librosa.util.normalize(chroma, norm=2)
        chroma = librosa.decompose.nn_filter(chroma, aggregate=np.median, metric='euclidean', width=21)

        maj_template = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
        min_template = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        templates, labels = [], []
        for i in range(12):
            templates.append(np.roll(maj_template, i)); labels.append(chord_labels[i])
            templates.append(np.roll(min_template, i)); labels.append(chord_labels[i] + 'm')

        scores = np.dot(np.array(templates), chroma)
        best_indices = np.argmax(scores, axis=0)
        frame_time = librosa.frames_to_time(np.arange(len(best_indices)), sr=sr, hop_length=512)

        final_chords, current_chord, start_time = [], None, 0.0
        for i, idx in enumerate(best_indices):
            chord_name, time_point = labels[idx], max(0.0, float(frame_time[i]) - 0.4)
            if chord_name != current_chord:
                if current_chord:
                    final_chords.append({"time": round(start_time, 3), "chord": current_chord, "end": round(time_point, 3)})
                current_chord, start_time = chord_name, time_point
        return final_chords
    except Exception as e:
        print(f"Chord Error: {e}"); return []

def remix_audio(audio_path):
    if not audio_path: return None, None, None, None, []
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"--- Step 1: AI Separation (GPU) ---")

    # --mp3: Saves as MP3 directly
    # --mp3-bitrate 256: The Professional "Indistinguishable" Balance
    # -n htdemucs: Standard fast model
    command = [
        "demucs", 
        "-d", device, 
        "-n", "htdemucs", 
        "--mp3", 
        "--mp3-bitrate", "256", 
        audio_path, 
        "-o", OUTPUT_DIR
    ]
    subprocess.run(command, check=True)

    filename = Path(audio_path).stem
    model_dir = Path(OUTPUT_DIR) / "htdemucs" / filename
    
    vocals = model_dir / "vocals.mp3"
    drums = model_dir / "drums.mp3"
    bass = model_dir / "bass.mp3"
    other = model_dir / "other.mp3"
    
    chord_json = get_chords(str(bass), str(other))
    
    print(f"--- DONE! Sending to Frontend ---")
    return str(vocals), str(drums), str(bass), str(other), chord_json

# Setup the Gradio Interface
with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI - PRO BALANCE MODE (256kbps)")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
    with gr.Row():
        v_out = gr.Audio(label="Vocals")
        d_out = gr.Audio(label="Drums")
        b_out = gr.Audio(label="Bass")
        o_out = gr.Audio(label="Other")
    chord_out = gr.JSON(label="Chords")
    
    btn = gr.Button("Analyze Song", variant="primary")
    btn.click(fn=remix_audio, inputs=audio_input, outputs=[v_out, d_out, b_out, o_out, chord_out], api_name="remix_audio")

print("Starting Gradio server...")
interface.launch(share=True, debug=True)
