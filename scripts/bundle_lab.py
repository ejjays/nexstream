#!/usr/bin/env python3
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
    output.append("# nitro lab engine")
    output.append("# generated for copy-paste")
    output.append("import os, sys, shutil")
    output.append("\n# unpack modular")
    output.append("os.makedirs('engine', exist_ok=True)")
    
    for filename in files_to_bundle:
        file_path = os.path.join(package_dir, filename)
        if not os.path.exists(file_path):
            continue
            
        with open(file_path, 'r') as f:
            content = f.read()
            
        output.append(f"\n# write {filename}")
        output.append(f"with open('engine/{filename}', 'w') as f:")
        output.append(f"    f.write({repr(content)})")

    output.append("\n# force reload")
    output.append("if os.getcwd() not in sys.path: sys.path.append(os.getcwd())")
    
    output.append("\n# clear old memory")
    output.append("for mod in list(sys.modules.keys()):")
    output.append("    if mod.startswith('engine'):")
    output.append("        del sys.modules[mod]")
    
    output.append("\n# bootstrap deps")
    output.append("from engine import bootstrap")
    output.append("bootstrap()")
    
    output.append("\n# launch nitro")
    output.append("from engine import launch")
    output.append("launch()")

    # save files
    txt_file = os.path.join(os.path.dirname(__file__), 'kaggle_bundle.txt')
    py_file = os.path.join(os.path.dirname(__file__), 'remix_lab_btc.py')
    
    content = "\n".join(output)
    
    with open(txt_file, 'w') as f:
        f.write(content)
    with open(py_file, 'w') as f:
        f.write(content)
    
    print(f"✅ bundling complete!")
    print(f"👉 copy from: 'scripts/kaggle_bundle.txt'")

if __name__ == "__main__":
    bundle()
