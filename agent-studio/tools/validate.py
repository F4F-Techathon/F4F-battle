"""Score Jev against scene-stage.js choreography (same check as the 系统 page)."""
import json, urllib.request
src = open(r"D:\projects\techthon\videos\jinwan-chi-shui\assets\js\lipsync.js", encoding="utf-8").read()
L = json.loads(src[src.index("{"): src.rindex("}") + 1])
T = {
 "R1": (None, "pitch", "hip_one", "stepIn", {"hua": "eyeroll", "pierre": "haughty"}),
 "H1": ("R1", "sly", "wag", "lean", {"rong": "shock", "pierre": "smug"}),
 "R2": ("H1", "angry", "hip_point", "shake", {"hua": "sweat", "pierre": "laugh"}),
 "P0": ("R2", "haughty", "shrug", "none", {"rong": "eyeroll", "hua": "eyeroll"}),
 "P1": ("R2", "proud", "present", "none", {"rong": "think", "hua": "sly"}),
 "H2": ("P1", "laugh", "point", "bounce", {"pierre": "shock", "rong": "laugh"}),
 "P2": ("H2", "nervous", "handsUp", "shiver", {"hua": "smug", "rong": "sly"}),
 "R3": ("P2", "sly", "hip_point", "none", {"pierre": "shock", "hua": "squeal"}),
 "P3": ("R3", "angry", "hip_point", "shake", {"rong": "smug", "hua": "laugh"}),
 "O3": (None, None, None, None, {"rong": "think", "hua": "think", "pierre": "think"}),
 "R4": ("O3", "star", "wave", "stepIn", {"hua": "eyeroll", "pierre": "pout"}),
 "H3": ("R4", "pout", "hip", "none", {}),
 "P4": ("R4", "kiss", "bow", "bow", {}),
}
sc = {k: [0, 0, 0] for k in ("expr", "gesture", "act", "listener")}
hist = []
def judge(a, truth, k):
    if not truth or not a: return
    top3 = [x for x, _ in sorted(a["probabilities"].items(), key=lambda x: -x[1])[:3]]
    sc[k][0] += a["choice"] == truth; sc[k][1] += truth in top3; sc[k][2] += 1
for id, (q, e, g, a, lis) in T.items():
    l = L[id]
    lang = "yue" if l.get("lang") == "yue" else "fr" if l.get("lang") == "fr" else {"rong": "sc", "pierre": "frzh"}.get(l["who"], "zh")
    body = {"speaker": l["who"], "text": l["text"], "lang": lang, "quotes": [{"who": L[q]["who"], "text": L[q]["text"]}] if q else [], "history": hist[-4:],
            "stage": ["rong", "hua", "pierre"]}  # the film's own cast, whatever agents were added since
    r = json.load(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8770/api/decide", data=json.dumps(body, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})))
    hist.append({"who": l["who"], "text": l["text"]})
    A = r["response"]["answers"]
    judge(A.get("speaker_expr"), e, "expr"); judge(A.get("speaker_gesture"), g, "gesture"); judge(A.get("speaker_act"), a, "act")
    for w, t in lis.items():
        judge(A.get("listener_" + w), t, "listener")
    print(id, r["source"], r["response"].get("latency_ms"), "ms", {w: A["listener_" + w]["choice"] for w in lis}, flush=True)
for k, (a, b, n) in sc.items():
    print(f"{k:9s} top1 {a}/{n} = {a/n:.0%}   top3 {b}/{n} = {b/n:.0%}")
