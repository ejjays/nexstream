#!/bin/bash

# v50 Kaggle-to-Termux Sync Tool
# usage: ./sync_kaggle.sh <username>/<kernel-slug>

KERNEL_ID=$1
TARGET_DIR="temp_refs"

if [ -z "$KERNEL_ID" ]; then
    echo "Error: Please provide your Kaggle Kernel ID (e.g. ej/my-remix-lab)"
    exit 1
fi

echo "🚀 Syncing V50 Results from Kaggle Kernel: $KERNEL_ID..."

# pulling output from Kaggle
# Note: this pulls from the LATEST SAVED VERSION of the notebook
kaggle kernels output $KERNEL_ID -p $TARGET_DIR

# check if zip arrived
if [ -f "$TARGET_DIR/analysis_results.zip" ]; then
    echo "📦 Extracting results..."
    unzip -o "$TARGET_DIR/analysis_results.zip" -d $TARGET_DIR
    rm "$TARGET_DIR/analysis_results.zip"
    echo "✅ Sync complete! Files are now in $TARGET_DIR/"
else
    echo "❌ Error: analysis_results.zip not found in Kaggle output."
    echo "💡 Tip: Make sure you have 'Saved' (Committed) the notebook at least once."
fi
