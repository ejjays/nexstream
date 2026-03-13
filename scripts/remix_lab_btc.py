#!/usr/bin/env python3
import sys
import os

# Add the directory containing remix_lab to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from remix_lab.setup_env import bootstrap
from remix_lab.app import launch

if __name__ == "__main__":
    bootstrap()
    launch()
