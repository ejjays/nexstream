import os
import asyncio
import nest_asyncio
import shutil
import uuid
import threading
from pathlib import Path
from engine.orchestrator import remix_audio_dual_gpu
from engine.config import API_PORT, BASE_DIR, logger, IS_KAGGLE

# task store
tasks = {}

# nitro engine
def launch():
    import gradio as gr
    from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware

    # apply patches
    nest_asyncio.apply()

    def create_ui():
        with gr.Blocks(theme=gr.themes.Monochrome()) as interface:
            gr.Markdown("# NexStream Nitro Lab")
            with gr.Row():
                audio_in = gr.Audio(type="filepath", label="Input")
                with gr.Column():
                    engine_in = gr.Radio(["Demucs (Fast / Balanced)", "BS-RoFormer (Ultra Quality)"], value="Demucs (Fast / Balanced)", label="Engine")
                    mode_in = gr.Radio(["4 Stems", "6 Stems"], value="4 Stems", label="Stems")
            
            btn = gr.Button("RUN ANALYSIS", variant="primary")
            with gr.Row(): v_o, d_o, b_o, o_o, g_o, p_o = [gr.Audio(label=x) for x in ["Vocals","Drums","Bass","Other","Guitar","Piano"]]
            c_json = gr.JSON(label="Chords")
            file_o = gr.File(label="Download package")
            
            b_json = gr.JSON(visible=False)
            sheet_o = gr.Textbox(visible=False)
            reason_o = gr.Textbox(visible=False)
            
            btn.click(remix_audio_dual_gpu, [audio_in, engine_in, mode_in], [v_o, d_o, b_o, o_o, g_o, p_o, c_json, b_json, sheet_o, file_o, reason_o])
        return interface

    ui = create_ui()
    
    # task worker
    def run_separation_task(task_id, temp_path, engine, stems):
        try:
            res = remix_audio_dual_gpu(str(temp_path), engine, stems)
            v, d, b, o, g, p, chords, beats, sheet, zip_p, reason = res
            tasks[task_id] = {
                "status": "success",
                "data": {
                    "status": "success",
                    "metadata": { "tempo": beats.get("tempo") if beats else 120, "chords": chords, "beats": beats.get("beats") if beats else [] },
                    "stems": { "vocals": v, "drums": d, "bass": b, "other": o, "guitar": g, "piano": p },
                    "package": zip_p
                }
            }
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            tasks[task_id] = {"status": "error", "message": str(e)}
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)

    # route handlers
    async def process_audio(background_tasks: BackgroundTasks, file: UploadFile = File(...), engine: str = Form("Demucs"), stems: str = Form("4 Stems")):
        task_id = str(uuid.uuid4())
        temp_path = BASE_DIR / f"temp_{task_id}_{file.filename}"
        with open(temp_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        
        tasks[task_id] = {"status": "processing"}
        background_tasks.add_task(run_separation_task, task_id, temp_path, engine, stems)
        
        return {"task_id": task_id, "status": "queued"}

    async def get_task_status(task_id: str):
        if task_id not in tasks:
            return JSONResponse({"status": "not_found"}, status_code=404)
        return tasks[task_id]

    async def download_file(path: str):
        if os.path.exists(path): return FileResponse(path)
        return JSONResponse({"error": "file not found"}, status_code=404)

    if IS_KAGGLE:
        logger.info("launching nitro on kaggle (shared mode)")
        
        import socket
        free_port = 7860
        for port in range(7870, 7890):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('localhost', port)) != 0:
                    free_port = port
                    break
        
        ui.launch(share=True, server_port=free_port, quiet=True, prevent_thread_lock=True)
        
        if hasattr(ui, 'app') and ui.app:
            ui.app.add_api_route("/process", process_audio, methods=["POST"])
            ui.app.add_api_route("/status/{task_id}", get_task_status, methods=["GET"])
            ui.app.add_api_route("/download", download_file, methods=["GET"])
            logger.info("Nitro Async API routes attached to Gradio tunnel")
        
        import time
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            ui.close()
    else:
        app = FastAPI(title="NexStream Nitro Engine")
        app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
        app.add_api_route("/process", process_audio, methods=["POST"])
        app.add_api_route("/status/{task_id}", get_task_status, methods=["GET"])
        app.add_api_route("/download", download_file, methods=["GET"])
        
        import uvicorn
        gr.mount_gradio_app(app, ui, path="/")
        uvicorn.run(app, host="0.0.0.0", port=API_PORT)

if __name__ == "__main__":
    launch()
