import sys
import subprocess
import os
import logging
from remix_lab.config import logger, BTC_REPO_DIR

def bootstrap():
    packages = ["demucs", "gradio", "librosa", "scipy", "soundfile", "nnAudio"]
    for pkg in packages:
        try:
            __import__(pkg)
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])
            
    try:
        import audio_separator
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "audio-separator[gpu]"])
    try:
        import madmom
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/CPJKU/madmom.git"])
    if not os.path.exists(BTC_REPO_DIR):
        logger.info("Downloading BTC-ISMIR19 repository directly to Kaggle...")
        subprocess.run(["git", "clone", "https://github.com/jayg996/BTC-ISMIR19.git", BTC_REPO_DIR], check=True)
    weights_path = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
    os.makedirs(os.path.dirname(weights_path), exist_ok=True)
    if not os.path.exists(weights_path) or os.path.getsize(weights_path) < 1000000:
        logger.info("Downloading BTC model weights (large_voca.pt)...")
        fallback_url = "https://github.com/jayg996/BTC-ISMIR19/raw/master/test/btc_model_large_voca.pt"
        subprocess.run(["wget", "-q", "-O", weights_path, fallback_url])
