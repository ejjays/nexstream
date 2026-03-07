import sys
import subprocess

# This line uses the standard Kaggle pip environment and strictly does NOT downgrade anything.
subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "lameenc", "pretty_midi", "mir_eval", "resampy"])

# This line installs basic pitch without pulling older dependencies that break Kaggle's setup
subprocess.check_call([sys.executable, "-m", "pip", "install", "basic-pitch==0.4.0", "--no-deps"])

import gradio as gr
import shutil
import os
from pathlib import Path
import json
import librosa
import numpy as np
import torch
from scipy.ndimage import median_filter
from basic_pitch.inference import predict

OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 22050 

def get_chords_basic_pitch(bass_path, other_paths, drums_path):
    try:
        # --- 1. EXTRACT BEATS USING LIBROSA ---
        y_bass, _ = librosa.load(bass_path, sr=SR)
        y_drums, _ = librosa.load(drums_path, sr=SR)
        
        y_other = None
        for p in other_paths:
            if not p: continue
            y, _ = librosa.load(p, sr=SR)
            if y_other is None:
                y_other = y
            else:
                min_len = min(len(y_other), len(y))
                y_other = y_other[:min_len] + y[:min_len]
        
        # Combine stems so the beat tracker doesn't hallucinate during drumless intros
        min_len = min(len(y_drums), len(y_bass))
        if y_other is not None:
            min_len = min(min_len, len(y_other))
            y_beat = y_drums[:min_len] + (y_bass[:min_len] * 0.6) + (y_other[:min_len] * 0.4)
        else:
            y_beat = y_drums[:min_len] + (y_bass[:min_len] * 0.6)

        tempo_data, beat_frames = librosa.beat.beat_track(y=y_beat, sr=SR)
        tempo = float(tempo_data[0]) if isinstance(tempo_data, np.ndarray) else float(tempo_data)
        beat_times = librosa.frames_to_time(beat_frames, sr=SR)
        
        if len(beat_times) == 0:
            beat_times = np.arange(0, len(y_beat)/SR, 0.5)

        # --- 2. EXTRACT MIDI NOTES USING BASIC PITCH (Neural Network) ---
        print("Running Basic Pitch Neural Network on Stems...")
        
        bass_notes = []
        if os.path.exists(bass_path):
            _, midi_data_bass, _ = predict(bass_path)
            bass_notes = midi_data_bass.instruments[0].notes if len(midi_data_bass.instruments) > 0 else []

        other_notes = []
        for p in other_paths:
             if p and os.path.exists(p):
                 _, midi_data_other, _ = predict(p)
                 if len(midi_data_other.instruments) > 0:
                     other_notes.extend(midi_data_other.instruments[0].notes)

        # --- 3. QUANTIZE MIDI NOTES TO THE BEAT GRID ---
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        
        final_chords = []
        num_beats = len(beat_times)
        
        for i in range(num_beats):
            start = float(beat_times[i])
            end = float(beat_times[i+1]) if (i + 1) < num_beats else start + (60.0/tempo if tempo > 0 else 0.5)
            
            # We need to look at the actual note objects to get velocity/duration
            active_bass_notes = [n for n in bass_notes if not (n.end < start or n.start > end)]
            active_other_notes = [n for n in other_notes if not (n.end < start or n.start > end)]
            
            # Weight pitches by their amplitude/velocity and the duration they play during this beat
            pitch_weights_bass = {p: 0.0 for p in range(12)}
            for n in active_bass_notes:
                duration = min(n.end, end) - max(n.start, start)
                pitch_weights_bass[n.pitch % 12] += (n.velocity / 127.0) * duration
                
            pitch_weights_other = {p: 0.0 for p in range(12)}
            for n in active_other_notes:
                duration = min(n.end, end) - max(n.start, start)
                pitch_weights_other[n.pitch % 12] += (n.velocity / 127.0) * duration
            
            if sum(pitch_weights_bass.values()) == 0 and sum(pitch_weights_other.values()) == 0:
                chord_name = final_chords[-1]['chord'] if final_chords else "Empty"
            else:
                root_note = None
                
                # --- NEW LOGIC: DETERMINE THE MAIN CHORD INDEPENDENTLY FROM BASS ---
                # First, we identify the main chord being played by the 'other' instruments.
                root_note = None
                
                if sum(pitch_weights_other.values()) > 0:
                    root_note = max(pitch_weights_other, key=pitch_weights_other.get)
                elif sum(pitch_weights_bass.values()) > 0:
                    # Fallback to bass if there are literally no other instruments playing
                    root_note = max(pitch_weights_bass, key=pitch_weights_bass.get)
                else:
                    root_note = 0
                
                # Determine Major/Minor based on the harmony instruments
                is_minor = False
                minor_third = (root_note + 3) % 12
                major_third = (root_note + 4) % 12
                
                if pitch_weights_other[minor_third] > pitch_weights_other[major_third]:
                    is_minor = True
                elif pitch_weights_other[major_third] > pitch_weights_other[minor_third]:
                    is_minor = False
                else:
                    is_minor = False
                    
                base_chord = chord_labels[root_note]
                if is_minor:
                    base_chord += "m"
                    
                chord_name = base_chord
                
                # --- APPLY SLASH CHORD LOGIC ---
                # If the bass guitar is playing a distinct note from the root, it's a slash chord!
                if sum(pitch_weights_bass.values()) > 0:
                     bass_root = max(pitch_weights_bass, key=pitch_weights_bass.get)
                     # Only create a slash chord if the bass is NOT the root, and we actually detected a harmony root
                     if bass_root != root_note and sum(pitch_weights_other.values()) > 0:
                         interval = (bass_root - root_note) % 12
                         # Common valid bass intervals for pop/worship music (3rd, 5th, 7th)
                         if interval in {3, 4, 7, 10}:
                             chord_name = f"{chord_labels[root_note]}/{chord_labels[bass_root]}"

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

def remix_audio(audio_path, stems_mode):
    if not audio_path: return None, None, None, None, None, None, [], {"tempo": 0, "beats": []}
    if os.path.exists(OUTPUT_DIR): shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    if stems_mode == "4 Stems":
        model_name = "htdemucs_ft"
    else:
        model_name = "htdemucs_6s"

    command = [
        "demucs", "-d", device, "-n", model_name, 
        "--shifts", "5", "--overlap", "0.5", 
        audio_path, "-o", OUTPUT_DIR
    ]
    subprocess.run(command, check=True)

    filename = Path(audio_path).stem
    model_dir = Path(OUTPUT_DIR) / model_name / filename
    
    vocals = str(model_dir / "vocals.wav")
    drums = str(model_dir / "drums.wav")
    bass = str(model_dir / "bass.wav")
    other = str(model_dir / "other.wav")
    guitar = str(model_dir / "guitar.wav") if stems_mode == "6 Stems" else None
    piano = str(model_dir / "piano.wav") if stems_mode == "6 Stems" else None
    
    other_paths = [other, guitar, piano]
    
    chord_json, beat_json = get_chords_basic_pitch(bass, other_paths, drums)
    
    if not chord_json:
         chord_json = [{"time": 0, "chord": "Empty", "end": 999}]
         beat_json = {"tempo": 0, "beats": []}
    
    json_path = model_dir / "chords.json"
    with open(json_path, "w") as f:
        json.dump({"chords": chord_json, "beats": beat_json}, f, indent=4)
    
    return vocals, drums, bass, other, guitar, piano, chord_json, beat_json

with gr.Blocks() as interface:
    gr.Markdown("# Remix Lab AI (Ultra-Fidelity Basic-Pitch)")
    with gr.Row():
        audio_input = gr.Audio(type="filepath", label="Upload Audio")
        stems_radio = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Extraction Mode")
    with gr.Row():
        v_out = gr.Audio(label="Vocals")
        d_out = gr.Audio(label="Drums")
        b_out = gr.Audio(label="Bass")
        o_out = gr.Audio(label="Other")
        g_out = gr.Audio(label="Guitar")
        p_out = gr.Audio(label="Piano")
    with gr.Row():
        chord_out = gr.JSON(label="Chords")
        beat_out = gr.JSON(label="Beats")
    btn = gr.Button("Deep Analyze Song", variant="primary")
    btn.click(fn=remix_audio, inputs=[audio_input, stems_radio], outputs=[v_out, d_out, b_out, o_out, g_out, p_out, chord_out, beat_out], api_name="remix_audio")

interface.launch(share=True, debug=True)