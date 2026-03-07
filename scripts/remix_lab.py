import sys
import subprocess
subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "lameenc", "tensorflow", "basic-pitch"])

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
                
                if sum(pitch_weights_bass.values()) > 0:
                    root_note = max(pitch_weights_bass, key=pitch_weights_bass.get)
                else:
                    if sum(pitch_weights_other.values()) > 0:
                        root_note = max(pitch_weights_other, key=pitch_weights_other.get)
                    else:
                        root_note = 0
                
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
                
                if sum(pitch_weights_bass.values()) > 0 and sum(pitch_weights_other.values()) > 0:
                     bass_root = max(pitch_weights_bass, key=pitch_weights_bass.get)
                     if bass_root != root_note:
                         interval = (bass_root - root_note) % 12
                         if interval in [3, 4, 7, 10]:
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


Collecting demucs
  Using cached demucs-4.0.1.tar.gz (1.2 MB)
  Preparing metadata (setup.py): started
  Preparing metadata (setup.py): finished with status 'done'
Requirement already satisfied: gradio in /usr/local/lib/python3.12/dist-packages (5.50.0)
Collecting gradio
  Using cached gradio-6.9.0-py3-none-any.whl.metadata (16 kB)
Requirement already satisfied: librosa in /usr/local/lib/python3.12/dist-packages (0.11.0)
Requirement already satisfied: numpy in /usr/local/lib/python3.12/dist-packages (2.0.2)
Collecting numpy
  Using cached numpy-2.4.2-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (6.6 kB)
Requirement already satisfied: torch in /usr/local/lib/python3.12/dist-packages (2.9.0+cu126)
Collecting torch
  Using cached torch-2.10.0-cp312-cp312-manylinux_2_28_x86_64.whl.metadata (31 kB)
Collecting lameenc
  Using cached lameenc-1.8.1-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.manylinux_2_28_x86_64.whl.metadata (9.9 kB)
Collecting basic-pitch[all]
  Using cached basic_pitch-0.4.0-py2.py3-none-any.whl.metadata (12 kB)
Collecting dora-search (from demucs)
  Using cached dora_search-0.1.12.tar.gz (87 kB)
  Installing build dependencies: started
  Installing build dependencies: finished with status 'done'
  Getting requirements to build wheel: started
  Getting requirements to build wheel: finished with status 'done'
  Preparing metadata (pyproject.toml): started
  Preparing metadata (pyproject.toml): finished with status 'done'
Requirement already satisfied: einops in /usr/local/lib/python3.12/dist-packages (from demucs) (0.8.1)
Collecting julius>=0.2.3 (from demucs)
  Using cached julius-0.2.7.tar.gz (59 kB)
  Preparing metadata (setup.py): started
  Preparing metadata (setup.py): finished with status 'done'
Collecting openunmix (from demucs)
  Using cached openunmix-1.3.0-py3-none-any.whl.metadata (17 kB)
Requirement already satisfied: pyyaml in /usr/local/lib/python3.12/dist-packages (from demucs) (6.0.3)
Requirement already satisfied: torchaudio>=0.8 in /usr/local/lib/python3.12/dist-packages (from demucs) (2.9.0+cu126)
Requirement already satisfied: tqdm in /usr/local/lib/python3.12/dist-packages (from demucs) (4.67.1)
Requirement already satisfied: aiofiles<25.0,>=22.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (22.1.0)
Requirement already satisfied: anyio<5.0,>=3.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (4.12.1)
Requirement already satisfied: brotli>=1.1.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (1.2.0)
Requirement already satisfied: fastapi<1.0,>=0.115.2 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.123.10)
Requirement already satisfied: ffmpy in /usr/local/lib/python3.12/dist-packages (from gradio) (1.0.0)
Collecting gradio-client==2.3.0 (from gradio)
  Using cached gradio_client-2.3.0-py3-none-any.whl.metadata (7.1 kB)
Requirement already satisfied: groovy~=0.1 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.1.2)
Requirement already satisfied: httpx<1.0,>=0.24.1 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.28.1)
Requirement already satisfied: huggingface-hub<2.0,>=0.33.5 in /usr/local/lib/python3.12/dist-packages (from gradio) (1.4.1)
Requirement already satisfied: jinja2<4.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (3.1.6)
Requirement already satisfied: markupsafe<4.0,>=2.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (3.0.3)
Requirement already satisfied: orjson~=3.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (3.11.5)
Requirement already satisfied: packaging in /usr/local/lib/python3.12/dist-packages (from gradio) (25.0)
Requirement already satisfied: pandas<4.0,>=1.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (2.3.3)
Requirement already satisfied: pillow<13.0,>=8.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (11.3.0)
Requirement already satisfied: pydantic<=3.0,>=2.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (2.12.3)
Requirement already satisfied: pydub in /usr/local/lib/python3.12/dist-packages (from gradio) (0.25.1)
Requirement already satisfied: python-multipart>=0.0.18 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.0.21)
Requirement already satisfied: pytz>=2017.2 in /usr/local/lib/python3.12/dist-packages (from gradio) (2025.2)
Requirement already satisfied: safehttpx<0.2.0,>=0.1.7 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.1.7)
Requirement already satisfied: semantic-version~=2.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (2.10.0)
Requirement already satisfied: starlette<1.0,>=0.40.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.50.0)
Requirement already satisfied: tomlkit<0.14.0,>=0.12.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.13.3)
Requirement already satisfied: typer<1.0,>=0.12 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.21.1)
Requirement already satisfied: typing-extensions~=4.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (4.15.0)
Requirement already satisfied: uvicorn>=0.14.0 in /usr/local/lib/python3.12/dist-packages (from gradio) (0.40.0)
Requirement already satisfied: fsspec in /usr/local/lib/python3.12/dist-packages (from gradio-client==2.3.0->gradio) (2025.3.0)
Requirement already satisfied: audioread>=2.1.9 in /usr/local/lib/python3.12/dist-packages (from librosa) (3.1.0)
Requirement already satisfied: numba>=0.51.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (0.60.0)
Requirement already satisfied: scipy>=1.6.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.16.3)
Requirement already satisfied: scikit-learn>=1.1.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.6.1)
Requirement already satisfied: joblib>=1.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.5.3)
Requirement already satisfied: decorator>=4.3.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (4.4.2)
Requirement already satisfied: soundfile>=0.12.1 in /usr/local/lib/python3.12/dist-packages (from librosa) (0.13.1)
Requirement already satisfied: pooch>=1.1 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.8.2)
Requirement already satisfied: soxr>=0.3.2 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.0.0)
Requirement already satisfied: lazy_loader>=0.1 in /usr/local/lib/python3.12/dist-packages (from librosa) (0.4)
Requirement already satisfied: msgpack>=1.0 in /usr/local/lib/python3.12/dist-packages (from librosa) (1.1.2)
Requirement already satisfied: filelock in /usr/local/lib/python3.12/dist-packages (from torch) (3.20.3)
Requirement already satisfied: setuptools in /usr/local/lib/python3.12/dist-packages (from torch) (75.2.0)
Requirement already satisfied: sympy>=1.13.3 in /usr/local/lib/python3.12/dist-packages (from torch) (1.14.0)
Requirement already satisfied: networkx>=2.5.1 in /usr/local/lib/python3.12/dist-packages (from torch) (3.6.1)
Collecting cuda-bindings==12.9.4 (from torch)
  Using cached cuda_bindings-12.9.4-cp312-cp312-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (2.6 kB)
Collecting nvidia-cuda-nvrtc-cu12==12.8.93 (from torch)
  Using cached nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-cuda-runtime-cu12==12.8.90 (from torch)
  Using cached nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-cuda-cupti-cu12==12.8.90 (from torch)
  Using cached nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
Requirement already satisfied: nvidia-cudnn-cu12==9.10.2.21 in /usr/local/lib/python3.12/dist-packages (from torch) (9.10.2.21)
Collecting nvidia-cublas-cu12==12.8.4.1 (from torch)
  Using cached nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-cufft-cu12==11.3.3.83 (from torch)
  Using cached nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-curand-cu12==10.3.9.90 (from torch)
  Using cached nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-cusolver-cu12==11.7.3.90 (from torch)
  Using cached nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl.metadata (1.8 kB)
Collecting nvidia-cusparse-cu12==12.5.8.93 (from torch)
  Using cached nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.8 kB)
Requirement already satisfied: nvidia-cusparselt-cu12==0.7.1 in /usr/local/lib/python3.12/dist-packages (from torch) (0.7.1)
Requirement already satisfied: nvidia-nccl-cu12==2.27.5 in /usr/local/lib/python3.12/dist-packages (from torch) (2.27.5)
Collecting nvidia-nvshmem-cu12==3.4.5 (from torch)
  Using cached nvidia_nvshmem_cu12-3.4.5-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (2.1 kB)
Collecting nvidia-nvtx-cu12==12.8.90 (from torch)
  Using cached nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.8 kB)
Collecting nvidia-nvjitlink-cu12==12.8.93 (from torch)
  Using cached nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl.metadata (1.7 kB)
Collecting nvidia-cufile-cu12==1.13.1.3 (from torch)
  Using cached nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
Collecting triton==3.6.0 (from torch)
  Using cached triton-3.6.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (1.7 kB)
Requirement already satisfied: cuda-pathfinder~=1.1 in /usr/local/lib/python3.12/dist-packages (from cuda-bindings==12.9.4->torch) (1.3.3)
WARNING: basic-pitch 0.4.0 does not provide the extra 'all'
Collecting mir-eval>=0.6 (from basic-pitch[all])
  Using cached mir_eval-0.8.2-py3-none-any.whl.metadata (3.0 kB)
Collecting pretty-midi>=0.2.9 (from basic-pitch[all])
  Using cached pretty_midi-0.2.11.tar.gz (5.6 MB)
  Preparing metadata (setup.py): started
  Preparing metadata (setup.py): finished with status 'done'
Collecting resampy<0.4.3,>=0.2.2 (from basic-pitch[all])
  Using cached resampy-0.4.2-py3-none-any.whl.metadata (2.8 kB)
INFO: pip is looking at multiple versions of basic-pitch[all] to determine which version is compatible with other requirements. This could take a while.
Collecting basic-pitch[all]
  Using cached basic_pitch-0.3.3-py2.py3-none-any.whl.metadata (12 kB)
  Using cached basic_pitch-0.3.2-py2.py3-none-any.whl.metadata (12 kB)
  Using cached basic_pitch-0.3.1-py2.py3-none-any.whl.metadata (12 kB)
  Using cached basic-pitch-0.3.0.tar.gz (3.5 MB)
  Installing build dependencies: started
WARNING: basic-pitch 0.3.3 does not provide the extra 'all'
WARNING: basic-pitch 0.3.2 does not provide the extra 'all'
WARNING: basic-pitch 0.3.1 does not provide the extra 'all'
  Installing build dependencies: finished with status 'done'
  Getting requirements to build wheel: started
  Getting requirements to build wheel: finished with status 'done'
  Preparing metadata (pyproject.toml): started
  Preparing metadata (pyproject.toml): finished with status 'done'
  Using cached basic_pitch-0.2.6-py2.py3-none-any.whl.metadata (1.9 kB)
Collecting numpy
  Using cached numpy-1.23.5.tar.gz (10.7 MB)
WARNING: basic-pitch 0.3.0 does not provide the extra 'all'
WARNING: basic-pitch 0.2.6 does not provide the extra 'all'
  Installing build dependencies: started
  Installing build dependencies: finished with status 'done'
  Getting requirements to build wheel: started
  Getting requirements to build wheel: finished with status 'error'
  error: subprocess-exited-with-error
  
  × Getting requirements to build wheel did not run successfully.
  │ exit code: 1
  ╰─> See above for output.
  
  note: This error originates from a subprocess, and is likely not a problem with pip.
error: subprocess-exited-with-error

× Getting requirements to build wheel did not run successfully.
│ exit code: 1
╰─> See above for output.

note: This error originates from a subprocess, and is likely not a problem with pip.
---------------------------------------------------------------------------
CalledProcessError                        Traceback (most recent call last)
/tmp/ipykernel_147/621980202.py in <cell line: 0>()
      1 import sys
      2 import subprocess
----> 3 subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "demucs", "gradio", "librosa", "numpy", "torch", "lameenc", "basic-pitch[all]"])
      4 
      5 import gradio as gr

/usr/lib/python3.12/subprocess.py in check_call(*popenargs, **kwargs)
    411         if cmd is None:
    412             cmd = popenargs[0]
--> 413         raise CalledProcessError(retcode, cmd)
    414     return 0
    415 

CalledProcessError: Command '['/usr/bin/python3', '-m', 'pip', 'install', '-U', 'demucs', 'gradio', 'librosa', 'numpy', 'torch', 'lameenc', 'basic-pitch[all]']' returned non-zero exit status 1.