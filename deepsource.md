# DeepSource Code Review Report: Docker

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 020999b...47c5b82
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/](https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/)

---

## Summary
- **Docker:** 2 issues

---

## Code Review Findings
**Status:** Failure
**Findings:** 2 new issues

1. **Pin versions in apt get install. Instead of `apt-get install <package>` use `apt-get install <package>=<version>`** (`DOK-DL3008`)
   **File:** `backend/Dockerfile`
   **Line:** 6
   ```
   WORKDIR /app
   
   # Install dependencies
   RUN set -ex; \
       export DEBIAN_FRONTEND=noninteractive; \
       apt-get update; \
       apt-get install -y --no-install-recommends \
   ```
   **Category:** Bug risk
   **Severity:** major

2. **Set the SHELL option -o pipefail before RUN with a pipe in it. If you are using /bin/sh in an alpine image or if your shell is symlinked to busybox then consider explicitly setting your SHELL to /bin/ash, or disable this check** (`DOK-DL4006`)
   **File:** `backend/Dockerfile`
   **Line:** 6
   ```
   WORKDIR /app
   
   # Install dependencies
   RUN set -ex; \
       export DEBIAN_FRONTEND=noninteractive; \
       apt-get update; \
       apt-get install -y --no-install-recommends \
   ```
   **Category:** Bug risk
   **Severity:** major

...

# DeepSource Code Review Report: Python

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 020999b...47c5b82
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/](https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/)

---

## Summary
- **Python:** 22 issues

---

## Code Review Findings
**Status:** Failure
**Findings:** 22 new issues

1. **Unused Path imported from pathlib** (`PY-W2000`)
   **File:** `engine/app.py`
   **Line:** 7
   ```python
   import shutil
   import uuid
   import threading
   from pathlib import Path
   from engine.orchestrator import remix_audio_dual_gpu
   from engine.config import API_PORT, BASE_DIR, logger, IS_KAGGLE
   ```
   **Category:** Anti-pattern
   **Severity:** major

2. **Unused import asyncio** (`PY-W2000`)
   **File:** `engine/app.py`
   **Line:** 2
   ```python
   import os
   import asyncio
   import nest_asyncio
   import shutil
   import uuid
   ```
   **Category:** Anti-pattern
   **Severity:** major

3. **Unused import threading** (`PY-W2000`)
   **File:** `engine/app.py`
   **Line:** 6
   ```python
   import nest_asyncio
   import shutil
   import uuid
   import threading
   from pathlib import Path
   from engine.orchestrator import remix_audio_dual_gpu
   from engine.config import API_PORT, BASE_DIR, logger, IS_KAGGLE
   ```
   **Category:** Anti-pattern
   **Severity:** major

4. **Simplify chained comparison between the operands** (`PYL-R1716`)
   **File:** `engine/audio_engines.py`
   **Line:** 133
   ```python
   if eff_f_e > eff_f_s:
                   batch_segment_logits[b, i] = np.mean(avg_logits[b, eff_f_s:eff_f_e], axis=0)
                   batch_segment_energies[b, i] = np.mean(batch_features[b][eff_f_s:eff_f_e])
               elif eff_f_s >= 0 and eff_f_s < valid_len_b:
                   batch_segment_logits[b, i] = avg_logits[b, eff_f_s]
                   batch_segment_energies[b, i] = np.mean(batch_features[b][eff_f_s])
               else:
   ```
   **Category:** Anti-pattern
   **Severity:** minor

5. **Using the global statement** (`PYL-W0603`)
   **File:** `engine/model_manager.py`
   **Line:** 55
   ```python
   # initialize beat models
   def get_beat_models():
       global BEAT_FEAT, BEAT_DECODE
       if BEAT_FEAT is None:
           from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
           BEAT_FEAT = RNNBeatProcessor()
   ```
   **Category:** Anti-pattern
   **Severity:** minor

6. **Using the global statement** (`PYL-W0603`)
   **File:** `engine/model_manager.py`
   **Line:** 64
   ```python
   # setup main cqt
   def get_cqt_main():
       global CQT_LAYER_MAIN
       if CQT_LAYER_MAIN is None:
           from nnAudio.features.cqt import CQT1992v2
           CQT_LAYER_MAIN = CQT1992v2(sr=SR_MODEL, hop_length=2048, fmin=32.70319566257483,
   ```
   **Category:** Anti-pattern
   **Severity:** minor

7. **Using the global statement** (`PYL-W0603`)
   **File:** `engine/model_manager.py`
   **Line:** 73
   ```python
   # setup bass cqt
   def get_cqt_bass():
       global CQT_LAYER_BASS
       if CQT_LAYER_BASS is None:
           from nnAudio.features.cqt import CQT1992v2
           CQT_LAYER_BASS = CQT1992v2(sr=SR_MODEL, hop_length=512, fmin=32.70319566257483,
   ```
   **Category:** Anti-pattern
   **Severity:** minor

8. **Using the global statement** (`PYL-W0603`)
   **File:** `engine/model_manager.py`
   **Line:** 25
   ```python
   # load btc model
   def load_btc_model():
       global BTC_MODEL, GLOBAL_MEAN, GLOBAL_STD
       if BTC_MODEL is None:
           if BTC_REPO_DIR not in sys.path:
               sys.path.append(BTC_REPO_DIR)
   ```
   **Category:** Anti-pattern
   **Severity:** minor

9. **Unused numpy imported as np** (`PY-W2000`)
   **File:** `engine/model_manager.py`
   **Line:** 5
   ```python
   import gc
   import sys
   import torch
   import numpy as np
   from engine.config import GPU_1, BTC_REPO_DIR, SR_MODEL, logger
   
   BTC_MODEL = None
   ```
   **Category:** Anti-pattern
   **Severity:** major

10. **`remix_audio_dual_gpu` has a cyclomatic complexity of 41 with "very-high" risk** (`PY-R1000`)
    **File:** `engine/orchestrator.py`
    **Line:** 14
    ```python
    from engine.processing import get_chords_btc_max_accuracy
    
    # dual-gpu pipeline
    def remix_audio_dual_gpu(audio_path, engine_choice, stems_mode):
        try:
            if not audio_path: 
                return [None]*11
    ```
    **Category:** Anti-pattern
    **Severity:** minor

11. **`apply_human_smoothing` has a cyclomatic complexity of 19 with "high" risk** (`PY-R1000`)
    **File:** `engine/processing.py`
    **Line:** 11
    ```python
    from engine.audio_engines import run_btc_batched_logits, extract_bass_pitch_per_beat, viterbi_decoding
    
    # smooth chord transitions
    def apply_human_smoothing(chord_data):
        if not chord_data: return []
        
        for c in chord_data:
    ```
    **Category:** Anti-pattern
    **Severity:** minor

12. **`get_chords_btc_max_accuracy` has a cyclomatic complexity of 20 with "high" risk** (`PY-R1000`)
    **File:** `engine/processing.py`
    **Line:** 60
    ```python
    return smoothed
    
    # extract chords accurately
    def get_chords_btc_max_accuracy(master_audio_path, beats, tempo=120, bass_audio_path=None, other_audio_path=None):
        load_btc_model()
        y, _ = librosa.load(master_audio_path, sr=SR_MODEL)
    ```
    **Category:** Anti-pattern
    **Severity:** minor

13. **Unused variable 'batch_energies'** (`PYL-W0612`)
    **File:** `engine/processing.py`
    **Line:** 78
    ```python
    else:
            logger.info("[VITERBI FUSION] Analyzing Full Mix Mathematics...")
            
        batch_segment_logits, batch_energies, times = run_btc_batched_logits(paths_to_process, beats)
        
        dominant_bass_notes = None
        if has_stems:
    ```
    **Category:** Anti-pattern
    **Severity:** major

14. **Unused import logging** (`PY-W2000`)
    **File:** `engine/setup_env.py`
    **Line:** 4
    ```python
    import sys
    import subprocess
    import os
    import logging
    import shutil
    from engine.config import logger, BTC_REPO_DIR
    ```
    **Category:** Anti-pattern
    **Severity:** major

15. **Reimport 'sys' (imported line 1)** (`PYL-W0404`)
    **File:** `engine/setup_env.py`
    **Line:** 11
    ```python
    # install pkgs
    def bootstrap():
        # upgrade tools
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--upgrade", "pip"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "websockets>=15.0.1"])
    ```
    **Category:** Bug risk
    **Severity:** major

16. **Reimport 'subprocess' (imported line 2)** (`PYL-W0404`)
    **File:** `engine/setup_env.py`
    **Line:** 11
    ```python
    # install pkgs
    def bootstrap():
        # upgrade tools
        import subprocess, sys
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--upgrade", "pip"])
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "websockets>=15.0.1"])
    ```
    **Category:** Bug risk
    **Severity:** major

17. **Unused import pytest** (`PY-W2000`)
    **File:** `engine/tests/test_theory_utils.py`
    **Line:** 1
    ```python
    import pytest
    from engine.theory_utils import normalize_chord_name, get_enharmonic_map
    
    def test_normalize_chord_name_basic():
    ```
    **Category:** Anti-pattern
    **Severity:** major

18. **Unused import logging** (`PY-W2000`)
    **File:** `engine/theory_utils.py`
    **Line:** 2
    ```python
    import re
    import logging
    from engine.config import logger
    
    CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    ```
    **Category:** Anti-pattern
    **Severity:** major

19. **Redefining name 'root' from outer scope** (`PYL-W0621`)
    **File:** `engine/theory_utils.py`
    **Line:** 29
    ```python
    key_probabilities = proc(audio_path)
            key_label = key_prediction_to_label(key_probabilities)
            parts = key_label.split()
            root = parts[0]
            quality = parts[1]
            final_key = root if quality == 'major' else root + 'm'
            return [final_key]
    ```
    **Category:** Anti-pattern
    **Severity:** major

20. **Redefining name 'quality' from outer scope** (`PYL-W0621`)
    **File:** `engine/theory_utils.py`
    **Line:** 30
    ```python
    key_label = key_prediction_to_label(key_probabilities)
            parts = key_label.split()
            root = parts[0]
            quality = parts[1]
            final_key = root if quality == 'major' else root + 'm'
            return [final_key]
        except Exception as e:
    ```
    **Category:** Anti-pattern
    **Severity:** major

21. **Appending to list immediately following its definition** (`PY-W0070`)
    **File:** `scripts/bundle_lab.py`
    **Line:** 20
    ```python
    '__init__.py'
        ]
    
        output = []
        output.append("# nitro lab engine")
        output.append("# generated for copy-paste")
        output.append("import os, sys, shutil")
    ```
    **Category:** Anti-pattern
    **Severity:** major

22. **Unused import sys** (`PY-W2000`)
    **File:** `scripts/bundle_lab.py`
    **Line:** 3
    ```python
    #!/usr/bin/env python3
    import os
    import sys
    
    def bundle():
        package_dir = os.path.join(os.path.dirname(__file__), '..', 'engine')
    ```
    **Category:** Anti-pattern
    **Severity:** major




...
# DeepSource Code Review Report: Shell

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 020999b...47c5b82
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/](https://app.deepsource.com/gh/ejjays/nexstream/run/e3d793f1-4c4f-47a9-becc-a148a0947c6d/)

---

## Summary
- **Shell:** 53 issues

---

## Code Review Findings
**Status:** Failure
**Findings:** 53 new issues

1. **Expressions don't expand in single quotes, use double quotes for that** (`SH-2016`)
   **File:** `scripts/cr.sh`
   **Line:** 2
   ```bash
   #!/bin/bash
   proot-distro login debian -- bash -l -c 'cd "$1" && shift && coderabbit "$@"' -- "$PWD" "$@"
   ```
   **Category:** Bug risk
   **Severity:** major

2. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 72
   ```bash
   [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
              [[ ! "$line" =~ "Settings:" ]] && \
              [[ ! "$line" =~ "Autoupdate" ]] && \
              [[ ! "$line" =~ "Generated Connector ID" ]] && \
              [[ ! "$line" =~ "Initial protocol" ]] && \
              [[ ! "$line" =~ "ICMP proxy" ]] && \
              [[ ! "$line" =~ "ping_group_range" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

3. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 69
   ```bash
   [[ ! "$line" =~ "Your quick Tunnel" ]] && \
              [[ ! "$line" =~ "+---" ]] && \
              [[ ! "$line" =~ "Visit it at" ]] && \
              [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
              [[ ! "$line" =~ "Settings:" ]] && \
              [[ ! "$line" =~ "Autoupdate" ]] && \
              [[ ! "$line" =~ "Generated Connector ID" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

4. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 74
   ```bash
   [[ ! "$line" =~ "Autoupdate" ]] && \
              [[ ! "$line" =~ "Generated Connector ID" ]] && \
              [[ ! "$line" =~ "Initial protocol" ]] && \
              [[ ! "$line" =~ "ICMP proxy" ]] && \
              [[ ! "$line" =~ "ping_group_range" ]] && \
              [[ ! "$line" =~ "Tunnel connection curve" ]] && \
              [[ ! "$line" =~ "Registered tunnel connection" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

5. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 79
   ```bash
   [[ ! "$line" =~ "Tunnel connection curve" ]] && \
              [[ ! "$line" =~ "Registered tunnel connection" ]] && \
              [[ ! "$line" =~ "location=" ]] && \
              [[ ! "$line" =~ "https://" ]]; then
               echo "$line"
           fi
       fi
   ```
   **Category:** Bug risk
   **Severity:** major

6. **Remove quotes from right-hand side of =~ to match as a regex rather than literally** (`SH-2076`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 67
   ```bash
   [[ ! "$line" =~ "Checksum" ]] && \
              [[ ! "$line" =~ "metrics" ]] && \
              [[ ! "$line" =~ "Your quick Tunnel" ]] && \
              [[ ! "$line" =~ "+---" ]] && \
              [[ ! "$line" =~ "Visit it at" ]] && \
              [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
              [[ ! "$line" =~ "Settings:" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

7. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 75
   ```bash
   [[ ! "$line" =~ "Generated Connector ID" ]] && \
              [[ ! "$line" =~ "Initial protocol" ]] && \
              [[ ! "$line" =~ "ICMP proxy" ]] && \
              [[ ! "$line" =~ "ping_group_range" ]] && \
              [[ ! "$line" =~ "Tunnel connection curve" ]] && \
              [[ ! "$line" =~ "Registered tunnel connection" ]] && \
              [[ ! "$line" =~ "location=" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

8. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 63
   ```bash
   # filter noise
       if [[ $GOT_URL -eq 1 ]]; then
           if [[ ! "$line" =~ "Version" ]] && \
              [[ ! "$line" =~ "Checksum" ]] && \
              [[ ! "$line" =~ "metrics" ]] && \
              [[ ! "$line" =~ "Your quick Tunnel" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

9. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 71
   ```bash
   [[ ! "$line" =~ "Visit it at" ]] && \
              [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
              [[ ! "$line" =~ "Settings:" ]] && \
              [[ ! "$line" =~ "Autoupdate" ]] && \
              [[ ! "$line" =~ "Generated Connector ID" ]] && \
              [[ ! "$line" =~ "Initial protocol" ]] && \
              [[ ! "$line" =~ "ICMP proxy" ]] && \
   ```
   **Category:** Bug risk
   **Severity:** major

10. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 66
    ```bash
    if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

11. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 78
    ```bash
    [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
                echo "$line"
            fi
    ```
    **Category:** Bug risk
    **Severity:** major

12. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 73
    ```bash
    [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

13. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 65
    ```bash
    if [[ $GOT_URL -eq 1 ]]; then
            if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

14. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 64
    ```bash
    # filter noise
        if [[ $GOT_URL -eq 1 ]]; then
            if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

15. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 36
    ```bash
    # show url box then track usage
    stdbuf -oL cloudflared tunnel --url http://localhost:$PORT 2>&1 | while read -r line; do
        # extract url
        if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
            URL="${BASH_REMATCH[1]}"
            echo ""
            echo "┌────────────────────────────────────────────────────────────┐"
    ```
    **Category:** Bug risk
    **Severity:** major

16. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 67
    ```bash
    [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

17. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 68
    ```bash
    [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

18. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 70
    ```bash
    [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

19. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 76
    ```bash
    [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
    ```
    **Category:** Bug risk
    **Severity:** major

20. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 20
    ```bash
    else
        DISCOVERY=1
        # format turso url for curl
        T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
    fi
    
    # restart backend
    ```
    **Category:** Bug risk
    **Severity:** major

21. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 77
    ```bash
    [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
                echo "$line"
    ```
    **Category:** Bug risk
    **Severity:** major

22. **Quote this to prevent word splitting** (`SH-2046`)
    **File:** `scripts/start-cloudflare.sh`
    **Line:** 10
    ```bash
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
        export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
    fi
    
    # check for turso
    ```
    **Category:** Bug risk
    **Severity:** major

23. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/start-zrok.sh`
    **Line:** 35
    ```bash
    # run zrok and catch the url
    stdbuf -oL zrok share public http://localhost:$PORT --backend-mode proxy 2>&1 | while read -r line; do
        # extract zrok url
        if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.share\.zrok\.io) ]]; then
            URL="${BASH_REMATCH[1]}"
            echo ""
            echo "┌────────────────────────────────────────────────────────────┐"
    ```
    **Category:** Bug risk
    **Severity:** major

24. **Quote this to prevent word splitting** (`SH-2046`)
    **File:** `scripts/start-zrok.sh`
    **Line:** 10
    ```bash
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
        export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
    fi
    
    # check for turso
    ```
    **Category:** Bug risk
    **Severity:** major

25. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/start-zrok.sh`
    **Line:** 19
    ```bash
    DISCOVERY=0
    else
        DISCOVERY=1
        T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
    fi
    
    # restart backend
    ```
    **Category:** Bug risk
    **Severity:** major

26. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/sync_kaggle.sh`
    **Line:** 18
    ```bash
    # pulling output from Kaggle
    # Note: this pulls from the LATEST SAVED VERSION of the notebook
    kaggle kernels output $KERNEL_ID -p $TARGET_DIR
    
    # check if zip arrived
    if [ -f "$TARGET_DIR/analysis_results.zip" ]; then
    ```
    **Category:** Bug risk
    **Severity:** major

27. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 65
    ```bash
    if [[ $GOT_URL -eq 1 ]]; then
            if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

28. **Remove quotes from right-hand side of =~ to match as a regex rather than literally** (`SH-2076`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 67
    ```bash
    [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

29. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 72
    ```bash
    [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

30. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 36
    ```bash
    # show url box then track usage
    stdbuf -oL cloudflared tunnel --url http://localhost:$PORT 2>&1 | while read -r line; do
        # extract url
        if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
            URL="${BASH_REMATCH[1]}"
            echo ""
            echo "┌────────────────────────────────────────────────────────────┐"
    ```
    **Category:** Bug risk
    **Severity:** major

31. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 68
    ```bash
    [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

32. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 75
    ```bash
    [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

33. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 79
    ```bash
    [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
                echo "$line"
            fi
        fi
    ```
    **Category:** Bug risk
    **Severity:** major

34. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 64
    ```bash
    # filter noise
        if [[ $GOT_URL -eq 1 ]]; then
            if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

35. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 69
    ```bash
    [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

36. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 67
    ```bash
    [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

37. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 20
    ```bash
    else
        DISCOVERY=1
        # format turso url for curl
        T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
    fi
    
    # restart backend
    ```
    **Category:** Bug risk
    **Severity:** major

38. **Quote this to prevent word splitting** (`SH-2046`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 10
    ```bash
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
        export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
    fi
    
    # check for turso
    ```
    **Category:** Bug risk
    **Severity:** major

39. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 66
    ```bash
    if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
               [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

40. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 78
    ```bash
    [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
                echo "$line"
            fi
    ```
    **Category:** Bug risk
    **Severity:** major

41. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 63
    ```bash
    # filter noise
        if [[ $GOT_URL -eq 1 ]]; then
            if [[ ! "$line" =~ "Version" ]] && \
               [[ ! "$line" =~ "Checksum" ]] && \
               [[ ! "$line" =~ "metrics" ]] && \
               [[ ! "$line" =~ "Your quick Tunnel" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

42. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 70
    ```bash
    [[ ! "$line" =~ "+---" ]] && \
               [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

43. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 71
    ```bash
    [[ ! "$line" =~ "Visit it at" ]] && \
               [[ ! "$line" =~ "Cannot determine default configuration path" ]] && \
               [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

44. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 76
    ```bash
    [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
    ```
    **Category:** Bug risk
    **Severity:** major

45. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 73
    ```bash
    [[ ! "$line" =~ "Settings:" ]] && \
               [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

46. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 77
    ```bash
    [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
               [[ ! "$line" =~ "location=" ]] && \
               [[ ! "$line" =~ "https://" ]]; then
                echo "$line"
    ```
    **Category:** Bug risk
    **Severity:** major

47. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-cloudflare.sh`
    **Line:** 74
    ```bash
    [[ ! "$line" =~ "Autoupdate" ]] && \
               [[ ! "$line" =~ "Generated Connector ID" ]] && \
               [[ ! "$line" =~ "Initial protocol" ]] && \
               [[ ! "$line" =~ "ICMP proxy" ]] && \
               [[ ! "$line" =~ "ping_group_range" ]] && \
               [[ ! "$line" =~ "Tunnel connection curve" ]] && \
               [[ ! "$line" =~ "Registered tunnel connection" ]] && \
    ```
    **Category:** Bug risk
    **Severity:** major

48. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/tunnels/start-ngrok.sh`
    **Line:** 22
    ```bash
    DISCOVERY=0
    else
        DISCOVERY=1
        T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
    fi
    
    echo "starting backend..."
    ```
    **Category:** Bug risk
    **Severity:** major

49. **Quote this to prevent word splitting** (`SH-2046`)
    **File:** `scripts/tunnels/start-ngrok.sh`
    **Line:** 13
    ```bash
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
        export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
    fi
    
    # check for turso
    ```
    **Category:** Bug risk
    **Severity:** major

50. **GOT_URL appears unused. Verify use (or export if used externally)** (`SH-2034`)
    **File:** `scripts/tunnels/start-ngrok.sh`
    **Line:** 9
    ```bash
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    BASE_DIR="$(dirname "$SCRIPT_DIR")"
    NGROK_BIN="$SCRIPT_DIR/ngrok"
    GOT_URL=0
    
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
    ```
    **Category:** Anti-pattern
    **Severity:** major

51. **Double quote to prevent globbing and word splitting** (`SH-2086`)
    **File:** `scripts/tunnels/start-zrok.sh`
    **Line:** 19
    ```bash
    DISCOVERY=0
    else
        DISCOVERY=1
        T_URL=$(echo $TURSO_URL | sed 's/libsql:\/\//https:\/\//')
    fi
    
    # restart backend
    ```
    **Category:** Bug risk
    **Severity:** major

52. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
    **File:** `scripts/tunnels/start-zrok.sh`
    **Line:** 35
    ```bash
    # run zrok and catch the url
    stdbuf -oL zrok share public http://localhost:$PORT --backend-mode proxy 2>&1 | while read -r line; do
        # extract zrok url
        if [[ $GOT_URL -eq 0 && "$line" =~ (https://[a-z0-9-]+\.share\.zrok\.io) ]]; then
            URL="${BASH_REMATCH[1]}"
            echo ""
            echo "┌────────────────────────────────────────────────────────────┐"
    ```
    **Category:** Bug risk
    **Severity:** major

53. **Quote this to prevent word splitting** (`SH-2046`)
    **File:** `scripts/tunnels/start-zrok.sh`
    **Line:** 10
    ```bash
    # load turso env
    if [ -f "$BASE_DIR/backend/.env" ]; then
        export $(grep -v '^#' "$BASE_DIR/backend/.env" | xargs)
    fi
    
    # check for turso
    ```
    **Category:** Bug risk
    **Severity:** major

