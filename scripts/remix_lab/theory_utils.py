import re
import logging
from remix_lab.config import logger

CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CHORD_QUALITIES = ['min', 'maj', 'dim', 'aug', 'min6', 'maj6', 'min7', 'minmaj7', 'maj7', '7', 'dim7', 'hdim7', 'sus2', 'sus4']
VOCAB = {169: 'N', 168: 'X'}
for i in range(168):
    root = CHORD_ROOTS[i // 14]
    quality = CHORD_QUALITIES[i % 14]
    VOCAB[i] = f"{root}:{quality}" if quality != 'maj' else root

def get_enharmonic_map(key):
    flats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
    if key in flats: return {'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab'}
    return {'Bb': 'A#', 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#'}

def get_key_ai(audio_path):
    from madmom.features.key import CNNKeyRecognitionProcessor, key_prediction_to_label
    try:
        proc = CNNKeyRecognitionProcessor()
        key_probabilities = proc(audio_path)
        key_label = key_prediction_to_label(key_probabilities)
        parts = key_label.split()
        root = parts[0]
        quality = parts[1]
        final_key = root if quality == 'major' else root + 'm'
        return [final_key]
    except Exception as e:
        logger.error(f"[KEY ENGINE] Madmom CNN failed: {e}. Falling back to C.")
        return ["C"]

def normalize_chord_name(chord, enharmonic_map=None):
    if chord in ['N', 'X', None]: return chord
    chord = chord.replace(':minmaj7', 'm(maj7)').replace(':maj7', 'maj7').replace(':min7', 'm7').replace(':maj6', '6').replace(':min6', 'm6').replace(':maj', '').replace(':min', 'm').replace(':hdim7', 'm7b5').replace(':', '')
    parts = chord.split('/')
    root_part = parts[0]
    bass_part = parts[1] if len(parts) > 1 else None
    def fix(s):
        m = re.match(r'^([A-G][b#]?)(.*)', s)
        if not m: return s
        r, sfx = m.groups()
        r = {'B#':'C', 'Cb':'B', 'Fb':'E', 'E#':'F'}.get(r, r)
        if enharmonic_map: r = enharmonic_map.get(r, r)
        return r + sfx
    res = fix(root_part)
    if bass_part: res += f"/{fix(bass_part)}"
    return res
