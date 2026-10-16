"""Re-time the film after the voices change length.

Reads the processed voice durations (assets/js/lipsync.js), lays the stage
lines end to end with the gaps below, then rewrites:
  - assets/js/film-core.js  T table (line starts, cursor/click/O4/end beats)
  - index.html              <audio> starts/durations, scene windows, root length
Intake/map lines keep their slots; the script fails if a voice no longer fits.
usage: python3 retime.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
lip = json.loads(open(os.path.join(ROOT, "assets", "js", "lipsync.js"), encoding="utf-8").read().split("window.LIPSYNC = ")[1].rstrip(";\n"))
dur = {k: v["dur"] for k, v in lip.items()}

core_p = os.path.join(ROOT, "assets", "js", "film-core.js")
core = open(core_p, encoding="utf-8").read()
T = {k: float(v) for k, v in re.findall(r"(\w+): (\d+(?:\.\d+)?)", core.split("var T = {")[1].split("};")[0])}

# fixed slots in the intake and on the map: (line, must end before)
for line, limit in [("O1", T["type1"] - 0.1), ("O2a", T["toMap"] + 0.4), ("O2b", T["burst"] + 0.9)]:
    end = T[line] + dur[line]
    assert end <= limit, f"{line} ends at {end:.2f}s, after {limit:.2f}s — shorten the line or move the slot"

# the roadshow: each line starts after the previous one plus a gap
ORDER = [("R1", 0.0), ("H1", 0.28), ("R2", 0.12), ("P0", 0.36), ("P1", 0.12), ("H2", 0.22), ("P2", 0.18),
         ("R3", 0.2), ("P3", 0.12), ("O3", 0.55), ("R4", 0.35), ("H3", 0.15), ("P4", 0.15)]
t = T["R1"]
new = {}
for i, (line, gap) in enumerate(ORDER):
    if i:
        t += gap
    new[line] = round(t, 2)
    t += dur[line]
new["cursor"] = round(t + 0.1, 2)
new["click"] = round(new["cursor"] + 0.9, 2)
new["O4"] = round(new["click"] + 1.2, 2)
new["endIn"] = round(max(new["O4"] + dur["O4"] + 0.35, new["click"] + 4.8), 2)
new["end"] = round(new["endIn"] + 5.6, 2)

def fmt(x):
    return ("%.2f" % x).rstrip("0").rstrip(".")

block = core.split("var T = {")[1].split("};")[0]
nb = block
for k, v in new.items():
    nb, n = re.subn(r"\b%s: \d+(?:\.\d+)?" % k, "%s: %s" % (k, fmt(v)), nb)
    assert n == 1, k
core = core.replace(block, nb)
open(core_p, "w", encoding="utf-8").write(core)

T.update(new)
idx_p = os.path.join(ROOT, "index.html")
idx = open(idx_p, encoding="utf-8").read()
for line in dur:
    pat = r'(<audio [^>]*id="vo-%s" [^>]*?)data-start="[0-9.]+" data-duration="[0-9.]+"' % re.escape(line)
    idx, n = re.subn(pat, lambda m: m.group(1) + 'data-start="%s" data-duration="%s"' % (fmt(T[line]), fmt(dur[line] + 0.01)), idx)
    assert n == 1, line
idx = re.sub(r'(id="root" data-composition-id="main" data-start="0" data-duration=")[0-9.]+"', r'\g<1>%s"' % fmt(T["end"]), idx)
idx = re.sub(r'(id="sc-stage" class="clip scene" data-start="31.2" data-duration=")[0-9.]+"', r'\g<1>%s"' % fmt(T["endIn"] + 0.5 - 31.2), idx)
idx = re.sub(r'(id="sc-end" class="clip scene" data-start=")[0-9.]+" data-duration="[0-9.]+"', r'\g<1>%s" data-duration="%s"' % (fmt(T["endIn"]), fmt(T["end"] - T["endIn"])), idx)
idx = re.sub(r'(<audio [^>]*id="bed" [^>]*?data-start="0" data-duration=")[0-9.]+"', r'\g<1>%s"' % fmt(T["end"]), idx)
open(idx_p, "w", encoding="utf-8").write(idx)
print(json.dumps({k: new[k] for k in new}, ensure_ascii=False))
print("film length:", T["end"], "s")
