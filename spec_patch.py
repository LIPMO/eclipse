import json
cmd=None
for line in open('/root/.claude/projects/-home-user-eclipse/9495e126-cad2-5857-b326-4d8dec447366.jsonl'):
    if 'initSpectator() {' not in line: continue
    try: o=json.loads(line)
    except: continue
    for c in (o.get('message',{}).get('content') or []):
        if isinstance(c,dict) and c.get('type')=='tool_use' and 'initSpectator() {' in str(c.get('input',{}).get('command','')):
            cmd=c['input']['command']
s=cmd[cmd.index("<<'EOF'\n")+8:cmd.rindex("\nEOF")]
s=s.replace('rep("    this.endKillcam();\\n","    this.endKillcam();\\n    if (this.spec)','rep("    while (this.marks?.length) this.removeMark(0);\\n    this.endKillcam();\\n","    while (this.marks?.length) this.removeMark(0);\\n    this.endKillcam();\\n    if (this.spec)')
open('spec_patch.py','w').write(s)
print(len(s), 'while (this.marks' in s)