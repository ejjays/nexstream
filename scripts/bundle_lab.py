import os
import sys

def bundle():
    package_dir = os.path.join(os.path.dirname(__file__), '..', 'engine')
    
    files_to_bundle = [
        'config.py',
        'setup_env.py',
        'theory_utils.py',
        'model_manager.py',
        'audio_engines.py',
        'processing.py',
        'orchestrator.py',
        'app.py',
        '__init__.py'
    ]

    output = []
    output.append("# 📦 BUNDLED REMIX LAB ENGINE")
    output.append("# Generated automatically for Kaggle Copy-Paste")
    output.append("import os, sys, shutil")
    output.append("\n# --- 1. UNPACKING MODULAR STRUCTURE ---")
    output.append("os.makedirs('engine', exist_ok=True)")
    
    for filename in files_to_bundle:
        file_path = os.path.join(package_dir, filename)
        if not os.path.exists(file_path):
            continue
            
        with open(file_path, 'r') as f:
            content = f.read()
            
        output.append(f"\n# Writing {filename}...")
        output.append(f"with open('engine/{filename}', 'w') as f:")
        output.append(f"    f.write({repr(content)})")

    output.append("\n# --- 2. FORCE RELOAD & BOOTSTRAP ---")
    output.append("if os.getcwd() not in sys.path: sys.path.append(os.getcwd())")
    
    output.append("\n# Clear old modules from memory to ensure new bundle is used")
    output.append("for mod in list(sys.modules.keys()):")
    output.append("    if mod.startswith('engine'):")
    output.append("        del sys.modules[mod]")
    
    output.append("\n# First, run bootstrap to install dependencies")
    output.append("from engine import bootstrap")
    output.append("bootstrap()")
    
    output.append("\n# Now that dependencies are installed, we can safely import and launch")
    output.append("from engine import launch")
    output.append("launch()")

    bundled_file = os.path.join(os.path.dirname(__file__), 'remix_lab_btc.py')
    with open(bundled_file, 'w') as f:
        f.write("\n".join(output))
    
    print(f"✅ Bundling complete!")
    print(f"👉 Generated 'scripts/remix_lab_btc.py' for Kaggle Push.")

if __name__ == "__main__":
    bundle()
