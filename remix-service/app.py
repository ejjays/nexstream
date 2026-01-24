import gradio as gr
import shutil
import os
import subprocess
from pathlib import Path
import librosa
import numpy as np

# Define output directory
OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
SR = 44100  # Strict 44.1kHz standard

def get_chords(bass_path, other_path):
    """
    High-Fidelity Chord Recognition.
    Combines Bass (Root) + Other (Harmony) for human-like accuracy.
    Uses Chroma CENS for robustness against timbre/noise.
    """
    print(f"Analyzing chords from stems: Bass + Other")
    try:
        # 1. Load Stems (Strict 44.1kHz)
        # Loading both gives us the full harmonic picture
        y_bass, sr = librosa.load(bass_path, sr=SR)
        y_other, _ = librosa.load(other_path, sr=SR)
        
        # Ensure lengths match
        min_len = min(len(y_bass), len(y_other))
        y_bass = y_bass[:min_len]
        y_other = y_other[:min_len]
        
        # MIXING STRATEGY: RMS Normalization
        # This ensures that if bass exists, it's strong enough to guide the root.
        # If bass is silent, normalization won't amplify noise (because we use a safe floor).
        def normalize_stem(stem):
            rms = np.sqrt(np.mean(stem**2))
            if rms < 0.005: return stem # Don't boost silence/noise
            return stem / (rms + 1e-6) * 0.1 # Normalize to standard level

        y_bass_norm = normalize_stem(y_bass)
        y_other_norm = normalize_stem(y_other)
        
        # Mix: Bass gets priority (1.0) to define Root, Other (0.7) fills quality.
        y = (1.0 * y_bass_norm) + (0.7 * y_other_norm)
        
        # 2. Harmonic-Percussive Source Separation (HPSS)
        y_harmonic, _ = librosa.effects.hpss(y)
        
        # 3. Compute Chroma CENS
        chroma = librosa.feature.chroma_cens(y=y_harmonic, sr=sr)
        
        # 4. Smart Smoothing & Sharpening
        # We pre-normalize to sharpen the difference between chords
        chroma = librosa.util.normalize(chroma, norm=2)
        
        # We use 'euclidean' metric instead of 'cosine' for harder edges (less blurry)
        # This helps stop "Am" ghosts appearing between C and D.
        chroma = librosa.decompose.nn_filter(chroma, aggregate=np.median, metric='euclidean', width=21)
        
        # 5. Define Chord Templates
        maj_template = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
        min_template = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]
        
        chord_labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        templates = []
        labels = []
        
        for i in range(12):
            templates.append(np.roll(maj_template, i))
            labels.append(chord_labels[i])
            templates.append(np.roll(min_template, i))
            labels.append(chord_labels[i] + 'm')
            
        templates = np.array(templates)
        
        # 6. Template Matching
        scores = np.dot(templates, chroma)
        best_chord_indices = np.argmax(scores, axis=0)
        
        # 7. Convert to Timeline (With Latency Correction)
        frame_time = librosa.frames_to_time(np.arange(len(best_chord_indices)), sr=sr, hop_length=512)
        
        # TIME OFFSET: Compensate for the lag caused by the smoothing window (approx 0.4s)
        TIME_OFFSET = -0.4
        
        raw_chords = []
        current_chord = None
        start_time = 0.0
        
        for i, idx in enumerate(best_chord_indices):
            chord_name = labels[idx]
            # Apply offset to fix "late" chords
            time_point = float(frame_time[i]) + TIME_OFFSET
            if time_point < 0: time_point = 0.0
            
            if chord_name != current_chord:
                if current_chord is not None:
                    raw_chords.append({
                        "start": start_time,
                        "end": time_point,
                        "chord": current_chord,
                        "duration": time_point - start_time
                    })
                current_chord = chord_name
                start_time = time_point
                
        # Append last chord
        if current_chord is not None:
             final_time = float(frame_time[-1]) + TIME_OFFSET
             raw_chords.append({
                "start": start_time,
                "end": final_time,
                "chord": current_chord,
                "duration": final_time - start_time
            })
            
        # 8. Post-Processing: Smart Merge
        # Merge extremely short glitches (< 0.4s) but preserve 1-beat chords
        final_chords = []
        if raw_chords:
            current = raw_chords[0]
            for next_chord in raw_chords[1:]:
                # If short, merge into current (Debounce increased to 0.8s)
                if next_chord['duration'] < 0.8:
                    current['end'] = next_chord['end']
                    current['duration'] += next_chord['duration']
                else:
                    final_chords.append({
                        "time": round(current['start'], 3),
                        "chord": current['chord'],
                        "end": round(current['end'], 3)
                    })
                    current = next_chord
            
            final_chords.append({
                "time": round(current['start'], 3),
                "chord": current['chord'],
                "end": round(current['end'], 3)
            })
            
        return final_chords
        
    except Exception as e:
        print(f"Librosa Chord Error: {e}")
        import traceback
        traceback.print_exc()
        return []

def remix_audio(audio_path):
    if not audio_path: return None, None, None, None, []
    
    # Clean up previous runs to save space
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"Processing: {audio_path}")
    
    # 1. Run Demucs (Stem Separation)
    # Using 'htdemucs_ft' (Fine-Tuned) for best quality
    command = ["demucs", "-n", "htdemucs_ft", audio_path, "-o", OUTPUT_DIR]
    try:
        subprocess.run(command, check=True)
    except Exception as e:
        print(f"Demucs Error: {e}")
        raise gr.Error("Separation failed. Please try a different file.")

    filename = Path(audio_path).stem
    # Handle Demucs output folder structure
    model_dir = None
    for root, dirs, files in os.walk(OUTPUT_DIR):
        if filename in dirs: 
            model_dir = Path(root) / filename
            break
            
    if not model_dir or not model_dir.exists():
        possible_dir = Path(OUTPUT_DIR) / "htdemucs_ft" / filename
        if possible_dir.exists():
            model_dir = possible_dir
        else:
             raise gr.Error("Output files not found.")

    vocals = model_dir / "vocals.wav"
    drums = model_dir / "drums.wav"
    bass = model_dir / "bass.wav"
    other = model_dir / "other.wav"
    
    # 2. Run Chord Analysis on Bass + Other stems
    print("Running Librosa Analysis (Bass + Other)...")
    chord_json = get_chords(str(bass), str(other))
    
    return str(vocals), str(drums), str(bass), str(other), chord_json

custom_css = """
footer {visibility: hidden}
.gradio-container {background-color: #0d0d0d}
"""

with gr.Blocks() as app:
    gr.Markdown("# 🎵 NexStream AI PRO")
    gr.Markdown("Deep Harmonic Analysis & Stem Separation")
    
    with gr.Row():
        inp = gr.Audio(type="filepath", label="Upload Song")
        btn = gr.Button("⚡ Start Analysis", variant="primary")
        
    with gr.Row():
        v = gr.Audio(label="Vocals")
        d = gr.Audio(label="Drums")
    with gr.Row():
        b = gr.Audio(label="Bass")
        o = gr.Audio(label="Instruments (Chords source)")
        
    out_chords = gr.JSON(label="Detected Chords (Timeline)")
    
    btn.click(fn=remix_audio, inputs=inp, outputs=[v, d, b, o, out_chords], api_name="remix_audio")

if __name__ == "__main__":
    app.launch(theme=gr.themes.Soft(primary_hue="purple"), css=custom_css)
