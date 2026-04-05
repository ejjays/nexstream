import os
import torch
import numpy as np
import logging
from pathlib import Path

# fix numpy
if not hasattr(np, 'float'): np.float = float
if not hasattr(np, 'int'): np.int = int

# nitro logs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - NITRO-ENGINE - %(message)s')
logger = logging.getLogger(__name__)

# detect env
IS_KAGGLE = os.environ.get('KAGGLE_KERNEL_RUN_TYPE','') != ''
BASE_DIR = Path("/kaggle/working") if IS_KAGGLE else Path(os.getcwd())

# config gpu
GPU_COUNT = torch.cuda.device_count()
if GPU_COUNT > 0:
    GPU_0 = "cuda:0"
    GPU_1 = "cuda:1" if GPU_COUNT > 1 else "cuda:0"
    logger.info(f"nitro gpu mode: {GPU_COUNT} devices")
else:
    GPU_0 = "cpu"
    GPU_1 = "cpu"
    logger.info("nitro cpu mode (no gpu found)")

# output paths
OUTPUT_DIR = str(BASE_DIR / "separated")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# repo paths
BTC_REPO_DIR = str(BASE_DIR / "BTC-ISMIR19")

# model settings
SR_MODEL = 22050
API_PORT = int(os.environ.get("PORT", 7860))
