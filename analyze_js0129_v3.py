import os
import re

def analyze_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    lines = content.splitlines()
    
    # 1. Find all function declarations: function name(...)
    func_decls = []
    for i, line in enumerate(lines):
        # Match function declarations
        m = re.search(r'function\s+([a-zA-Z0-9_]+)\s*\(', line)
        if m:
            func_decls.append((m.group(1), i + 1))
            
    # 2. Find all const/let declarations at top level: const name = 
    var_decls = []
    for i, line in enumerate(lines):
        m = re.search(r'^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=', line)
        if m:
            var_decls.append((m.group(1), i + 1))
            
    all_decls = func_decls + var_decls
    findings = []
    
    for name, def_line in all_decls:
        # Search for usages before def_line
        for i in range(def_line - 1):
            line = lines[i]
            # Strip comments and imports
            if '//' in line: line = line.split('//')[0]
            if 'import ' in line: continue
            
            # Usage: name followed by (, or used as value
            # Avoid matching property keys: { name: ... } or name: ...
            # Usage regex: name not preceded by . (property access) and not followed by : (property key)
            # and surrounded by non-word chars
            usage_re = re.compile(rf'(?<![\.a-zA-Z0-9_]){re.escape(name)}(?![a-zA-Z0-9_])(?!\s*:)')
            
            if usage_re.search(line):
                findings.append((name, i + 1, def_line))
                
    return findings

src_dir = 'backend/src'
all_findings = {}

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.ts') and not file.endswith('.d.ts'):
            path = os.path.join(root, file)
            findings = analyze_file(path)
            if findings:
                all_findings[path] = findings

for path, findings in sorted(all_findings.items()):
    print(f"File: {path}")
    grouped = {}
    for name, usage_line, def_line in findings:
        if name not in grouped:
            grouped[name] = {'usages': [], 'def': def_line}
        grouped[name]['usages'].append(usage_line)
    
    for name, data in sorted(grouped.items()):
        usages = ", ".join(map(str, sorted(list(set(data['usages'])))))
        print(f"  {name}: Usage(s) @ {usages}, Defined @ {data['def']}")
