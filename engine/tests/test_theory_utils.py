import pytest
from engine.theory_utils import normalize_chord_name, get_enharmonic_map

def test_normalize_chord_name_basic():
    assert normalize_chord_name('C:maj') == 'C'
    assert normalize_chord_name('A:min') == 'Am'

def test_normalize_chord_name_complex():
    assert normalize_chord_name('D:min7') == 'Dm7'
    assert normalize_chord_name('G:maj7') == 'Gmaj7'
    assert normalize_chord_name('B:hdim7') == 'Bm7b5'
    assert normalize_chord_name('C:minmaj7') == 'Cm(maj7)'

def test_enharmonic_mapping():
    # map flats
    mapping = get_enharmonic_map('F')
    assert normalize_chord_name('A#:maj', mapping) == 'Bb'
    
    # map sharps
    mapping = get_enharmonic_map('G')
    assert normalize_chord_name('Bb:maj', mapping) == 'A#'

def test_special_labels():
    assert normalize_chord_name('N') == 'N'
    assert normalize_chord_name('X') == 'X'
    assert normalize_chord_name(None) is None
