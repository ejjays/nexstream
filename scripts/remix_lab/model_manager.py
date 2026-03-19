import os
import gc
import sys
import torch
import numpy as np
from remix_lab.config import GPU_1, BTC_REPO_DIR, SR_MODEL, logger

BTC_MODEL = None
GLOBAL_MEAN = None
GLOBAL_STD = None
CQT_LAYER_MAIN = None
CQT_LAYER_BASS = None

BEAT_FEAT = None
BEAT_DECODE = None

def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def load_btc_model():
    global BTC_MODEL, GLOBAL_MEAN, GLOBAL_STD
    if BTC_MODEL is None:
        if BTC_REPO_DIR not in sys.path:
            sys.path.append(BTC_REPO_DIR)
        try:
            from btc_model import BTC_model
        except ImportError:
            from btc_model import BTC as BTC_model
            
        config = {
            'feature_size': 144, 'hidden_size': 128, 'num_layers': 8, 'num_heads': 8,
            'total_key_depth': 128, 'total_value_depth': 128, 'filter_size': 128,
            'input_dropout': 0.1, 'layer_dropout': 0.1, 'attention_dropout': 0.1,
            'relu_dropout': 0.1, 'use_mask': True, 'probs_out': True,
            'num_chords': 170, 'timestep': 108, 'max_length': 108, 'large_voca': True
        }
        BTC_MODEL = BTC_model(config=config).to(GPU_1)
        weights = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
        checkpoint = torch.load(weights, map_location=GPU_1, weights_only=False)
        
        # update globals
        GLOBAL_MEAN = checkpoint['mean']
        GLOBAL_STD = checkpoint['std']
        
        BTC_MODEL.load_state_dict(checkpoint['model'] if 'model' in checkpoint else checkpoint)
        BTC_MODEL.eval()
        logger.info(f"💎 BTC TRANSFORMER LOADED ON GPU 1. (Mean: {GLOBAL_MEAN is not None})")

def get_beat_models():
    global BEAT_FEAT, BEAT_DECODE
    if BEAT_FEAT is None:
        from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
        BEAT_FEAT = RNNBeatProcessor()
        BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)
    return BEAT_FEAT, BEAT_DECODE

def get_cqt_main():
    global CQT_LAYER_MAIN
    if CQT_LAYER_MAIN is None:
        from nnAudio.features.cqt import CQT1992v2
        CQT_LAYER_MAIN = CQT1992v2(sr=SR_MODEL, hop_length=2048, fmin=32.70319566257483, 
                                   n_bins=144, bins_per_octave=24, pad_mode='constant', trainable=False).to(GPU_1)
    return CQT_LAYER_MAIN

def get_cqt_bass():
    global CQT_LAYER_BASS
    if CQT_LAYER_BASS is None:
        from nnAudio.features.cqt import CQT1992v2
        CQT_LAYER_BASS = CQT1992v2(sr=SR_MODEL, hop_length=512, fmin=32.70319566257483, 
                                   n_bins=36, bins_per_octave=12, pad_mode='constant', trainable=False).to(GPU_1)
    return CQT_LAYER_BASS
