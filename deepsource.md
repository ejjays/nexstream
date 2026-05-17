# DeepSource Code Review Report

**Repository:** ejjays/nexstream
**Branch:** `main`
**Commit:** 47c5b82...c783db6
**Run:** [https://app.deepsource.com/gh/ejjays/nexstream/run/34951939-afab-4a55-9ff8-7a8d5caec252/](https://app.deepsource.com/gh/ejjays/nexstream/run/34951939-afab-4a55-9ff8-7a8d5caec252/)

---

## Summary
- **Python:** 4 issues- **Docker:** No issues detected- **Shell:** 4 issues- **JavaScript:** No issues detected

---

## Code Review Findings
### Python
**Status:** Failure
**Findings:** 4 new issues

1. **`_run_roformer` has a cyclomatic complexity of 25 with "high" risk** (`PY-R1000`)
   **File:** `engine/orchestrator.py`
   **Line:** 13
   ```python
   from engine.model_manager import clear_vram, get_beat_models
   from engine.processing import get_chords_btc_max_accuracy
   
   def _run_roformer(audio_path, stem_dir, stems_mode):
       # roformer separation
       logger.info("starting roformer on %s", GPU_0)
       model_name = "BS-Roformer-SW.ckpt"
   ```
   **Category:** Anti-pattern
   **Severity:** minor

2. **Unused import traceback** (`PY-W2000`)
   **File:** `engine/orchestrator.py`
   **Line:** 5
   ```python
   import subprocess
   import json
   import zipfile
   import traceback
   import numpy as np
   import shutil
   from pathlib import Path
   ```
   **Category:** Anti-pattern
   **Severity:** major

3. **Unused GPU_1 imported from engine.config** (`PY-W2000`)
   **File:** `engine/orchestrator.py`
   **Line:** 9
   ```python
   import numpy as np
   import shutil
   from pathlib import Path
   from engine.config import logger, GPU_0, GPU_1, OUTPUT_DIR, BASE_DIR
   from engine.model_manager import clear_vram, get_beat_models
   from engine.processing import get_chords_btc_max_accuracy
   ```
   **Category:** Anti-pattern
   **Severity:** major

4. **Unused numpy imported as np** (`PY-W2000`)
   **File:** `engine/processing.py`
   **Line:** 3
   ```python
   import os
   import re
   import numpy as np
   import librosa
   from engine.config import logger, SR_MODEL
   from engine.theory_utils import get_key_ai, get_enharmonic_map, normalize_chord_name, VOCAB
   ```
   **Category:** Anti-pattern
   **Severity:** major
### Docker
**Status:** Success
**Findings:** No new issues detected
### Shell
**Status:** Failure
**Findings:** 4 new issues

1. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-cloudflare.sh`
   **Line:** 36
   ```bash
   # show url box then track usage
   stdbuf -oL cloudflared tunnel --url http://localhost:"$PORT" 2>&1 | while read -r line; do
       # extract url
       if [ "$GOT_URL" -eq 0 ] && [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
           URL="${BASH_REMATCH[1]}"
           echo ""
           echo "┌────────────────────────────────────────────────────────────┐"
   ```
   **Category:** Bug risk
   **Severity:** major

2. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/start-zrok.sh`
   **Line:** 35
   ```bash
   # run zrok and catch the url
   stdbuf -oL zrok share public http://localhost:"$PORT" --backend-mode proxy 2>&1 | while read -r line; do
       # extract zrok url
       if [[ "$GOT_URL" -eq 0 && "$line" =~ (https://[a-z0-9-]+\.share\.zrok\.io) ]]; then
           URL="${BASH_REMATCH[1]}"
           echo ""
           echo "┌────────────────────────────────────────────────────────────┐"
   ```
   **Category:** Bug risk
   **Severity:** major

3. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/tunnels/start-cloudflare.sh`
   **Line:** 36
   ```bash
   # show url box then track usage
   stdbuf -oL cloudflared tunnel --url http://localhost:"$PORT" 2>&1 | while read -r line; do
       # extract url
       if [[ "$GOT_URL" -eq 0 && "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
           URL="${BASH_REMATCH[1]}"
           echo ""
           echo "┌────────────────────────────────────────────────────────────┐"
   ```
   **Category:** Bug risk
   **Severity:** major

4. **In POSIX sh, =~ regex matching is undefined** (`SH-3015`)
   **File:** `scripts/tunnels/start-zrok.sh`
   **Line:** 35
   ```bash
   # run zrok and catch the url
   stdbuf -oL zrok share public http://localhost:"$PORT" --backend-mode proxy 2>&1 | while read -r line; do
       # extract zrok url
       if [[ "$GOT_URL" -eq 0 && "$line" =~ (https://[a-z0-9-]+\.share\.zrok\.io) ]]; then
           URL="${BASH_REMATCH[1]}"
           echo ""
           echo "┌────────────────────────────────────────────────────────────┐"
   ```
   **Category:** Bug risk
   **Severity:** major
### JavaScript
**Status:** Success
**Findings:** No new issues detected

