import gradio as gr
from engine.orchestrator import remix_audio_dual_gpu

import requests
import os

# setup gradio blocks
def launch():
    with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
        gr.Markdown("# Kaggle Dual-T4 Max Accuracy Lab (Math Viterbi Mode)")
        gr.Markdown("**Stage A:** Demucs Separation (GPU 0)  \n**Stage B:** Madmom Beats + BTC Transformer + Soft-Fusion Viterbi Decoding (GPU 1) - EXTREME SPEED.")
        
        # input controls
        with gr.Row():
            audio_in = gr.Audio(type="filepath", label="Input Audio File")
            with gr.Column():
                engine_in = gr.Radio(["Demucs (Fast / Balanced)", "BS-RoFormer (Ultra Quality)"], value="Demucs (Fast / Balanced)", label="Separation Engine")
                mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Stem Count (Demucs Only)")
        
        # execution trigger
        btn = gr.Button("RUN ACCURACY ANALYSIS", variant="primary")
        
        # output displays
        with gr.Row(): v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
        with gr.Row():
            c_json = gr.JSON(label="BTC Chord Data")
            b_json = gr.JSON(label="Madmom Beat Data")
        
        # detailed logs
        with gr.Row():
            sheet_o = gr.Textbox(label="Musical Timeline", lines=15)
            reason_o = gr.Textbox(label="⚙️ Math/Viterbi Processing Log", lines=15)
        
        # file download
        file_o = gr.File(label="Download Full Package (.zip)")
        
        # handle click
        btn.click(remix_audio_dual_gpu, [audio_in, engine_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o, reason_o], api_name="remix_audio")
    
    # start server
    _, _, share_url = interface.launch(share=True, debug=True)

    # auto-register link with backend
    backend_url = os.environ.get("BACKEND_URL")
    if backend_url:
        try:
            reg_url = f"{backend_url.rstrip('/')}/api/remix/register-engine"
            requests.post(reg_url, json={"url": share_url})
            print(f"✅ Registered engine with backend: {share_url}")
        except Exception as e:
            print(f"❌ Failed to register engine: {e}")
