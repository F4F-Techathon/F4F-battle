"""Mandarin → each character's own way of speaking, via any OpenAI-compatible chat API
(DeepSeek, 通义千问 DashScope compatible mode, OpenAI, …), configured in Settings.

The director always writes 普通话. Before a line is voiced it is rewritten:
  sc   蓉姐  → 四川话口语（巴适、屋头、嘛、噻、咧…），CosyVoice3「请用四川话表达。」
  yue  华叔  → 地道粤语口语（嘅、咗、唔、佢、嚟、喺…），CosyVoice3「请用广东话表达。」
  frzh Pierre → 法国主厨说的中文，自然夹一两个法语词（Mon Dieu、voilà、mon ami…）
  fr   Pierre → 地道法语口语
Few-shot pairs come from the film (tools/lines.json ↔ lines_dialect.json).
"""
import os
import re
import time
from collections import OrderedDict

import httpx

PRESETS = {
    "deepseek": {"name": "DeepSeek", "base_url": "https://api.deepseek.com", "model": "deepseek-chat"},
    "qwen": {"name": "通义千问", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen-plus"},
    "openai": {"name": "OpenAI", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
}

COMMON = "只输出改写后的这一句台词本身，不加引号、不加解释、不加前缀。保留原句的意思、语气、数字和价格，长度与原句相近，适合直接配音。"

TARGETS = {
    "sc": {
        "label": "四川话",
        "gloss": False,
        "system": "你是四川成都的川菜馆老板娘蓉姐的台词编剧。把导演写的普通话台词改写成蓉姐会说的四川话口语："
                  "多用四川话词汇和语气词（屋头、巴适、安逸、啥子、莫得、晓得、要得、嘛、噻、哦、咧、得很），"
                  "但要让普通话观众也能看懂，用普通话汉字书写。" + COMMON,
        "shots": [
            ("来我家吧！正宗川菜，麻辣鲜香，人均才八十五！", "来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！"),
            ("他那份牛排才三分熟，切开还在喊妈妈呢！", "他那个牛排三分熟，切开还在喊妈妈咧！"),
            ("约会？我们有露台包间和鸳鸯锅，不辣也很舒服！", "约会？我们有露台包间，鸳鸯锅，不辣也巴适！"),
        ],
    },
    "yue": {
        "label": "粤语",
        "gloss": True,
        "system": "你是广州粤菜馆老板华叔的台词编剧。把导演写的普通话台词翻译成地道的粤语（广州话）口语，"
                  "用粤语正字书写（嘅、咗、唔、佢、喺、嚟、咩、啲、冇、係、而家、点解、仲、晒、喎、啦）。" + COMMON,
        "shots": [
            ("辣到嘴都肿了，还怎么约会？来饮早茶，老火汤煲足四个钟。", "辣到个嘴都肿晒，仲点拍拖啊？嚟饮早茶啦，老火汤煲足四个钟！"),
            ("七道菜？人均八百八，吃完要吃一个月泡面！", "七道菜？人均八百八，食完要食成个月公仔面喎！"),
            ("啧，又被她抢先了。", "啧，又畀佢抢先咗。"),
        ],
    },
    "frzh": {
        "label": "法式口音普通话",
        "gloss": False,
        "system": "你是法国主厨 Pierre 的台词编剧。他在中国开法餐厅，说中文，优雅、略带戏剧感。"
                  "把导演写的普通话台词改写成 Pierre 会说的中文：主体保持中文，自然地夹一两个法语词或感叹"
                  "（Mon Dieu、voilà、mon ami、mes amis、magnifique、bien sûr、oh là là、c'est la vie），不要每句都用同一个。" + COMMON,
        "shots": [
            ("你们太吵了。烛光，红酒，七道菜，这才叫浪漫。", "Mon Dieu，你们太吵了。烛光，红酒，七道菜，voilà，这才叫浪漫。"),
            ("那叫艺术！你不懂！", "那叫艺术！你不懂，mon ami！"),
            ("那、那是周末！工作日套餐，只要一百九十八！", "那、那是周末！工作日套餐，bien sûr，只要一百九十八！"),
        ],
    },
    "fr": {
        "label": "法语",
        "gloss": True,
        "system": "你是法国主厨 Pierre 的台词编剧。把导演写的普通话台词翻译成自然、口语化的法语，带一点主厨的优雅和戏剧感。" + COMMON,
        "shots": [
            ("我的天哪……", "Mon Dieu…"),
            ("祝你们用餐愉快！", "Bon appétit !"),
            ("那叫艺术！你不懂！", "C'est de l'art ! Tu n'y comprends rien !"),
        ],
    },
}


# one foreign word or interjection per line — enough to colour it, never a translation
ACCENT_SHOTS = {
    "ja": [("欢迎光临！今天的金枪鱼特别新鲜，快来尝尝。", "欢迎光临！今天的金枪鱼，非常新鲜哟，快来尝尝，ね！"),
           ("太贵了？这可是主厨十年的手艺！", "太贵了？这可是主厨十年的手艺，すごい！")],
    "ko": [("欢迎光临！今天的烤肉特别好吃。", "欢迎光临！今天的烤肉，真的特别好吃哟，진짜！"),
           ("我们家的炸鸡是全城最脆的。", "我们家的炸鸡，是全城最脆的，대박！")],
    "en": [("我们的汉堡是全城最好吃的。", "我们的汉堡，绝对是全城最好吃的，trust me！"),
           ("牛排要几分熟？", "牛排要几分熟，my friend？")],
    "it": [("这个披萨是用柴火窑烤的。", "Mamma mia，这个披萨是用柴火窑烤的！"),
           ("提拉米苏是我奶奶的配方。", "提拉米苏是我奶奶的配方，perfetto！")],
    "es": [("海鲜饭马上就好。", "海鲜饭马上就好，amigo！"), ("今晚的塔帕斯随便点。", "¡Olé！今晚的塔帕斯随便点！")],
    "de": [("我们的香肠和啤酒都是最正宗的。", "我们的香肠和啤酒，都是最正宗的，sehr gut！"), ("猪肘要等二十分钟。", "猪肘要等二十分钟，genau。")],
    "ru": [("今天的罗宋汤特别香。", "今天的罗宋汤，特别香，хорошо！"), ("列巴是刚出炉的。", "列巴是刚出炉的，да！")],
}


def generic_target(lang_cfg):
    """Every other language in the catalog: a Chinese dialect (CosyVoice3 instruct) or a
    foreign chef speaking Mandarin (cross-lingual accent)."""
    zh = lang_cfg["zh"]
    if lang_cfg["cosy"].get("accent"):
        nation, lname = lang_cfg.get("nation", "外国"), lang_cfg.get("langName", "母语")
        return {"label": zh, "gloss": False,
                "system": f"你是一位来自{nation}、在中国开店的店主的台词编剧。他/她说中文，句子简单直接，带着{nation}人的说话习惯。"
                          f"把导演写的普通话台词改写成他/她会说的中文：整句仍是中文，最多夹一个常见的{lname}词或感叹，"
                          "不要每句都用同一个，绝不能把整句或半句翻译成外语。" + COMMON,
                "shots": ACCENT_SHOTS.get(lang_cfg["cosy"]["accent"], [])}
    return {"label": zh, "gloss": False,
            "system": f"你是一位{zh}地区餐馆店主的台词编剧。把导演写的普通话台词改写成地道的{zh}口语："
                      f"适当使用{zh}的常用词汇和语气词，但要让普通话观众也能看懂，用普通话汉字书写。" + COMMON,
            "shots": []}


class Localizer:
    def __init__(self, catalog=None):
        self.cache = OrderedDict()
        self.catalog = catalog
        self.targets = dict(TARGETS)
        for l in (catalog or {}).get("languages", []):
            if l["id"] not in self.targets and l["id"] != "zh":
                self.targets[l["id"]] = generic_target(l)

    def config(self):
        return {"base_url": os.environ.get("LLM_BASE_URL", "").strip().rstrip("/"), "model": os.environ.get("LLM_MODEL", "").strip(),
                "key": os.environ.get("LLM_API_KEY", "").strip()}

    def configured(self):
        c = self.config()
        return bool(c["base_url"] and c["model"] and c["key"])

    def needs(self, lang):
        return lang in self.targets

    def localize(self, text, lang, timeout=20.0):
        """→ {text, src, gloss, lang, engine, model, ms, cached, note?}"""
        src = text.strip()
        base = {"src": src, "lang": lang, "gloss": None}
        if lang not in self.targets:
            return {**base, "text": src, "engine": "none", "model": None, "ms": 0, "cached": False}
        t = self.targets[lang]
        if not self.configured():
            return {**base, "text": src, "engine": "none", "model": None, "ms": 0, "cached": False,
                    "note": "未配置改写模型，按原文配音"}
        k = (lang, src)
        if k in self.cache:
            self.cache.move_to_end(k)
            return {**self.cache[k], "cached": True, "ms": 0}
        c = self.config()
        msgs = [{"role": "system", "content": t["system"]}]
        for a, b in t["shots"]:
            msgs += [{"role": "user", "content": a}, {"role": "assistant", "content": b}]
        msgs.append({"role": "user", "content": src})
        t0 = time.time()
        r = httpx.post(c["base_url"] + "/chat/completions", headers={"Authorization": f"Bearer {c['key']}", "Content-Type": "application/json"},
                       json={"model": c["model"], "messages": msgs, "temperature": 0.3, "max_tokens": 300, "stream": False}, timeout=timeout)
        if r.status_code >= 400:
            raise RuntimeError(f"LLM HTTP {r.status_code}: {r.text[:300]}")
        out = clean(r.json()["choices"][0]["message"]["content"], t["label"])
        if not out or len(out) > max(60, len(src) * 4):
            out, note = src, "改写结果异常，按原文配音"
        else:
            note = None
        res = {**base, "text": out, "gloss": src if t["gloss"] and out != src else None, "engine": "llm", "model": c["model"],
               "ms": round((time.time() - t0) * 1000), "cached": False}
        if note:
            res["note"] = note
        else:
            self.cache[k] = res
            while len(self.cache) > 2000:
                self.cache.popitem(last=False)
        return res


def clean(s, label):
    s = (s or "").strip()
    s = re.sub(r"^<think>.*?</think>", "", s, flags=re.S).strip()
    s = s.splitlines()[0].strip() if s else s
    s = re.sub(r"^(" + re.escape(label) + r"|粤语|四川话|法语|改写|译文|台词|Pierre|蓉姐|华叔)\s*[:：]\s*", "", s)
    if len(s) >= 2 and s[0] in "「“\"'『" and s[-1] in "」”\"'』":
        s = s[1:-1].strip()
    return s
