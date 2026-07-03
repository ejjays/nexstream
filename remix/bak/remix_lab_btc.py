#!/usr/bin/env python3
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from remix.setup_env import bootstrap
from remix.app import launch

if __name__ == "__main__":
    bootstrap()
    launch()
