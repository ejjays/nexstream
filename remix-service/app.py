import gradio as gr
import subprocess
import os
from pathlib import Path

# Define output directory
OUTPUT_DIR = "separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def remix_audio(audio_path):
    if not audio_path:
        return None, None, None, None
    
    print(f"Processing: {audio_path}")
    
    # Run Demucs with High Quality Settings
    # --shifts=2: Reduces metallic artifacts by averaging multiple passes
    # -n htdemucs_ft: Uses the Fine-Tuned (cleanest) model
    # REMOVED "--two-stems=vocals" -> Now it defaults to 4 stems (Vocals, Drums, Bass, Other)
    command = [
        "demucs",
        "--shifts", "2",
        "-n", "htdemucs_ft",
        audio_path,
        "-o", OUTPUT_DIR
    ]
    
    try:
        # We use a long timeout because CPU processing can take a while
        subprocess.run(command, check=True)
    except Exception as e:
        print(f"Error: {e}")
        raise gr.Error("Separation failed. The file might be too long or corrupted.")

    # Find the output files
    filename = Path(audio_path).stem
    model_dir = Path(OUTPUT_DIR) / "htdemucs_ft" / filename
    
    # Demucs sometimes sanitizes filenames (removes spaces, etc)
    # If the direct path doesn't exist, we find the latest folder
    if not model_dir.exists():
        found_folders = list(Path(OUTPUT_DIR).glob("htdemucs_ft/*"))
        if found_folders:
            model_dir = max(found_folders, key=os.path.getmtime)
        else:
            raise gr.Error("Could not find processed files.")

    # Return 4 paths
    vocals = model_dir / "vocals.wav"
    drums = model_dir / "drums.wav"
    bass = model_dir / "bass.wav"
    other = model_dir / "other.wav"
    
    return str(vocals), str(drums), str(bass), str(other)

# Custom CSS for a beautiful NexStream look
custom_css = """
footer {visibility: hidden}
.gradio-container {background-color: #0f172a}
"""

with gr.Blocks(theme=gr.themes.Soft(primary_hue="purple"), css=custom_css) as app:
    gr.Markdown("# 🎵 NexStream Remix Lab")
    gr.Markdown("High-fidelity 4-track AI separation powered by Demucs.")
    
    with gr.Row():
        with gr.Column():
            inp = gr.Audio(type="filepath", label="Upload Song")
            btn = gr.Button("✨ Start Remixing", variant="primary")
        
    with gr.Row():
        out_vocals = gr.Audio(label="🎤 Vocals", type="filepath")
        out_drums = gr.Audio(label="🥁 Drums", type="filepath")
    
    with gr.Row():
        out_bass = gr.Audio(label="🎸 Bass", type="filepath")
        out_other = gr.Audio(label="🎹 Other Instruments", type="filepath")
    
    # Ensure api_name matches exactly what the React Frontend expects
    btn.click(
        fn=remix_audio, 
        inputs=inp, 
        outputs=[out_vocals, out_drums, out_bass, out_other], 
        api_name="remix_audio"
    )

if __name__ == "__main__":
    app.launch()
