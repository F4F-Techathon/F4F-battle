"""Restaurant agents generated from a shop's info + logo, on the film's asset contract.

A generated agent is a catalog character — the same fields the film's three owners
have (name, restaurant, plate, language, persona, defaults …) — plus
  rig        a rigkit look: body template × hair × outfit × hat × accessories, a theme
             colour, and the shop logo printed on the chest badge (web/js/rigkit.js)
  voice      a timbre template (server/voices.py) and a speed; the accent comes from
             `language` (CosyVoice3 dialect instruction, or a foreign-language prompt)
  decisions  the Jev answers behind every part, with their probabilities.

Four steps in order, each one Jev request whose state carries the earlier answers:
  形象 look    gender · age · build · hair · outfit · hat · personality · accessories
  口音 accent  which catalog language the owner speaks (cuisine → region)
  组件 assets  signature expression / punchline / gesture / act / listener reaction and
               energy; every expression, gesture, act, viseme and fx of the film rig
               then works on the new character unchanged
  声音 voice   timbre (only the chosen gender is offered) and speed; the voice is then
               warmed up — a foreign accent builds its prompt clip, the greeting is
               pre-synthesised.
Without TYPESAFE_API_KEY (or when a call fails) a step falls back to transparent
keyword rules, labelled source="rules".
"""
import hashlib
import json
import os
import re
import time

from . import jev
from .voices import TIMBRES

RESERVED = {"rong", "hua", "pierre", "orb", "me"}
MAX_LOGO = 400_000  # characters of data URL

HAIRS = {
    "female": {"bun": "高发髻：干练的传统老板娘", "bob": "齐耳短发：利落、文艺", "long": "披肩长发：温柔、精致", "ponytail": "马尾：年轻、有活力"},
    "male": {"side": "侧分短发：稳重的中年老板", "crew": "寸头：干脆、实在的手艺人", "curly": "卷发：随性的外国主厨或文艺青年", "bald": "光头：豪爽的老师傅"},
}
HAIR_ZH = {"bun": "高发髻", "bob": "齐耳短发", "long": "披肩长发", "ponytail": "马尾", "side": "侧分短发", "crew": "寸头", "curly": "卷发", "bald": "光头"}
BUILDS = {"short": "娇小或矮壮：亲切、接地气", "regular": "标准身材", "tall": "高挑或高大：气场强、精致"}
BODY = {("female", "short"): "f_petite", ("female", "regular"): "f_regular", ("female", "tall"): "f_tall",
        ("male", "short"): "m_round", ("male", "regular"): "m_regular", ("male", "tall"): "m_tall"}
OUTFITS = {"jacket": "盘扣短褂 + 半身围裙：川湘家常、江湖小馆、火锅、烧烤", "tang": "立领唐装 + 长围裙：粤式茶楼、老字号、中式传统菜",
           "chef": "双排扣厨师服 + 领巾：西餐、法餐、日料、精致餐厅的主厨", "shirt": "衬衫 + 背带围裙：咖啡、甜品、简餐、快餐、新派小店"}
OUTFIT_ZH = {"jacket": "盘扣短褂配半身围裙", "tang": "立领唐装配长围裙", "chef": "双排扣厨师服配领巾", "shirt": "衬衫配背带围裙"}
HATS = {"none": "不戴帽：老板/老板娘亲自在前厅招呼客人", "toque": "高厨师帽：西式大厨、精致料理", "cap": "厨师小帽：后厨师傅、面点、包子",
        "bandana": "包头巾：日料、拉面、大排档、烧烤摊"}
HAT_ZH = {"none": "", "toque": "高厨师帽", "cap": "厨师小帽", "bandana": "包头巾"}
PERSONALITY = {
    "fiery": "热情泼辣：嗓门大、直来直去，被质疑立刻回怼",
    "calm": "温和笃定：慢条斯理，爱用事实和反问",
    "refined": "精致讲究：优雅克制，自视甚高，偶尔戏剧化",
    "honest": "憨厚实在：朴实、实诚，量大价低",
    "cute": "俏皮可爱：活泼、爱撒娇、爱比心",
    "bold": "豪爽大气：江湖气、讲义气、请客不眨眼",
    "shy": "文艺腼腆：安静、慢热，一说起菜就两眼放光",
    "pro": "严谨专业：讲究火候和食材，像个匠人",
}
# persona → film-style defaults (expr, punch, gesture, act, reaction) for the rules fallback
STYLE = {
    "fiery": ("pitch", "wink", "hip_one", "stepIn", "eyeroll"), "calm": ("sly", "smug", "wag", "lean", "smug"),
    "refined": ("proud", "kiss", "present", "none", "haughty"), "honest": ("pitch", "laugh", "thumb", "nod", "laugh"),
    "cute": ("star", "wink", "cheer", "bounce", "squeal"), "bold": ("laugh", "proud", "thumb", "puff", "laugh"),
    "shy": ("think", "star", "clasp", "none", "nervous"), "pro": ("proud", "smug", "present", "nod", "think"),
}
PALETTE = [("red", "#C9483E", "中国红"), ("orange", "#D9822B", "橙"), ("turmeric", "#D8A93B", "姜黄"), ("olive", "#6B8E3A", "橄榄绿"),
           ("jade", "#2F6E62", "玉石绿"), ("lake", "#2F7DD1", "湖蓝"), ("navy", "#2D3E6B", "藏青"), ("plum", "#7A5A9E", "梅子紫"),
           ("coffee", "#8B5A3C", "咖啡"), ("rose", "#C2185B", "玫红"), ("ink", "#3A3540", "墨黑")]
NAMED = PALETTE + [("white", "#F4F1EA", "白"), ("black", "#1A1A1A", "黑"), ("grey", "#8A8A8A", "灰"), ("gold", "#C9A44C", "金"),
                   ("green", "#3E9B4F", "绿"), ("blue", "#1F5FBF", "蓝"), ("pink", "#E58BA6", "粉")]
TIMBRE_DESC = {"f_young": "二三十岁，明亮大方", "f_girl": "二十出头，清甜俏皮", "f_mid": "中年老板娘，爽朗有劲", "f_old": "阿姨或婆婆，慈和温暖",
               "m_young": "二三十岁，清朗有活力", "m_mid": "中年老板，浑厚稳重", "m_old": "老师傅或老爷子，沙哑沧桑", "m_fr": "年轻主厨，优雅略带戏剧感"}
SURNAMES = "陈王李张刘杨黄赵周吴林何郭罗梁"
FOREIGN_NAMES = {"ja": ("由美", "健太"), "ko": ("智恩", "敏俊"), "en": ("Emma", "Tom"), "it": ("Giulia", "Marco"), "es": ("Lucía", "Carlos"),
                 "de": ("Anna", "Hans"), "ru": ("Natasha", "Ivan"), "fr": ("Camille", "Louis")}
# keyword rules for the accent when Jev is not configured (Jev reads each language's `region`)
ACCENT_KEYS = {
    "sc": "川|蜀|重庆|成都|火锅|串串|冒菜|麻辣|钵钵鸡|兔头", "yue": "粤|广式|广东|港式|早茶|茶餐厅|烧腊|煲仔|点心|潮汕|顺德|叉烧|茶楼",
    "hunan": "湘|湖南|长沙|剁椒|臭豆腐", "dongbei": "东北|锅包肉|铁锅炖|哈尔滨|沈阳|酸菜", "henan": "河南|豫|烩面|胡辣汤|郑州",
    "hubei": "湖北|武汉|热干面|鄂|小龙虾", "jiangxi": "江西|赣|南昌|瓦罐|米粉", "minnan": "闽|福建|厦门|台湾|沙茶|土笋|泉州",
    "shaanxi": "陕西|西安|肉夹馍|泡馍|凉皮|油泼面", "shanxi": "山西|晋|刀削面|太原", "shandong": "鲁|山东|青岛|煎饼|济南",
    "shanghai": "本帮|上海|沪|生煎|小笼|杭帮|江浙|苏帮|淮扬", "tianjin": "天津|狗不理|煎饼果子", "yunnan": "云南|滇|米线|菌|昆明|傣",
    "guizhou": "贵州|黔|酸汤|丝娃娃|贵阳", "gansu": "兰州|甘肃|牛肉面", "ningxia": "宁夏|清真|手抓羊肉|银川",
    "jazh": "日料|日本|寿司|刺身|居酒屋|烧鸟|鮨|和牛|天妇罗|丼|日式", "kozh": "韩|朝鲜|部队锅|拌饭|泡菜|韩式",
    "enzh": "美式|汉堡|牛排|英式|下午茶|burger|BBQ|炸鱼", "itzh": "意大利|意式|披萨|pizza|意面|pasta|提拉米苏",
    "eszh": "西班牙|海鲜饭|塔帕斯|墨西哥|taco", "dezh": "德国|德式|香肠|啤酒屋|猪肘", "ruzh": "俄|罗宋汤|列巴|格鲁吉亚",
    "frzh": "法餐|法式|法国|bistro|鹅肝|马卡龙|可颂",
}
FIELDS = [("name", r"店名|名称|餐厅名?|店铺|门店"), ("cuisine", r"菜系|品类|类型|类别"), ("price", r"人均|价格|客单价|消费"),
          ("distance", r"距离"), ("dishes", r"招牌菜?|特色菜|推荐菜|必点|主打"), ("selling", r"卖点|亮点|特色|优势|口号"),
          ("owner", r"店主|老板娘|老板|主厨|厨师长|掌柜|负责人"), ("address", r"地址|位置"), ("desc", r"简介|介绍|描述|故事")]
STEPS = [("look", "形象"), ("accent", "口音"), ("assets", "组件"), ("voice", "声音")]


# ------------------------------------------------------------------ helpers
def _h(s):
    return int(hashlib.sha1(s.encode("utf-8")).hexdigest(), 16)


def _rgb(hexs):
    n = int(hexs.lstrip("#")[:6], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def _hex(r, g, b):
    return "#" + "".join(f"{max(0, min(255, round(v))):02X}" for v in (r, g, b))


def _luma(hexs):
    r, g, b = _rgb(hexs)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def _shade(hexs, k):
    r, g, b = _rgb(hexs)
    if k < 0:
        return _hex(r * (1 + k), g * (1 + k), b * (1 + k))
    return _hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)


def colour_name(hexs):
    r, g, b = _rgb(hexs)
    return min(NAMED, key=lambda c: sum((x - y) ** 2 for x, y in zip(_rgb(c[1]), (r, g, b))))[2]


def _edge(theme):
    """Identity colour for the dark UI: the theme, lifted until it reads on #111."""
    e = theme
    for _ in range(4):
        if _luma(e) >= 0.42:
            break
        e = _shade(e, 0.28)
    return _shade(e, -0.12) if _luma(e) > 0.82 else e


def one(choice, p=None):
    return {"type": "choice", "choice": choice, "probabilities": p or {choice: 1.0}, "confidence": 1.0}


def pick(ans, key, allowed=None, default=None):
    """The answer to `key`, or — when `allowed` is given — the most probable allowed option."""
    a = (ans or {}).get(key) or {}
    if allowed is None:
        return a.get("choice", default)
    probs = {k: v for k, v in (a.get("probabilities") or {}).items() if k in allowed}
    if probs:
        return max(probs, key=probs.get)
    return a.get("choice") if a.get("choice") in allowed else default


def parse_shop(text):
    """Free text or `键：值` lines → structured shop info."""
    shop = {k: "" for k, _ in FIELDS}
    rest = []
    lines = [l.strip() for l in re.split(r"[\r\n]+", text or "") if l.strip()]
    for line in lines:
        m = re.match(r"^\s*([^:：]{1,8})\s*[:：]\s*(.+)$", line)
        hit = False
        if m:
            for k, pat in FIELDS:
                if re.fullmatch(f"(?:{pat})", m.group(1).strip()):
                    shop[k] = (shop[k] + "；" if shop[k] else "") + m.group(2).strip()
                    hit = True
                    break
        if not hit:
            rest.append(line)
    if not shop["name"] and rest:
        if len(rest[0]) <= 20 and not re.search(r"[，。,.!！?？]", rest[0]):
            shop["name"] = rest.pop(0)
        else:  # 「老北京炸酱面馆，百年老字号，…」: the opening clause names the shop
            head = re.split(r"[，。,.!！?？；;]", rest[0])[0].strip()
            if 2 <= len(head) <= 14:
                shop["name"] = head
    if rest:
        shop["desc"] = "；".join(([shop["desc"]] if shop["desc"] else []) + rest)
    blob = " ".join(lines)
    m = re.search(r"(\d+(?:\.\d+)?)", shop["price"]) or re.search(r"人均\s*[¥￥]?\s*(\d+(?:\.\d+)?)", blob) or re.search(r"[¥￥]\s*(\d+)", blob)
    shop["price"] = int(float(m.group(1))) if m else None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:km|KM|公里|千米)", shop["distance"] or blob)
    m2 = re.search(r"(\d+)\s*米", shop["distance"] or blob)
    shop["distance"] = round(float(m.group(1)), 1) if m else round(int(m2.group(1)) / 1000, 1) if m2 else None
    shop["name"] = shop["name"][:24]
    return shop


def _owner_name(owner):
    o = re.sub(r"[（(].*?[)）]", "", owner or "").strip()
    o = re.split(r"[，,、；;/ ]", o)[0] if o else ""
    return o[:8]


# ------------------------------------------------------------------ store
class AgentStore:
    def __init__(self, folder, catalog, engine, voices, localizer):
        self.dir = folder
        os.makedirs(folder, exist_ok=True)
        self.cat = catalog
        self.engine = engine
        self.voices = voices
        self.lz = localizer
        self.langs = {l["id"]: l for l in catalog["languages"]}

    # ---------------------------------------------------------- persistence
    def load(self):
        n = 0
        for f in sorted(os.listdir(self.dir)):
            if not f.endswith(".json"):
                continue
            try:
                with open(os.path.join(self.dir, f), encoding="utf-8") as fh:
                    c = json.load(fh)
            except Exception:
                continue
            if c.get("id") == "me":
                self._register_me(c)
            elif c.get("kind") == "agent" and c.get("id") and c["id"] not in RESERVED:
                self.register(c)
                n += 1
        if "me" not in self.cat["characters"]:
            self._register_me({})
        return n

    def _save(self, c):
        p = os.path.join(self.dir, c["id"] + ".json")
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(c, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, p)

    def register(self, c):
        self.cat["characters"][c["id"]] = c
        self.engine.agents[c["id"]] = dict(c["voice"])

    def list(self):
        return [c for c in self.cat["characters"].values() if c.get("kind") == "agent"]

    def delete(self, aid):
        if aid in RESERVED or self.cat["characters"].get(aid, {}).get("kind") != "agent":
            return False
        self.cat["characters"].pop(aid, None)
        self.engine.agents.pop(aid, None)
        p = os.path.join(self.dir, aid + ".json")
        if os.path.isfile(p):
            os.remove(p)
        return True

    # ---------------------------------------------------------- 我
    def _register_me(self, saved):
        me = {"id": "me", "kind": "user", "name": "我", "fullName": "我 · 台下顾客", "restaurant": "—", "plate": "台下顾客 · 今晚吃啥",
              "language": "zh", "edge": "#D9B77F", "keywords": ["我", "顾客", "客人", "你们"],
              "persona": "台下的顾客（用户本人），正在纠结今晚吃什么：会提问、提要求、吐槽，也会一次回应好几家店。",
              "voiceDesc": "不配音（可选音色）", "look": "台下观众席，无舞台形象。", "signature": "提问、点名、一次回复多家。",
              "defaults": {"expr": "idle", "gesture": "rest", "act": "none", "reaction": "listen"}, "voice": {"timbre": None, "speed": 1.0}}
        if saved.get("name"):
            me["name"] = str(saved["name"])[:8]
        t = (saved.get("voice") or {}).get("timbre")
        if t and any(x["id"] == t for x in TIMBRES):
            me["voice"] = {"timbre": t, "speed": 1.0}
            me["voiceDesc"] = "普通话 · " + next(x["zh"] for x in TIMBRES if x["id"] == t)
        self.cat["characters"]["me"] = me
        if me["voice"]["timbre"]:
            self.engine.agents["me"] = dict(me["voice"])
        else:
            self.engine.agents.pop("me", None)
        return me

    def set_me(self, name=None, timbre=None):
        cur = self.cat["characters"].get("me", {})
        saved = {"id": "me", "name": name if name is not None else cur.get("name"), "voice": {"timbre": timbre if timbre is not None else (cur.get("voice") or {}).get("timbre")}}
        if saved["voice"]["timbre"] == "":
            saved["voice"]["timbre"] = None
        me = self._register_me(saved)
        self._save({"id": "me", "kind": "user", "name": me["name"], "voice": me["voice"]})
        return me

    # ---------------------------------------------------------- Jev steps
    def _ask(self, key, state, questions, rules):
        t0 = time.time()
        note = None
        if key:
            try:
                r = jev.call_jev(key, state, questions, timeout=25.0)
                return {"source": "jev", "model": r.get("model"), "ms": r.get("latency_ms"), "answers": r.get("answers", {}),
                        "questions": list(questions)}, None
            except Exception as e:
                note = f"Jev 调用失败，改用规则：{str(e)[:160]}"
        return {"source": "rules", "model": "keyword-rules", "ms": round((time.time() - t0) * 1000), "answers": rules(),
                "questions": list(questions)}, note

    def generate(self, text, logo=None, colors=None, key=""):
        """Yields progress events; the last one is {"type": "done", "agent": contract}."""
        shop = parse_shop(text)
        if not shop["name"]:
            raise ValueError("没有识别到店名：第一行写店名，或写「店名：…」")
        aid = "a" + hashlib.sha1(shop["name"].encode("utf-8")).hexdigest()[:6]
        if logo and (not logo.startswith("data:image/") or len(logo) > MAX_LOGO):
            logo = None
        cols = [c for c in (colors or []) if isinstance(c, dict) and re.fullmatch(r"#[0-9A-Fa-f]{6}", str(c.get("hex", "")))][:4]
        blob = " ".join(str(v) for v in shop.values() if v)
        seed = _h(shop["name"])
        shop_state = {k: v for k, v in {"name": shop["name"], "cuisine": shop["cuisine"], "price_per_person": shop["price"], "distance_km": shop["distance"],
                                         "signature_dishes": shop["dishes"], "selling_points": shop["selling"], "owner": shop["owner"],
                                         "address": shop["address"], "description": shop["desc"]}.items() if v not in ("", None)}
        state = {"task": "为一家餐馆设计在美食路演直播里替店铺推销的卡通店主（智能体），与蓉姐（川菜）、华叔（粤菜）、Pierre（法餐）同台。", "shop": shop_state}
        if cols:
            state["logo"] = {"colors": [f"{colour_name(c['hex'])} {c['hex'].upper()}（占 {round(float(c.get('share', 0)) * 100)}%）" for c in cols]}
        yield {"type": "start", "id": aid, "shop": shop, "steps": [s for s, _ in STEPS]}
        decisions = {}

        # ---- 1 形象
        yield {"type": "step", "step": "look", "status": "run"}
        q = {
            "gender": {"type": "choice", "instructions": "根据 `shop`（店主称呼、店名、简介里的线索），这家店出镜推销的店主是男是女？没有明显线索时按店铺气质判断。",
                       "criteria": {"female": "女性：老板娘、阿姨、姐、妹、婆婆、女主厨", "male": "男性：老板、师傅、叔、哥、大爷、男主厨"}},
            "age": {"type": "choice", "instructions": "店主大概多大年纪？",
                    "criteria": {"young": "20–30 岁：新派、网红、年轻人创业的小店", "middle": "35–50 岁：经营多年的老板/老板娘", "old": "55 岁以上：老字号、祖传手艺、几十年的老店"}},
            "build": {"type": "choice", "instructions": "这位卡通店主的身材？", "criteria": BUILDS},
            "hair_female": {"type": "choice", "instructions": "如果店主是女性，最适合她的发型？", "criteria": HAIRS["female"]},
            "hair_male": {"type": "choice", "instructions": "如果店主是男性，最适合他的发型？", "criteria": HAIRS["male"]},
            "outfit": {"type": "choice", "instructions": "店主的服装？看菜系和店铺档次。", "criteria": OUTFITS},
            "hat": {"type": "choice", "instructions": "店主戴什么帽子？", "criteria": HATS},
            "personality": {"type": "choice", "instructions": "在直播里推销时，店主是什么性格？参考 `shop` 的卖点、店名和语气。", "criteria": PERSONALITY},
            "glasses": {"type": "noul", "instructions": "店主戴眼镜吗？（只有斯文、文艺、精打细算或老学究的形象才戴）"},
            "mustache": {"type": "noul", "instructions": "如果店主是男性，他留小胡子吗？（法式大厨、老师傅、江湖气的老板才留）"},
            "earrings": {"type": "noul", "instructions": "如果店主是女性，她戴耳环吗？（时髦、精致或热情的老板娘才戴）"},
        }
        if not cols:
            q["palette"] = {"type": "choice", "instructions": "店主服装和胸牌的主题色？要和菜系、店名的气质相配。", "criteria": {i: zh for i, _, zh in PALETTE}}

        def rules_look():
            t = blob
            fem = len(re.findall(r"老板娘|阿姨|姐|妹|婆|奶奶|女士|小姐|妈|姑|嫂", t))
            mal = len(re.findall(r"叔|哥|爷|伯|师傅|先生|老爹|大哥|爸|兄弟", t))
            g = "female" if fem > mal else "male" if mal > fem else ("female" if seed % 2 else "male")
            age = "old" if re.search(r"老字号|祖传|百年|传承|几十年|阿婆|老爷子|奶奶|爷爷|婆婆", t) else "young" if re.search(r"网红|新派|创意|打卡|年轻|小哥|小妹|潮", t) else "middle"
            outfit = ("chef" if re.search(r"法|意|西餐|牛排|日料|寿司|鮨|精致|fine", t) else "tang" if re.search(r"粤|茶楼|早茶|老字号|传统|宫廷", t)
                      else "jacket" if re.search(r"川|湘|火锅|烧烤|东北|江湖|麻辣|串", t) else "shirt" if re.search(r"咖啡|甜品|简餐|快餐|面包|奶茶|轻食|汉堡", t)
                      else ["jacket", "tang", "shirt"][seed % 3])
            hat = "toque" if outfit == "chef" and re.search(r"法|西餐|牛排|意", t) else "bandana" if re.search(r"日料|拉面|寿司|大排档|烧烤|鮨", t) else "cap" if re.search(r"面点|包子|饺子|面馆", t) else "none"
            pers = ("cute" if age == "young" and g == "female" else "refined" if outfit == "chef" else "fiery" if re.search(r"川|湘|麻辣|火锅", t)
                    else "calm" if re.search(r"粤|茶|汤", t) else "honest" if re.search(r"实惠|量大|便宜|家常", t) else list(PERSONALITY)[seed % len(PERSONALITY)])
            ans = {"gender": one(g), "age": one(age), "build": one(["short", "regular", "tall"][(seed >> 3) % 3]),
                   "hair_female": one(list(HAIRS["female"])[(seed >> 5) % 4]), "hair_male": one(list(HAIRS["male"])[(seed >> 5) % 4]),
                   "outfit": one(outfit), "hat": one(hat), "personality": one(pers),
                   "glasses": {"type": "noul", "noul": 0.7 if re.search(r"文艺|书|咖啡|精打细算", t) else 0.1},
                   "mustache": {"type": "noul", "noul": 0.7 if outfit == "chef" or age == "old" else 0.15},
                   "earrings": {"type": "noul", "noul": 0.6 if pers in ("fiery", "cute", "refined") else 0.2}}
            if not cols:
                pal = ("red" if re.search(r"川|湘|火锅|麻辣|红", t) else "jade" if re.search(r"粤|茶|绿", t) else "navy" if re.search(r"日料|寿司|鮨", t)
                       else "plum" if re.search(r"法|红酒", t) else "olive" if re.search(r"意|素|轻食", t) else "orange" if re.search(r"东北|烧烤|炸", t)
                       else PALETTE[seed % len(PALETTE)][0])
                ans["palette"] = one(pal)
            return ans

        d, note = self._ask(key, state, q, rules_look)
        A = d["answers"]
        gender = pick(A, "gender", ["female", "male"], "female")
        age = pick(A, "age", ["young", "middle", "old"], "middle")
        build = pick(A, "build", list(BUILDS), "regular")
        hair = pick(A, "hair_" + gender, list(HAIRS[gender]), list(HAIRS[gender])[0])
        outfit = pick(A, "outfit", list(OUTFITS), "jacket")
        hat = pick(A, "hat", list(HATS), "none")
        pers = pick(A, "personality", list(PERSONALITY), "fiery")
        noul = lambda k: float(((A.get(k) or {}).get("noul")) or 0)
        acc = []
        if noul("glasses") >= 0.5:
            acc.append("glasses")
        if gender == "male" and noul("mustache") >= 0.5:
            acc.append("mustache")
        if gender == "female" and noul("earrings") >= 0.5:
            acc.append("earrings")
        if cols:
            theme = cols[0]["hex"].upper()
            theme_src = f"logo 主色 · {colour_name(theme)}"
        else:
            pid = pick(A, "palette", [p[0] for p in PALETTE], "red")
            theme = next(p[1] for p in PALETTE if p[0] == pid)
            theme_src = next(p[2] for p in PALETTE if p[0] == pid)
        if _luma(theme) > 0.86:  # a white logo would vanish on a white chef coat
            theme = _shade(theme, -0.55)
        elif _luma(theme) < 0.08:
            theme = "#3A3540"
        skins = ["#F6CBA9", "#F1C09B", "#F7D0B3", "#EBB892"]
        rig = {"body": BODY[(gender, build)], "gender": gender, "age": age, "hair": hair, "hairColor": "#2A1C24", "outfit": outfit, "hat": hat,
               "theme": theme, "skin": skins[(seed >> 9) % len(skins)], "badgeText": shop["name"][:1], "accessories": acc}
        d["note"] = note
        decisions["look"] = d
        yield {"type": "step", "step": "look", "status": "done", "decision": d, "data": {"rig": rig, "personality": pers, "themeSource": theme_src}}

        # ---- 2 口音
        yield {"type": "step", "step": "accent", "status": "run"}
        owner = {"gender": "女" if gender == "female" else "男", "age": {"young": "二三十岁", "middle": "中年", "old": "老年"}[age],
                 "personality": PERSONALITY[pers].split("：")[0], "outfit": OUTFIT_ZH[outfit]}
        state2 = {**state, "owner": owner}
        choices = {l["id"]: f"{l['zh']}：{l['region']}" for l in self.cat["languages"] if l["id"] != "fr"}
        q = {"accent": {"type": "choice", "instructions": "这家店的店主在直播里说话带哪种口音？主要看 `shop.cuisine`、店名和招牌菜对应的地区："
                                                         "川菜→四川话，粤菜→粤语，湘菜→湖南话，日料→日式口音普通话……外国菜系的店主说带本国口音的中文。没有明显地域特征时选普通话。",
                        "criteria": choices}}

        def rules_accent():
            score = {lid: len(re.findall(p, blob, flags=re.I)) for lid, p in ACCENT_KEYS.items()}
            best = max(score, key=score.get)
            return {"accent": one(best if score[best] else "zh")}

        d, note = self._ask(key, state2, q, rules_accent)
        lang = pick(d["answers"], "accent", list(choices), "zh")
        d["note"] = note
        decisions["accent"] = d
        L = self.langs[lang]
        yield {"type": "step", "step": "accent", "status": "done", "decision": d, "data": {"language": lang, "zh": L["zh"], "region": L["region"]}}

        # ---- 3 组件
        yield {"type": "step", "step": "assets", "status": "run"}
        state3 = {**state2, "owner": {**owner, "accent": L["zh"]}}
        ex = {e["id"]: jev._crit(e) for e in self.cat["expressions"] if e["id"] not in ("idle", "listen")}
        ges = {g["id"]: jev._crit(g) for g in self.cat["gestures"] if g["id"] != "rest"}
        acts = {a["id"]: jev._crit(a) for a in self.cat["acts"]}
        rc = self.cat.get("reactionCriteria", {})
        exall = {e["id"]: jev._crit(e) for e in self.cat["expressions"]}
        react = {r: (f"{exall[r].split('：')[0]}：{rc[r]}" if r in rc else exall[r]) for r in self.cat["reactions"] if r != "idle"}
        q = {
            "expr": {"type": "choice", "instructions": "按照 `owner.personality`，店主推销自家菜时的招牌表情是哪一个？", "criteria": ex},
            "punch": {"type": "choice", "instructions": "店主说到得意处（笑点落下）时会切换成哪个表情？", "criteria": ex},
            "gesture": {"type": "choice", "instructions": "店主的招牌手势？", "criteria": ges},
            "act": {"type": "choice", "instructions": "店主开口推销时配合的招牌身体动作？", "criteria": acts},
            "reaction": {"type": "choice", "instructions": "台上的对手吹牛或拆台时，店主默认的反应？", "criteria": react},
            "energy": {"type": "score", "instructions": "店主说话的能量和语速有多高？", "criteria": ["慢条斯理", "平稳", "轻快", "连珠炮"]},
        }

        def rules_assets():
            s = STYLE[pers]
            return {"expr": one(s[0]), "punch": one(s[1]), "gesture": one(s[2]), "act": one(s[3]), "reaction": one(s[4]),
                    "energy": {"type": "score", "score": {"fiery": 2.6, "cute": 2.4, "bold": 2.2, "honest": 1.6, "pro": 1.4, "refined": 1.2, "calm": 0.9, "shy": 0.8}[pers]}}

        d, note = self._ask(key, state3, q, rules_assets)
        A = d["answers"]
        s = STYLE[pers]
        defaults = {"expr": pick(A, "expr", list(ex), s[0]), "punch": pick(A, "punch", list(ex), s[1]), "gesture": pick(A, "gesture", list(ges), s[2]),
                    "act": pick(A, "act", list(acts), s[3]), "reaction": pick(A, "reaction", list(react), s[4])}
        energy = float(((A.get("energy") or {}).get("score")) if (A.get("energy") or {}).get("score") is not None else 1.5)
        d["note"] = note
        decisions["assets"] = d
        yield {"type": "step", "step": "assets", "status": "done", "decision": d, "data": {"defaults": defaults, "energy": round(energy, 2)}}

        # ---- 4 声音
        yield {"type": "step", "step": "voice", "status": "run"}
        allowed = [t for t in TIMBRES if t["gender"] == gender]
        state4 = {**state3, "owner": {**state3["owner"], "energy": ["慢条斯理", "平稳", "轻快", "连珠炮"][max(0, min(3, round(energy)))]}}
        q = {"timbre": {"type": "choice", "instructions": "给这位店主配哪种音色最像？参考 `owner` 的年龄、性格和说话能量。",
                        "criteria": {t["id"]: f"{t['zh']}：{TIMBRE_DESC[t['id']]}" for t in allowed}}}

        def rules_voice():
            if gender == "female":
                t = {"young": "f_girl" if pers == "cute" else "f_young", "middle": "f_mid", "old": "f_old"}[age]
            else:
                t = {"young": "m_fr" if pers == "refined" and outfit == "chef" else "m_young", "middle": "m_mid", "old": "m_old"}[age]
            return {"timbre": one(t)}

        d, note = self._ask(key, state4, q, rules_voice)
        timbre = pick(d["answers"], "timbre", [t["id"] for t in allowed], allowed[0]["id"])
        speed = round(1.02 + 0.055 * max(0.0, min(3.0, energy)), 3)
        d["note"] = note
        decisions["voice"] = d

        # ---- the contract
        name = self._name(shop, gender, age, lang, seed)
        accent_l = L.get("accent") or L["cosy"].get("accent")
        role = "主厨" if outfit == "chef" else ("老板娘" if gender == "female" else "老板")
        agez = {"young": "二十多岁", "middle": "四十岁上下", "old": "六十多岁"}[age]
        sell = (shop["selling"] or shop["dishes"] or shop["desc"])[:60].rstrip("，。,.；; ")
        cuisine = re.split(r"\s*[/、，,|｜]\s*", shop["cuisine"])[0] if shop["cuisine"] else (L["region"].split("、")[0] if lang != "zh" else "家常菜")
        persona = f"{cuisine}店{role}，{agez}。{PERSONALITY[pers]}。" + (f"卖点：{sell}。" if sell else "")
        plate = " · ".join(x for x in [cuisine, f"¥{shop['price']}/人" if shop["price"] else "", f"{shop['distance']} km" if shop["distance"] else ""] if x)
        dish = re.split(r"[，,、；;/ ]", shop["dishes"])[0] if shop["dishes"] else ""
        hook = "，".join(x for x in [f"招牌{dish}" if dish else "", f"人均才{shop['price']}" if shop["price"] else ""] if x)
        greeting = f"大家好，我是{shop['name']}的{name}！" + (hook + "，快来尝尝！" if hook else "欢迎来尝尝！")
        tz = next(t["zh"] for t in TIMBRES if t["id"] == timbre)
        ez = lambda i: next((e["zh"] for e in self.cat["expressions"] if e["id"] == i), i)
        gz = next((g["zh"] for g in self.cat["gestures"] if g["id"] == defaults["gesture"]), defaults["gesture"])
        c = {
            "id": aid, "kind": "agent", "name": name, "fullName": f"{name} · {shop['name']}", "restaurant": shop["name"], "plate": plate,
            "cuisine": cuisine, "price": shop["price"], "distanceKm": shop["distance"], "edge": _edge(theme), "language": lang,
            "persona": persona, "voiceDesc": f"{L['zh']} · {tz}",
            "look": "、".join(x for x in [HAIR_ZH[hair], OUTFIT_ZH[outfit], HAT_ZH[hat]] + [{"glasses": "眼镜", "mustache": "小胡子", "earrings": "耳环"}[a] for a in acc] if x)
                    + f"；胸牌印店铺 logo；主题色 {colour_name(theme)} {theme}（{theme_src}）",
            "signature": f"{ez(defaults['expr'])}开场，{gz}，说到得意处{ez(defaults['punch'])}。",
            "palette": [theme, _shade(theme, -0.2), rig["skin"], rig["hairColor"]],
            "defaults": {k: defaults[k] for k in ("expr", "gesture", "act", "reaction")}, "punch": defaults["punch"], "personality": pers,
            "keywords": [k for k in [name, shop["name"], cuisine, dish] if k], "logo": logo, "rig": rig,
            "voice": {"timbre": timbre, "speed": speed}, "greeting": greeting, "shop": shop, "decisions": decisions,
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        self.register(c)
        # warm the voice: a foreign accent needs its prompt clip, the greeting its clauses
        warm = {"accentClip": None, "prefetched": 0}
        if self.engine.state == "ready":
            if accent_l:
                if not os.path.isfile(os.path.join(self.voices.dir, f"{timbre}__{accent_l}.wav")):
                    yield {"type": "step", "step": "voice", "status": "progress", "note": f"生成{L.get('langName', accent_l)}口音提示音"}
                try:
                    warm["accentClip"] = os.path.basename(self.voices.foreign(timbre, accent_l))
                except Exception as e:
                    warm["error"] = f"{type(e).__name__}: {e}"
            text = greeting
            if self.lz.configured() and self.lz.needs(lang):
                try:
                    text = self.lz.localize(greeting, lang)["text"]
                except Exception:
                    pass
            try:
                warm["prefetched"] = self.engine.prefetch(aid, text, lang)
            except Exception:
                pass
        yield {"type": "step", "step": "voice", "status": "done", "decision": d, "data": {"timbre": timbre, "zh": tz, "speed": speed, **warm}}
        self._save(c)
        yield {"type": "done", "agent": c}

    def _name(self, shop, gender, age, lang, seed):
        o = _owner_name(shop["owner"])
        if o:
            return o
        L = self.langs[lang]
        acc = L["cosy"].get("accent")
        if acc in FOREIGN_NAMES:
            return FOREIGN_NAMES[acc][0 if gender == "female" else 1]
        s = SURNAMES[seed % len(SURNAMES)]
        if gender == "female":
            return {"young": "小" + s, "middle": s + "姐", "old": s + "婆婆"}[age]
        return {"young": "小" + s, "middle": s + "叔", "old": s + "伯"}[age]
