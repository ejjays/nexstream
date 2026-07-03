import os
import gc
import sys
import torch
from remix.config import GPU_1, BTC_REPO_DIR, SR_MODEL, logger

# model state container
class ModelState:
    BTC_MODEL = None
    GLOBAL_MEAN = None
    GLOBAL_STD = None
    CQT_LAYER_MAIN = None
    CQT_LAYER_BASS = None
    BEAT_FEAT = None
    BEAT_DECODE = None

state = ModelState()

# clear gpu memory
def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

# load btc model
def load_btc_model():
    if state.BTC_MODEL is None:
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
        state.BTC_MODEL = BTC_model(config=config).to(GPU_1)
        weights = os.path.join(BTC_REPO_DIR, "test/btc_model_large_voca.pt")
        checkpoint = torch.load(weights, map_location=GPU_1, weights_only=False)
        
        # update state
        state.GLOBAL_MEAN = checkpoint['mean']
        state.GLOBAL_STD = checkpoint['std']
        
        state.BTC_MODEL.load_state_dict(checkpoint['model'] if 'model' in checkpoint else checkpoint)
        state.BTC_MODEL.eval()
        logger.info("💎 BTC TRANSFORMER LOADED ON GPU 1. (Mean: %s)", state.GLOBAL_MEAN is not None)

# initialize beat models
def get_beat_models():
    if state.BEAT_FEAT is None:
        from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
        state.BEAT_FEAT = RNNBeatProcessor()
        state.BEAT_DECODE = DBNBeatTrackingProcessor(fps=100)
    return state.BEAT_FEAT, state.BEAT_DECODE

# setup main cqt
def get_cqt_main():
    if state.CQT_LAYER_MAIN is None:
        from nnAudio.features.cqt import CQT1992v2
        state.CQT_LAYER_MAIN = CQT1992v2(sr=SR_MODEL, hop_length=2048, fmin=32.70319566257483, 
                                   n_bins=144, bins_per_octave=24, pad_mode='constant', trainable=False).to(GPU_1)
    return state.CQT_LAYER_MAIN

# setup bass cqt
def get_cqt_bass():
    if state.CQT_LAYER_BASS is None:
        from nnAudio.features.cqt import CQT1992v2
        state.CQT_LAYER_BASS = CQT1992v2(sr=SR_MODEL, hop_length=512, fmin=32.70319566257483, 
                                   n_bins=36, bins_per_octave=12, pad_mode='constant', trainable=False).to(GPU_1)
    return state.CQT_LAYER_BASS
