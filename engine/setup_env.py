import sys
import subprocess
import os
import logging
from engine.config import logger, BTC_REPO_DIR

# install pkgs
def bootstrap():
    # upgrade tools
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--upgrade", "pip"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "websockets>=15.0.1"])

    # nitro stack
    packages = [
        "psutil",
        "gradio>=5.0.0",
        "huggingface_hub",
        "demucs",
        "librosa",
        "scipy",
        "soundfile",
        "nnAudio",
        "fastapi",
        "uvicorn",
        "nest_asyncio"
    ]
    
    # clear modules
    for mod in list(sys.modules.keys()):
        if any(x in mod for x in ['gradio', 'websockets', 'huggingface_hub']):
            del sys.modules[mod]

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
    
    # clone repo
    if not os.path.exists(BTC_REPO_DIR):
        logger.info("Downloading BTC-ISMIR19 repository directly to Kaggle...")
        subprocess.run(["git", "clone", "https://github.com/jayg996/BTC-ISMIR19.git", BTC_REPO_DIR], check=True)
    
    # refresh modules
    import importlib
    importlib.invalidate_caches()
    
    # download weights
    weights_path = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
    os.makedirs(os.path.dirname(weights_path), exist_ok=True)
    if not os.path.exists(weights_path) or os.path.getsize(weights_path) < 1000000:
        logger.info("Downloading BTC model weights (large_voca.pt)...")
        fallback_url = "https://github.com/jayg996/BTC-ISMIR19/raw/master/test/btc_model_large_voca.pt"
        import urllib.request
        urllib.request.urlretrieve(fallback_url, weights_path)
