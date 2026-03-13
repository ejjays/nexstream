import os
import re
import numpy as np
import librosa
from remix_lab.config import logger, SR_MODEL
from remix_lab.theory_utils import get_key_ai, get_enharmonic_map, normalize_chord_name, VOCAB
from remix_lab.model_manager import load_btc_model
from remix_lab.audio_engines import run_btc_batched_logits, extract_bass_pitch_per_beat, viterbi_decoding

def apply_human_smoothing(chord_data):
    if not chord_data: return []
    for c in chord_data:
        dur = c['end'] - c['time']
        if '/' in c['chord'] and dur < 0.8:
            c['chord'] = c['chord'].split('/')[0]
            
    consolidated = []
    for c in chord_data:
        if consolidated and consolidated[-1]['chord'] == c['chord']:
            consolidated[-1]['end'] = c['end']
        else:
            consolidated.append(c)
            
    smoothed = []
    for i, c in enumerate(consolidated):
        dur = c['end'] - c['time']
        if dur < 1.0 and len(smoothed) > 0 and i < len(consolidated) - 1:
            prev_c = smoothed[-1]['chord'].split('/')[0]
            curr_c = c['chord'].split('/')[0]
            next_c = consolidated[i+1]['chord'].split('/')[0]
            is_walkdown = (prev_c != curr_c) and (curr_c != next_c)
            if not is_walkdown or dur <= 0.5:
                smoothed[-1]['end'] = c['end']
                continue
        if smoothed and smoothed[-1]['chord'] == c['chord']:
            smoothed[-1]['end'] = c['end']
        else:
            smoothed.append(c)
    return smoothed

def get_chords_btc_max_accuracy(master_audio_path, beats, tempo=120, bass_audio_path=None, other_audio_path=None):
    load_btc_model()
    y, _ = librosa.load(master_audio_path, sr=SR_MODEL)
    
    logger.info("[KEY ENGINE] Running Madmom CNN Key Recognition...")
    global_keys = get_key_ai(master_audio_path)
    e_map = get_enharmonic_map(global_keys[0])
    logger.info(f"[MUSIC THEORY] Detected Global Key: {global_keys[0]}. Enharmonic Mapping Applied: {e_map}")
    
    paths_to_process = [y]
    has_stems = bass_audio_path and other_audio_path and os.path.exists(bass_audio_path) and os.path.exists(other_audio_path)
    
    if has_stems:
        paths_to_process.extend([bass_audio_path, other_audio_path])
        logger.info("[VITERBI FUSION] Analyzing Full Mix, Bass, and Harmony stems simultaneously...")
    else:
        logger.info("[VITERBI FUSION] Analyzing Full Mix Mathematics...")
        
    batch_segment_logits, times = run_btc_batched_logits(paths_to_process, beats)
    
    dominant_bass_notes = None
    if has_stems:
        logger.info("[VITERBI FUSION] Applying Soft Fusion (Logit Averaging) to Stems...")
        logits_full = batch_segment_logits[0]
        logits_bass = batch_segment_logits[1]
        logits_other = batch_segment_logits[2]
        final_logits = ((logits_full * 1.0) + (logits_bass * 0.8) + (logits_other * 0.6)) / 2.4
        dominant_bass_notes = extract_bass_pitch_per_beat(bass_audio_path, beats, e_map)
    else:
        final_logits = batch_segment_logits[0]
        
    penalty = 4.5 
    logger.info(f"[VITERBI FUSION] Executing Viterbi Smoothing Algorithm with Penalty = {penalty}")
    path = viterbi_decoding(final_logits, transition_penalty=penalty)
    
    chord_data = []
    slash_chords_created = 0
    
    for i, idx in enumerate(path):
        raw_chord = VOCAB.get(idx, "N")
        final_chord = normalize_chord_name(raw_chord, e_map) if raw_chord not in ["N", "X"] else "N"
        
        if final_chord != "N" and dominant_bass_notes and i < len(dominant_bass_notes):
            bass_note = dominant_bass_notes[i]
            if bass_note:
                root_match = re.match(r'^([A-G][b#]?)', final_chord)
                if root_match:
                    chord_root = root_match.group(1)
                    if bass_note != chord_root:
                        final_chord = f"{final_chord}/{bass_note}"
                        slash_chords_created += 1
        
        t_s, t_e = times[i]
        if chord_data and chord_data[-1]['chord'] == final_chord:
            chord_data[-1]['end'] = round(t_e, 3)
        else:
            chord_data.append({"time": round(t_s, 3), "end": round(t_e, 3), "chord": final_chord})
            
    chord_data = apply_human_smoothing(chord_data)
    beat_dur = 60.0 / max(tempo, 30)
    for c in chord_data: c['is_passing'] = bool((c['end'] - c['time']) < beat_dur * 1.5)
    
    logger.info(f"[SYNTHESIS COMPLETE] Final polished chords: {len(chord_data)}.")
    
    reasoning = "VITERBI DECODING & BASS SYNTHESIS (X-RAY LOG)\n"
    reasoning += "="*50 + "\n"
    reasoning += f"-> [THEORY] Detected Key context constraint: {global_keys[0]}. Enharmonics locked.\n"
    reasoning += f"-> [VITERBI] Transition Penalty applied: {penalty}.\n"
    if bass_audio_path:
        reasoning += "-> [FUSION] Soft-Fusion Logit Averaging successful.\n"
        reasoning += f"-> [BASS ENGINE] C1-C4 CQT tracking synthesized {slash_chords_created} slash chords.\n"
    reasoning += "-> Status: Output generated via maximum likelihood path + explicit bass override."
    
    return chord_data, reasoning
