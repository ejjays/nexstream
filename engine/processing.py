import os
import re
import numpy as np
import librosa
from engine.config import logger, SR_MODEL
from engine.theory_utils import get_key_ai, get_enharmonic_map, normalize_chord_name, VOCAB
from engine.model_manager import load_btc_model
from engine.audio_engines import run_btc_batched_logits, extract_bass_pitch_per_beat, viterbi_decoding

# smooth chord transitions
def _clean_bass_extensions(chord_data):
    for c in chord_data:
        dur = c['end'] - c['time']
        if '/' in c['chord']:
            if dur < 0.8:
                c['chord'] = c['chord'].split('/')[0]
            else:
                chord_root = c['chord'].split('/')[0]
                bass_note = c['chord'].split('/')[1]
                if len(bass_note) > 1 and len(chord_root) == 1:
                     pass
                elif bass_note not in ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'F#', 'C#', 'G#']:
                    c['chord'] = chord_root
    return chord_data

def _consolidate_consecutive(chord_data):
    consolidated = []
    for c in chord_data:
        if consolidated and consolidated[-1]['chord'] == c['chord']:
            consolidated[-1]['end'] = c['end']
        else:
            consolidated.append(c)
    return consolidated

def apply_human_smoothing(chord_data):
    if not chord_data: return []
    
    chord_data = _clean_bass_extensions(chord_data)
    consolidated = _consolidate_consecutive(chord_data)
            
    smoothed = []
    for i, c in enumerate(consolidated):
        dur = c['end'] - c['time']
        
        if dur < 0.6 and len(smoothed) > 0 and i < len(consolidated) - 1:
            prev_c = smoothed[-1]['chord'].split('/')[0]
            curr_c = c['chord'].split('/')[0]
            next_c = consolidated[i+1]['chord'].split('/')[0]
            
            is_walkdown = curr_c not in (prev_c, next_c)
            
            if is_walkdown and dur >= 0.25:
                smoothed.append(c)
                continue
                
            smoothed[-1]['end'] = c['end']
            continue
            
        if smoothed and smoothed[-1]['chord'] == c['chord']:
            smoothed[-1]['end'] = c['end']
        else:
            smoothed.append(c)

    return smoothed

def _analyze_stems(paths_to_process, beats, has_stems, bass_audio_path, e_map):
    batch_segment_logits, _, times = run_btc_batched_logits(paths_to_process, beats)
    
    dominant_bass_notes = None
    if has_stems:
        logger.info("[VITERBI FUSION] Applying Static Soft Fusion to Stems with N/X Clamp...")
        logits_full = batch_segment_logits[0]
        logits_bass = batch_segment_logits[1]
        logits_other = batch_segment_logits[2]
        final_logits = ((logits_full * 2.0) + (logits_bass * 0.5) + (logits_other * 0.5)) / 3.0
        dominant_bass_notes = extract_bass_pitch_per_beat(bass_audio_path, beats, e_map)
    else:
        final_logits = batch_segment_logits[0]
    return final_logits, dominant_bass_notes, times

def _refine_logits(final_logits):
    final_logits[:, 168] -= 100.0
    final_logits[:, 169] -= 100.0
    from scipy.ndimage import median_filter
    drone_profile = median_filter(final_logits, size=(8, 1))
    return final_logits - (drone_profile * 0.6)

def _decode_path(final_probs, times, dominant_bass_notes, e_map):
    path = viterbi_decoding(final_probs, transition_penalty=1.0)
    chord_data = []
    slash_chords_created = 0
    
    for i, idx in enumerate(path):
        raw_chord = VOCAB.get(idx, "N")
        final_chord = normalize_chord_name(raw_chord, e_map) if raw_chord not in ["N", "X"] else "N"
        
        if final_chord != "N" and dominant_bass_notes and i < len(dominant_bass_notes):
            bass_note = dominant_bass_notes[i]
            if bass_note:
                root_match = re.match(r'^([A-G][b#]?)', final_chord)
                if root_match and bass_note != root_match.group(1):
                    final_chord = f"{final_chord}/{bass_note}"
                    slash_chords_created += 1
        
        t_s, t_e = times[i]
        if chord_data and chord_data[-1]['chord'] == final_chord:
            chord_data[-1]['end'] = round(t_e, 3)
        else:
            chord_data.append({"time": round(t_s, 3), "end": round(t_e, 3), "chord": final_chord})
    return chord_data, slash_chords_created

# extract chords accurately
def get_chords_btc_max_accuracy(master_audio_path, beats, tempo=120, bass_audio_path=None, other_audio_path=None):
    load_btc_model()
    y, _ = librosa.load(master_audio_path, sr=SR_MODEL)
    
    global_keys = get_key_ai(master_audio_path)
    e_map = get_enharmonic_map(global_keys[0])
    
    paths_to_process = [y]
    has_stems = bool(bass_audio_path and other_audio_path and os.path.exists(bass_audio_path) and os.path.exists(other_audio_path))
    if has_stems: paths_to_process.extend([bass_audio_path, other_audio_path])
        
    final_logits, dominant_bass_notes, times = _analyze_stems(paths_to_process, beats, has_stems, bass_audio_path, e_map)
    final_probs = _refine_logits(final_logits)
    
    chord_data, slash_chords_created = _decode_path(final_probs, times, dominant_bass_notes, e_map)
    chord_data = apply_human_smoothing(chord_data)
    
    beat_dur = 60.0 / max(tempo, 30)
    for c in chord_data: c['is_passing'] = bool((c['end'] - c['time']) < beat_dur * 1.5)
    
    reasoning = f"NITRO VITERBI LOG\nKey: {global_keys[0]}\nSlash Chords: {slash_chords_created}\n"
    return chord_data, reasoning
