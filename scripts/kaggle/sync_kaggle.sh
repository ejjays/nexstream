#!/bin/bash

KERNEL_ID=$1
TARGET_DIR="temp_refs"

if [ -z "$KERNEL_ID" ]; then
    echo "usage: ./sync_kaggle.sh <user>/<slug>"
    exit 1
fi

echo "pulling results: $KERNEL_ID"

# fetch Kaggle output
kaggle kernels output "$KERNEL_ID" -p "$TARGET_DIR"

if [ -f "$TARGET_DIR/analysis_results.zip" ]; then
    echo "unpacking results..."
    unzip -o "$TARGET_DIR/analysis_results.zip" -d "$TARGET_DIR"
    rm "$TARGET_DIR/analysis_results.zip"
    echo "done. see $TARGET_DIR/"
else
    echo "error: zip missing"
    exit 1
fi
