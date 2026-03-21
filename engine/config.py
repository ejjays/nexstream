import os
import torch
import numpy as np
import logging

# fix numpy types
if not hasattr(np, 'float'): np.float = float
if not hasattr(np, 'int'): np.int = int

# setup logging 
logging.basicConfig(level=logging.INFO, format='%(asctime)s - MAX ACCURACY DUAL-T4 - %(message)s')
logger = logging.getLogger(__name__)

# configure gpu devices
GPU_0 = "cuda:0" if torch.cuda.device_count() > 0 else "cpu"
GPU_1 = "cuda:1" if torch.cuda.device_count() > 1 else GPU_0

# define output paths
OUTPUT_DIR = "/kaggle/working/separated"
os.makedirs(OUTPUT_DIR, exist_ok=True)
BTC_REPO_DIR = "/kaggle/working/BTC-ISMIR19"

# set sample rate
SR_MODEL = 22050
