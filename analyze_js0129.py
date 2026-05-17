import os
import re

def analyze_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Simple regex to find definitions
    # function name(...)
    func_def_re = re.compile(r'function\s+([a-zA-Z0-9_]+)\s*\(')
    # const name = ... (top level or at least start of line)
    const_def_re = re.compile(r'^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=')
    
    definitions = {} # name -> line_number (1-indexed)
    
    for i, line in enumerate(lines):
        line_num = i + 1
        # Strip comments
        line = line.split('//')[0]
        
        m_func = func_def_re.search(line)
        if m_func:
            name = m_func.group(1)
            if name not in definitions:
                definitions[name] = line_num
        
        m_const = const_def_re.search(line)
        if m_const:
            name = m_const.group(1)
            if name not in definitions:
                definitions[name] = line_num

    findings = []
    for i, line in enumerate(lines):
        line_num = i + 1
        line = line.split('//')[0]
        
        # Look for usages of defined names
        for name, def_line in definitions.items():
            if line_num < def_line:
                # Regex for usage: name not preceded or followed by alphanumeric/_
                # and not part of a definition itself
                usage_re = re.compile(rf'(?<![a-zA-Z0-9_]){re.escape(name)}(?![a-zA-Z0-9_])')
                if usage_re.search(line):
                    # Check if it's likely a definition (redundant check)
                    if not (line.strip().startswith('function ' + name) or 
                            line.strip().startswith('const ' + name) or
                            line.strip().startswith('let ' + name) or
                            line.strip().startswith('var ' + name) or
                            line.strip().startswith('export const ' + name) or
                            line.strip().startswith('export function ' + name)):
                        findings.append((name, line_num, def_line))
    
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

for path, findings in all_findings.items():
    print(f"File: {path}")
    # Group by name to avoid too many duplicate reports for the same variable
    grouped = {}
    for name, usage_line, def_line in findings:
        if name not in grouped:
            grouped[name] = {'usages': [], 'def': def_line}
        grouped[name]['usages'].append(usage_line)
    
    for name, data in grouped.items():
        usages = ", ".join(map(str, sorted(list(set(data['usages'])))))
        print(f"  Variable/Function: {name}")
        print(f"    Usage Line(s): {usages}")
        print(f"    Definition Line: {data['def']}")
