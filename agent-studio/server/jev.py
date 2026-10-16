"""Performance decisions with TypeSafe Jev (System One model).

One request per utterance: the dialogue state (speaker persona, the line, the
quoted line and who said it, the listeners) plus a fan-out of typed questions —
speaker expression / punchline expression / gesture / body action / gaze /
delivery / stance / bubble style, intensity / drama / persuasion scores, and one
reaction Choice per listener. Criteria text comes from web/data/catalog.json,
the same descriptions the asset tables show.

Without TYPESAFE_API_KEY the same questions are answered by a transparent
keyword baseline, clearly labelled source="baseline" (not Jev).
"""
import json
import math
import os
import re
import time

import httpx

API_URL = "https://api.typesafe.ai/v1/systemone"
MODEL = os.environ.get("TYPESAFE_MODEL", "jev-latest")


def load_catalog(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _crit(item):
    s = f"{item['zh']}：{item['desc']}"
    if item.get("use"):
        s += f" 适用：{item['use']}"
    return s


def _performers(cat, stage):
    """The restaurant owners on stage (not the host, not the customer)."""
    C = cat["characters"]
    ids = stage or [w for w, c in C.items() if c.get("kind") in ("film", "agent")]
    return [w for w in ids if w in C and C[w].get("kind", "film") in ("film", "agent")]


def _mentions(c):
    kw = list(c.get("keywords") or [])
    kw += [c.get("name", ""), c.get("restaurant", "")]
    kw += [x.strip() for x in str(c.get("cuisine", "")).replace("/", "、").split("、")]
    return [k for k in kw if k and len(k) >= 1 and k != "—"]


def build_state(cat, speaker, text, lang, quotes, history, stage=None):
    C = cat["characters"]
    sp = C[speaker]
    user = sp.get("kind") == "user"
    lang_zh = next((l["zh"] for l in cat["languages"] if l["id"] == lang), lang)
    owners = _performers(cat, stage)
    listeners_ids = [w for w in owners if w != speaker]
    qwho = {q.get("who") for q in (quotes or []) if q.get("who")}
    listeners = []
    for w in listeners_ids:
        c = C[w]
        quoted = w in qwho
        named = any(k in text for k in _mentions(c))
        if user:
            relation = "顾客在直接回应他/她" if quoted else ("顾客点名问到了他/她的店" if named else "顾客在说话，他/她在旁边听")
        else:
            relation = "这句话在回应或针对他/她" if quoted else ("这句话提到了他/她的店" if named else "旁观者")
        listeners.append({
            "name": c["name"],
            "restaurant": f"{c['restaurant']}（{c['plate']}）",
            "persona": c["persona"],
            "is_quoted": quoted,
            "targeted": quoted or named,
            "relation": relation,
        })
    who_list = "、".join(f"{C[w]['name']}·{C[w].get('cuisine') or C[w]['restaurant']}" for w in owners)
    state = {
        "scene": f"美食路演直播：{len(owners)} 家餐馆的主理人（{who_list}）同台轮流推销、互相拆台；台下的顾客（「我」）边吃瓜边选今晚去哪吃，"
                 "会直接提问、提要求，也会一次回应好几家。主持智能体「小选」负责收集需求和总结。",
        "style": "夸张外放的喜剧表演：每个反应都要一眼可读。被点名、被揭短的人立刻有强烈反应；旁观者看热闹会笑、会幸灾乐祸；听到对手吹牛会翻白眼；"
                 "顾客提问时被问到的店主会两眼放光、抢着表现；平淡的倾听只在这句话和自己无关时使用。",
        "speaker": {
            "name": sp["name"] if not user else f"{sp['name']}（台下顾客）",
            "restaurant": f"{sp['restaurant']}（{sp['plate']}）" if not user else "—",
            "persona": sp["persona"],
        },
        "line": {"text": text, "language": lang_zh},
        "quoted": None,
        "listeners": listeners,
        "recent_turns": [{"speaker": C[h["who"]]["name"], "text": h["text"]} for h in (history or [])[-4:] if h.get("who") in C],
    }
    qs = [q for q in (quotes or []) if q.get("text")]
    if qs:
        state["quoted"] = [{"speaker": C[q["who"]]["name"] if q.get("who") in C else (q.get("who") or "某人"), "text": q["text"]} for q in qs]
    return state, listeners_ids


def build_questions(cat, speaker, stage):
    user = cat["characters"][speaker].get("kind") == "user"
    ex = {e["id"]: _crit(e) for e in cat["expressions"]}
    punch = dict(ex)
    punch["same"] = "保持开口时的表情，不需要变化。"
    ges = {g["id"]: _crit(g) for g in cat["gestures"]}
    acts = {a["id"]: _crit(a) for a in cat["acts"]}
    react = {r: ex[r] for r in cat["reactions"]}
    who = "`speaker.name`"
    q = {
        "speaker_expr": {"type": "choice", "instructions": f"按照 `style`，{who} 开口说 `line.text` 时，脸上最贴切的表情是哪一个？考虑人设 `speaker.persona`、这句话的情绪，以及它是否在回应 `quoted`。", "criteria": ex},
        "speaker_punch": {"type": "choice", "instructions": f"{who} 说到 `line.text` 的后半句（笑点或重点落下时），表情要切换成哪一个？没有明显转折就选 same。", "criteria": punch},
        "speaker_gesture": {"type": "choice", "instructions": f"{who} 说 `line.text` 时最合适的手势是哪一个？", "criteria": ges},
        "speaker_act": {"type": "choice", "instructions": f"按照 `style`，{who} 说 `line.text` 时配合的身体动作是哪一个？只有平静陈述才选 none。", "criteria": acts},
        "speaker_gaze": {"type": "choice", "instructions": f"{who} 说 `line.text` 时眼睛看向哪里？", "criteria": {
            "quoted": "看向被引用/被回应的人（`quoted` 里的说话人）。",
            "other": "看向台上另一位没被引用的人。",
            "audience": "看向台下观众/镜头，对用户说话。"}},
        "intensity": {"type": "score", "instructions": f"{who} 说 `line.text` 时的情绪强度有多高？", "criteria": [
            "平静：语气平淡，几乎没有情绪起伏", "温和：有一点情绪，轻松自然", "鲜明：情绪明显，带感叹或反问", "爆发：非常激动，大喊、炸毛或狂喜"]},
        "delivery": {"type": "choice", "instructions": f"给 {who} 配音时，`line.text` 用哪种语气说最合适？", "criteria": {d["id"]: d["zh"] for d in cat["deliveries"]}},
        "stance": {"type": "choice", "instructions": f"`line.text` 和被引用的话 `quoted`（可能有好几条）是什么关系？没有引用时通常是自我推销。", "criteria": {s["id"]: f"{s['zh']}：{s['desc']}" for s in cat["stances"]}},
        "bubble": {"type": "choice", "instructions": "头顶对话气泡用哪种样式最能表现这句话？", "criteria": {
            "normal": "普通气泡：正常说话、推销、调侃。", "shout": "大喊气泡：粗边框、微倾斜，用于生气、炸毛、激动反击。", "shaky": "发抖气泡：气泡抖动，用于慌张、心虚、结巴找补。"}},
        "drama": {"type": "score", "instructions": "这句话让台下观众有多想「吃瓜」（火药味/八卦程度）？", "criteria": [
            "没有火药味", "有一点点调侃", "明显的拆台或互怼", "火药味十足、戳中痛点"]},
        "persuasion": {"type": "score", "instructions": f"听完 `line.text`，用户想去 {who} 的店吃饭的心动程度会怎样变化？", "criteria": [
            "下降：这句话让人反感或暴露缺点", "不变：没有提供新的吸引力", "略升：有一点吸引力", "明显上升：卖点很打动人"]},
    }
    if user:
        for k in ("speaker_expr", "speaker_punch", "speaker_gesture", "speaker_act", "speaker_gaze", "persuasion"):
            q.pop(k, None)
    rc = cat.get("reactionCriteria", {})
    react = {r: f"{ex[r].split('：')[0]}：{rc[r]}" if r in rc else ex[r] for r in cat["reactions"]}
    for i, w in enumerate(stage):
        q[f"listener_{w}"] = {
            "type": "choice",
            "instructions": {
                "listener": f"`listeners[{i}]`",
                "question": f"按照 `style`，{who} 说出 `line.text` 时，台上的 `listeners[{i}]`（{cat['characters'][w]['name']}）脸上会立刻露出什么反应？"
                            f"先看 `listeners[{i}].relation` 和 `listeners[{i}].targeted`：被针对的人会震惊、心虚、生气或嘟嘴；旁观者看热闹会大笑、得意笑或翻白眼。",
            },
            "criteria": react,
        }
    return q


def call_jev(api_key, state, questions, timeout=25.0):
    body = {"state": state, "model": MODEL, "questions": questions}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    delay = 0.8
    for attempt in range(3):
        t0 = time.time()
        r = httpx.post(API_URL, json=body, headers=headers, timeout=timeout)
        if r.status_code in (429, 529) and attempt < 2:
            time.sleep(delay)
            delay *= 2
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"Jev HTTP {r.status_code}: {r.text[:400]}")
        data = r.json()
        data["latency_ms"] = round((time.time() - t0) * 1000)
        return data
    raise RuntimeError("Jev: retries exhausted")


# --------------------------------------------------------------- baseline
# Transparent keyword rules: NOT Jev. Used only when no API key is configured
# or the call fails, so the rest of the pipeline stays demonstrable.
KW = {
    "price": r"人均|块|元|¥|百|千|便宜|套餐|划算|实惠|\d",
    "angry": r"你不懂|凭什么|胡说|闭嘴|气死|太吵|什么鬼|艺术|！！|!{2,}",
    "mock": r"哈|笑|喊妈妈|晕|肿|泡面|公仔面|饿|还在|切开|吵",
    "question": r"？|\?|吗|呢|咩|點|点解|仲点",
    "concede": r"算了|好吧|抢先|认输|祝|恭喜|服了|Bon appétit|行吧|啧",
    "nervous": r"那、那|其、其|只要|其实|不过|周末|呃|嗯",
    "romance": r"浪漫|约会|烛光|红酒|拍拖|情侣|露台",
    "pitch": r"来|正宗|新鲜|保证|巴适|好吃|招牌|最|包你|欢迎|嚟",
    "greet": r"你好|晚上好|bonjour|Bonjour|欢迎",
}


def _hits(text):
    return {k: len(re.findall(p, text)) for k, p in KW.items()}


def _softmax(scores, temp=1.0):
    m = max(scores.values())
    ex = {k: math.exp((v - m) / temp) for k, v in scores.items()}
    s = sum(ex.values())
    return {k: v / s for k, v in ex.items()}


def _choice(scores):
    p = _softmax(scores)
    best = max(p, key=p.get)
    n = len(p)
    conf = max(0.0, min(1.0, (n * p[best] - 1) / (n - 1))) if n > 1 else 1.0
    return {"type": "choice", "choice": best, "probabilities": {k: round(v, 4) for k, v in p.items()}, "confidence": round(conf, 3)}


def _score(levels, weights):
    p = _softmax({str(i): w for i, w in enumerate(weights)})
    sc = sum(int(k) * v for k, v in p.items())
    peak = max(p, key=p.get)
    spread = sum(v * abs(int(k) - int(peak)) for k, v in p.items())
    n = len(levels)
    even = sum(abs(i - (n - 1) / 2) for i in range(n)) / n
    return {"type": "score", "score": round(sc, 3), "legend": {str(i): l for i, l in enumerate(levels)},
            "probabilities": {k: round(v, 4) for k, v in p.items()}, "confidence": round(max(0.0, 1 - spread / even), 3)}


def baseline(cat, speaker, text, quotes, questions, stage):
    h = _hits(text)
    quoted = bool(quotes)
    qwho = {q.get("who") for q in (quotes or [])}
    excl = text.count("！") + text.count("!")
    base = {e["id"]: 0.0 for e in cat["expressions"]}
    d = cat["characters"][speaker]["defaults"]
    base[d["expr"]] += 1.2
    base["pitch"] += 1.4 * h["price"] + 0.8 * h["pitch"]
    base["angry"] += 2.2 * h["angry"] + (0.8 if quoted and excl >= 2 else 0)
    base["sly"] += 1.2 * h["mock"] * (1.5 if quoted else 0.6) + 0.6 * h["question"] * quoted
    base["laugh"] += 1.0 * h["mock"]
    base["pout"] += 2.0 * h["concede"]
    base["nervous"] += 1.8 * h["nervous"]
    base["proud"] += 1.4 * h["romance"]
    base["star"] += 1.0 * h["romance"] * (speaker == "rong")
    base["listen"] += 0.3
    expr = _choice(base)
    punch = dict(base)
    punch["same"] = 1.0
    punch["wink"] += 0.9 * h["pitch"] + 0.6 * h["price"]
    punch["laugh"] += 0.8 * h["mock"]
    punch["kiss"] += 1.4 * h["romance"] * (speaker == "pierre")
    ges = {g["id"]: 0.0 for g in cat["gestures"]}
    ges[d["gesture"]] += 1.2
    ges["hip_point"] += 1.6 * h["angry"] + 0.8 * quoted * h["question"]
    ges["point"] += 0.9 * h["mock"] * quoted
    ges["wag"] += 0.8 * h["mock"] * quoted
    ges["thumb"] += 0.9 * h["price"] + 0.5 * h["pitch"]
    ges["present"] += 0.8 * h["romance"] + 0.4 * h["pitch"]
    ges["wave"] += 0.9 * h["greet"]
    ges["handsUp"] += 1.6 * h["nervous"]
    ges["shrug"] += 0.7 * h["concede"]
    ges["bow"] += 0.8 * h["concede"] * (speaker == "pierre")
    ges["hip"] += 0.9 * h["concede"] * (speaker != "pierre")
    acts = {a["id"]: 0.0 for a in cat["acts"]}
    acts["none"] += 0.8
    acts[d["act"]] += 0.6
    acts["stepIn"] += 0.7 * h["pitch"]
    acts["shake"] += 1.6 * h["angry"]
    acts["bounce"] += 0.8 * h["mock"]
    acts["lean"] += 0.7 * quoted * h["mock"]
    acts["shiver"] += 1.4 * h["nervous"]
    acts["bow"] += 0.9 * h["concede"] * (speaker == "pierre")
    acts["puff"] += 0.5 * h["price"]
    gaze = {"quoted": 1.6 if quoted else 0.0, "other": 0.2, "audience": 0.4 + 0.6 * h["pitch"] + 0.6 * h["price"]}
    inten = [1.0, 1.0 + 0.2 * h["pitch"], 0.6 + 0.6 * excl + 0.5 * h["question"], 0.4 * excl + 1.4 * h["angry"]]
    deliv = {x["id"]: 0.0 for x in cat["deliveries"]}
    deliv["neutral"] += 1.0
    deliv["excited"] += 0.7 * h["pitch"] + 0.5 * h["price"] + 0.4 * excl
    deliv["angry"] += 1.6 * h["angry"]
    deliv["mocking"] += 1.0 * h["mock"] * quoted
    deliv["flustered"] += 1.5 * h["nervous"]
    deliv["sad"] += 1.4 * h["concede"]
    stance = {s["id"]: 0.0 for s in cat["stances"]}
    stance["pitch"] += 1.0 + (0 if quoted else 1.5) + 0.4 * h["price"]
    stance["rebut"] += quoted * (1.0 + 0.8 * h["question"] + 0.8 * h["angry"])
    stance["mock"] += quoted * (0.6 + 1.0 * h["mock"])
    stance["defend"] += 1.4 * h["nervous"] + 0.6 * h["angry"] * quoted
    stance["concede"] += 1.6 * h["concede"]
    stance["agree"] += 0.2
    bub = {"normal": 1.2, "shout": 1.8 * h["angry"] + 0.4 * max(0, excl - 1), "shaky": 1.8 * h["nervous"]}
    drama = [1.2 - 0.6 * quoted, 0.8 + 0.3 * h["mock"], quoted * (0.8 + 0.5 * h["mock"] + 0.4 * h["question"]), quoted * (0.6 * h["angry"] + 0.4 * h["mock"])]
    pers = [0.5 * h["angry"] + 0.6 * h["nervous"], 1.0, 0.8 + 0.4 * h["pitch"], 0.4 + 0.8 * h["price"] + 0.6 * h["romance"]]
    ans = {
        "speaker_expr": expr, "speaker_punch": _choice(punch), "speaker_gesture": _choice(ges), "speaker_act": _choice(acts),
        "speaker_gaze": _choice(gaze), "delivery": _choice(deliv), "stance": _choice(stance), "bubble": _choice(bub),
        "intensity": _score(questions["intensity"]["criteria"], inten),
        "drama": _score(questions["drama"]["criteria"], drama),
    }
    if "persuasion" in questions:
        ans["persuasion"] = _score(questions["persuasion"]["criteria"], pers)
    for k in ("speaker_expr", "speaker_punch", "speaker_gesture", "speaker_act", "speaker_gaze"):
        if k not in questions:
            ans.pop(k, None)
    user = cat["characters"][speaker].get("kind") == "user"
    for w in stage:
        is_q = w in qwho
        r = {k: 0.0 for k in cat["reactions"]}
        r[cat["characters"][w]["defaults"]["reaction"]] += 0.8
        r["listen"] += 0.6
        if user:
            named = any(k in text for k in _mentions(cat["characters"][w]))
            r["star"] += 0.9 * (is_q or named) + 0.5 * h["question"]
            r["think"] += 0.6 * h["question"]
            r["sweat"] += 0.8 * (is_q or named) * h["price"]
            r["pout"] += 0.7 * h["concede"]
        elif is_q:
            r["shock"] += 0.8 + 0.6 * h["mock"]
            r["angry"] += 0.4 * h["mock"] + 0.4 * h["question"]
            r["sweat"] += 0.6 * h["question"] + 0.5 * h["price"]
            r["eyeroll"] += 0.2
        else:
            r["laugh"] += 0.7 * h["mock"] * quoted
            r["smug"] += 0.6 * quoted
            r["eyeroll"] += 0.5 * h["pitch"]
            r["think"] += 0.6 * h["romance"]
        ans[f"listener_{w}"] = _choice(r)
    return {"model": "baseline-keywords", "answers": ans, "usage": None, "latency_ms": 0}
