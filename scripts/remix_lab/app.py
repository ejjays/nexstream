import gradio as gr
from remix_lab.orchestrator import remix_audio_dual_gpu

def launch():
    with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
        gr.Markdown("# 🚀 Kaggle Dual-T4 Max Accuracy Lab (Math Viterbi Mode)")
        gr.Markdown("**Stage A:** Demucs Separation (GPU 0)  \n**Stage B:** Madmom Beats + BTC Transformer + Soft-Fusion Viterbi Decoding (GPU 1) - EXTREME SPEED.")
        with gr.Row():
            audio_in = gr.Audio(type="filepath", label="Input Audio File")
            mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Separation Mode")
        btn = gr.Button("🔥 RUN MAX ACCURACY ANALYSIS", variant="primary")
        with gr.Row(): v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
        with gr.Row():
            c_json = gr.JSON(label="BTC Chord Data")
            b_json = gr.JSON(label="Madmom Beat Data")
        with gr.Row():
            sheet_o = gr.Textbox(label="Musical Timeline", lines=15)
            reason_o = gr.Textbox(label="⚙️ Math/Viterbi Processing Log", lines=15)
        file_o = gr.File(label="Download Full Package (.zip)")
        btn.click(remix_audio_dual_gpu, [audio_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o, reason_o], api_name="remix_audio")
    
    interface.launch(share=True, debug=True)
