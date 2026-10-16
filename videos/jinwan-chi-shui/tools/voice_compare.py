"""Build the voice comparison set in renders/voice-test/.

- compare.html : one row per line, one player per engine (open via a local server)
- ab_all.mp3   : every line in engine order (current → OmniVoice → CosyVoice3 → cloud),
                 a soft tick between engines and a longer gap between lines
usage: python voice_compare.py
"""
import html
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VT = os.path.join(ROOT, "renders", "voice-test")
ENGINES = [
    ("current", "现用 Kokoro", os.path.join(ROOT, "assets", "voice")),
    ("omni", "OmniVoice", os.path.join(VT, "omni")),
    ("cosy", "Fun-CosyVoice3", os.path.join(VT, "cosy")),
    ("qwen", "Qwen3-TTS 云端", os.path.join(VT, "qwen")),
]
ROWS = [
    ("O1", "选餐助手 · 普通话", "晚上好！今晚想吃点什么？说个感觉就行。"),
    ("R1", "蓉姐 · 四川话", "来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！"),
    ("R3", "蓉姐 · 四川话", "他那个牛排三分熟，切开还在喊妈妈咧！"),
    ("R2angry", "蓉姐 · 生气（情绪指令）", "四个钟？等你汤好，人都饿晕了！"),
    ("H1", "华叔 · 粤语", "辣到个嘴都肿晒，仲点拍拖啊？嚟饮早茶啦，老火汤煲足四个钟！"),
    ("H2", "华叔 · 粤语", "七道菜？人均八百八，食完要食成个月公仔面喎！"),
    ("P0", "Pierre · 法语", "Mon Dieu…"),
    ("P1", "Pierre · 法国口音普通话", "你们太吵了。烛光，红酒，七道菜，这才叫浪漫。"),
    ("P4", "Pierre · 法语", "Bon appétit !"),
]
ALIAS = {("current", "R2angry"): "R2"}


def clip(engine_key, folder, line_id):
    name = ALIAS.get((engine_key, line_id), line_id)
    p = os.path.join(folder, name + ".wav")
    return p if os.path.exists(p) else None


rows_html = []
reel = []
for line_id, who, text in ROWS:
    cells = []
    for key, label, folder in ENGINES:
        p = clip(key, folder, line_id)
        if p:
            rel = os.path.relpath(p, VT)
            cells.append(f'<td><audio controls preload="none" src="{html.escape(rel)}"></audio></td>')
            reel.append(p)
        else:
            cells.append('<td class="na">—</td>')
    reel.append(None)
    rows_html.append(f"<tr><th><b>{html.escape(who)}</b><span>{html.escape(text)}</span></th>{''.join(cells)}</tr>")

head = "".join(f"<th>{html.escape(label)}</th>" for _, label, _ in ENGINES)
page = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>方言配音对比</title><style>
:root{{--bg:#F5EEE3;--ink:#2B1B30;--mut:#6b5a70;--card:#FFFBF4;--line:#e6dac6}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,"PingFang SC",sans-serif;padding:24px}}
h1{{font-size:24px;margin:0 0 4px}} p{{margin:0 0 18px;color:var(--mut)}}
table{{border-collapse:separate;border-spacing:0 10px;width:100%}}
th,td{{background:var(--card);padding:12px 14px;text-align:left;vertical-align:middle}}
thead th{{background:transparent;color:var(--mut);font-weight:600;padding:0 14px}}
tbody th{{border-radius:16px 0 0 16px;width:34%}} tbody td:last-child{{border-radius:0 16px 16px 0}}
tbody th b{{display:block}} tbody th span{{color:var(--mut);font-size:14px}}
audio{{width:100%;min-width:170px}} .na{{color:#b9ab9b;text-align:center}}
</style></head><body><h1>方言配音对比</h1><p>同一句台词，四个引擎各一版。从左到右：现用、OmniVoice、Fun-CosyVoice3、Qwen3-TTS 云端。</p>
<table><thead><tr><th>台词</th>{head}</tr></thead><tbody>{''.join(rows_html)}</tbody></table></body></html>"""
open(os.path.join(VT, "compare.html"), "w", encoding="utf-8").write(page)

# A/B reel: engines back to back per line
tick = os.path.join(VT, "_tick.wav")
gap = os.path.join(VT, "_gap.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1320:duration=0.06", "-af", "afade=t=out:st=0.02:d=0.04,volume=0.25,apad=pad_dur=0.45", "-ar", "48000", "-ac", "1", tick], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "1.2", gap], check=True)
seq = []
for item in reel:
    if item is None:
        seq.append(gap)
    else:
        seq += [tick, item]
inputs = []
for p in seq:
    inputs += ["-i", p]
n = len(seq)
def chain(i):
    base = f"[{i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono"
    if seq[i] in (tick, gap):
        return base + f"[a{i}];"
    return base + f",loudnorm=I=-18:TP=-1.5,aresample=48000[a{i}];"


filt = "".join(chain(i) for i in range(n))
filt += "".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[out]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", filt, "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "3", os.path.join(VT, "ab_all.mp3")], check=True)
print("compare.html + ab_all.mp3 written,", sum(1 for x in reel if x), "clips")
