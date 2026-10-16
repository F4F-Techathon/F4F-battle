"""今晚吃啥 · 多智能体演播室 — local server.

  /                 web UI (agent-studio/web)
  /film/...         the HyperFrames film project, read-only (rig.js, lipsync.js, voices, fonts)
  /lab/...          avatar-lab public assets (3D GLB models, references)
  /docs-assets/...  docs/restaurant-avatar (concept sheets)
  /cache/...        synthesised voice clips
  GET  /api/status  Jev key + CosyVoice3 state
  POST /api/decide  Jev performance decision (baseline when no key)
  POST /api/tts     CosyVoice3 synthesis + lip-sync bake
  GET  /api/agents  generated agents (+ 我); POST /api/agents/generate → NDJSON 形象/口音/组件/声音

Run (from agent-studio/):  <cosyvoice env python> -m uvicorn server.app:app --port 8770
"""
import os
import time

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import jev
from .agents import AgentStore
from .llm import PRESETS, TARGETS, Localizer
from .tts import CosyVoiceEngine
from .voices import TIMBRES, VoiceLibrary

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
ROOT = os.path.dirname(STUDIO)
WEB = os.path.join(STUDIO, "web")
FILM = os.path.join(ROOT, "videos", "jinwan-chi-shui")
LAB = os.path.join(ROOT, "avatar-lab", "public")
DOCS = os.path.join(ROOT, "docs", "restaurant-avatar")
CACHE = os.path.join(STUDIO, "cache", "tts")
COSY = os.environ.get("COSY_DIR", os.path.join(ROOT, "tts", "CosyVoice"))


def _load_env(path):
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env(os.path.join(STUDIO, ".env"))
CATALOG = jev.load_catalog(os.path.join(WEB, "data", "catalog.json"))
ENGINE = CosyVoiceEngine(COSY, FILM, CACHE, CATALOG)
VOICES = VoiceLibrary(ENGINE, FILM, os.path.join(STUDIO, "voices"))
ENGINE.lib = VOICES
LZ = Localizer(CATALOG)
AGENTS = AgentStore(os.path.join(STUDIO, "agents"), CATALOG, ENGINE, VOICES, LZ)
AGENTS.load()
if os.environ.get("STUDIO_NO_TTS") != "1":
    ENGINE.start()

app = FastAPI(title="jinwan agent studio")


def _key():
    return os.environ.get("TYPESAFE_API_KEY", "").strip()


@app.get("/api/status")
def status():
    c = LZ.config()
    return {"jev": {"configured": bool(_key()), "model": jev.MODEL, "endpoint": jev.API_URL, "masked": _mask(_key())}, "tts": ENGINE.status(),
            "llm": {"configured": LZ.configured(), "model": c["model"], "base_url": c["base_url"], "masked": _mask(c["key"])},
            "voices": VOICES.status()}


def _mask(k):
    if not k:
        return ""
    return k[:3] + "…" + k[-4:] if len(k) > 10 else "…" + k[-2:]


class SettingsReq(BaseModel):
    api_key: str | None = None
    model: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    persist: bool = True


def _write_env(updates):
    path = os.path.join(STUDIO, ".env")
    lines = []
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    for k, v in updates.items():
        hit = False
        for i, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == k:
                lines[i] = f"{k}={v}"
                hit = True
        if not hit:
            lines.append(f"{k}={v}")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


@app.get("/api/settings")
def get_settings():
    c = LZ.config()
    return {"configured": bool(_key()), "masked": _mask(_key()), "model": jev.MODEL, "endpoint": jev.API_URL,
            "env_file": os.path.isfile(os.path.join(STUDIO, ".env")),
            "llm": {"configured": LZ.configured(), "masked": _mask(c["key"]), "base_url": c["base_url"], "model": c["model"], "presets": PRESETS}}


@app.post("/api/settings")
def set_settings(req: SettingsReq):
    updates = {}
    if req.api_key is not None:
        k = req.api_key.strip()
        if k and (len(k) < 8 or len(k) > 400 or any(c.isspace() for c in k)):
            raise HTTPException(400, "API key 格式不对")
        os.environ["TYPESAFE_API_KEY"] = k
        updates["TYPESAFE_API_KEY"] = k
    if req.model:
        m = req.model.strip()
        if not m or len(m) > 60:
            raise HTTPException(400, "model 名称不对")
        jev.MODEL = m
        updates["TYPESAFE_MODEL"] = m
    for field, env, cap in (("llm_api_key", "LLM_API_KEY", 400), ("llm_base_url", "LLM_BASE_URL", 300), ("llm_model", "LLM_MODEL", 100)):
        v = getattr(req, field)
        if v is None:
            continue
        v = v.strip()
        if len(v) > cap or any(ch.isspace() for ch in v):
            raise HTTPException(400, f"{field} 格式不对")
        if field == "llm_base_url" and v and not v.startswith(("http://", "https://")):
            raise HTTPException(400, "接口地址要以 http:// 或 https:// 开头")
        os.environ[env] = v.rstrip("/") if field == "llm_base_url" else v
        updates[env] = os.environ[env]
        LZ.cache.clear()  # a new model / endpoint must not serve old rewrites
    if req.persist and updates:
        _write_env(updates)
    return get_settings()


@app.post("/api/settings/test")
def test_settings():
    if not _key():
        raise HTTPException(400, "还没有填写 API key")
    q = {"ok": {"type": "noul", "instructions": "这句话是在打招呼吗？"}}
    try:
        res = jev.call_jev(_key(), "你好呀，欢迎光临！", q, timeout=15.0)
    except Exception as e:
        raise HTTPException(502, str(e))
    return {"ok": True, "model": res.get("model"), "latency_ms": res.get("latency_ms"), "answer": res.get("answers", {}).get("ok")}


@app.post("/api/settings/test_llm")
def test_llm():
    if not LZ.configured():
        raise HTTPException(400, "还没有填写改写模型的接口地址、模型名和 key")
    try:
        LZ.cache.pop(("yue", "辣到嘴都肿了，还怎么约会？"), None)
        r = LZ.localize("辣到嘴都肿了，还怎么约会？", "yue")
    except Exception as e:
        raise HTTPException(502, f"{type(e).__name__}: {e}")
    return {"ok": True, "model": r["model"], "ms": r["ms"], "src": r["src"], "text": r["text"]}


class LocalizeReq(BaseModel):
    who: str = "rong"
    text: str
    lang: str = "zh"


def _localize(req):
    text = req.text.strip()
    if not text or len(text) > 300:
        raise HTTPException(400, "text must be 1-300 chars")
    try:
        return LZ.localize(text, req.lang)
    except Exception as e:
        return {"src": text, "text": text, "lang": req.lang, "gloss": None, "engine": "error", "model": None, "ms": 0, "cached": False,
                "note": f"改写失败，按原文配音：{type(e).__name__}: {str(e)[:160]}"}


@app.post("/api/localize")
def localize(req: LocalizeReq):
    """普通话 → the character's dialect / accent version (OpenAI-compatible LLM)."""
    return _localize(req)


@app.post("/api/prefetch")
def prefetch(req: LocalizeReq):
    """While the director types: rewrite the line, then pre-synthesise its finished clauses."""
    if not _known(req.who):
        raise HTTPException(400, "unknown speaker")
    r = _localize(req)
    try:
        r["queued"] = ENGINE.prefetch(req.who, r["text"], req.lang)
    except ValueError:
        r["queued"] = 0
    return r


class Quote(BaseModel):
    who: str | None = None
    text: str = ""


class Turn(BaseModel):
    who: str
    text: str


class DecideReq(BaseModel):
    speaker: str
    text: str
    lang: str = "zh"
    quote: Quote | None = None  # older clients: a single quoted line
    quotes: list[Quote] = []  # every line this one answers (several people, several lines)
    stage: list[str] = []  # owners on stage, in order (default: every film + generated owner)
    history: list[Turn] = []
    engine: str = "auto"  # auto | jev | baseline


@app.post("/api/decide")
def decide(req: DecideReq):
    if req.speaker not in CATALOG["characters"]:
        raise HTTPException(400, "unknown speaker")
    text = req.text.strip()
    if not text or len(text) > 300:
        raise HTTPException(400, "text must be 1-300 chars")
    quotes = [q.model_dump() for q in (req.quotes or ([req.quote] if req.quote else [])) if q.text.strip()][:6]
    history = [h.model_dump() for h in req.history]
    state, stage = jev.build_state(CATALOG, req.speaker, text, req.lang, quotes, history, [w for w in req.stage if w in CATALOG["characters"]])
    questions = jev.build_questions(CATALOG, req.speaker, stage)
    request_body = {"state": state, "model": jev.MODEL, "questions": questions}
    note = None
    want_jev = req.engine in ("auto", "jev")
    if want_jev and _key():
        try:
            res = jev.call_jev(_key(), state, questions)
            return {"source": "jev", "request": request_body, "response": res, "stage": stage}
        except Exception as e:
            if req.engine == "jev":
                raise HTTPException(502, str(e))
            note = f"Jev 调用失败，已回退到关键词基线：{e}"
    elif want_jev:
        note = "未配置 TYPESAFE_API_KEY，使用关键词基线（不是 Jev）。"
    res = jev.baseline(CATALOG, req.speaker, text, quotes, questions, stage)
    return {"source": "baseline", "note": note, "request": request_body, "response": res, "stage": stage}


class TtsReq(BaseModel):
    who: str
    text: str
    lang: str = "zh"
    delivery: str = "neutral"
    speed: float | None = None


def _known(who):
    return who in CATALOG["characters"] or (who.startswith("tpl:") and any(t["id"] == who[4:] for t in TIMBRES))


def _tts_job(req):
    if not _known(req.who):
        raise HTTPException(400, "unknown speaker")
    text = req.text.strip()
    if not text or len(text) > 300:
        raise HTTPException(400, "text must be 1-300 chars")
    try:
        return ENGINE.job(req.who, text, req.lang, req.delivery, req.speed)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _public_job(j):
    return {k: (os.path.relpath(v, ROOT) if k == "prompt_wav" else v) for k, v in j.items()}


@app.post("/api/tts")
def tts(req: TtsReq):
    """Whole line at once (library / scripts)."""
    from .lipsync_bake import bake
    j = _tts_job(req)
    t0 = time.time()
    try:
        wav, sr, cached = ENGINE.synth(j)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    ls = bake(wav, sr, j["text"], j["lipsync"])
    ls["who"] = req.who
    return {"id": "tts_" + j["key"], "url": f"/cache/{j['key']}.wav", "sr": sr, "cached": cached, "gen_secs": round(time.time() - t0, 2),
            "job": _public_job(j), "lipsync": ls}


@app.post("/api/tts/stream")
def tts_stream(req: TtsReq):
    """Live: NDJSON — meta, then one line per clause (int16 PCM + that clause's lip-sync)
    as soon as it is synthesised, then done (full baked line + cached wav for replays)."""
    import base64
    import json as _json

    import numpy as np
    import soundfile as sf

    from .lipsync_bake import bake
    from .tts import pause_after, split_clauses

    j = _tts_job(req)
    if ENGINE.state != "ready":
        raise HTTPException(503, f"CosyVoice3 not ready ({ENGINE.state})")
    clauses = split_clauses(j["text"])

    def gen():
        t0 = time.time()
        sr = ENGINE.sr
        yield _json.dumps({"type": "meta", "id": "tts_" + j["key"], "sr": sr, "clauses": clauses, "job": _public_job(j)}, ensure_ascii=False) + "\n"
        parts, first = [], None
        for i, c in enumerate(clauses):
            try:
                x, cached = ENGINE.clause_audio(j, c)
            except Exception as e:
                yield _json.dumps({"type": "error", "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False) + "\n"
                return
            if first is None:
                first = time.time() - t0
            ls = bake(x, sr, c, j["lipsync"])
            pause = pause_after(c) if i < len(clauses) - 1 else 0.0
            pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
            yield _json.dumps({"type": "clause", "i": i, "text": c, "dur": round(len(x) / sr, 4), "pause": pause, "cached": cached,
                               "ms": round((time.time() - t0) * 1000), "v": ls["v"], "o": ls["o"], "ct": ls["ct"],
                               "pcm": base64.b64encode(pcm).decode("ascii")}) + "\n"
            parts.append(x)
            if pause:
                parts.append(np.zeros(int(pause * sr), dtype="float32"))
        full = np.concatenate(parts) if parts else np.zeros(1, dtype="float32")
        path = os.path.join(CACHE, j["key"] + ".wav")
        if not os.path.isfile(path):
            sf.write(path, full, sr)
        ls = bake(full, sr, j["text"], j["lipsync"])
        ls["who"] = j["who"]
        yield _json.dumps({"type": "done", "url": f"/cache/{j['key']}.wav", "lipsync": ls, "first_ms": round(first * 1000) if first else None,
                           "total_ms": round((time.time() - t0) * 1000)}, ensure_ascii=False) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


class PrefetchReq(BaseModel):
    who: str
    text: str
    lang: str = "zh"


@app.get("/api/voices")
def voices():
    """Voice templates (timbres) and every accent they can speak."""
    return {"timbres": VOICES.catalog(), "status": VOICES.status(), "languages": CATALOG["languages"]}


@app.post("/api/tts/prefetch")
def tts_prefetch(req: PrefetchReq):
    """Speculative: synthesise the clauses already finished while the user is still typing."""
    if not _known(req.who) or not req.text.strip() or len(req.text) > 300:
        return {"queued": 0}
    try:
        return {"queued": ENGINE.prefetch(req.who, req.text.strip(), req.lang)}
    except ValueError:
        return {"queued": 0}


@app.get("/api/agents")
def list_agents():
    """Generated agents (full contracts) and 我."""
    return {"agents": AGENTS.list(), "me": CATALOG["characters"]["me"], "timbres": VOICES.catalog()}


class GenerateReq(BaseModel):
    text: str
    logo: str | None = None  # data:image/png;base64,… (≤ 96 px, downscaled in the browser)
    colors: list[dict] = []  # dominant logo colours [{hex, share}] measured in the browser


@app.post("/api/agents/generate")
def generate_agent(req: GenerateReq):
    """NDJSON: start, then step run/done for 形象 → 口音 → 组件 → 声音, then done {agent}."""
    import json as _json
    if not req.text.strip() or len(req.text) > 2000:
        raise HTTPException(400, "店铺信息要 1–2000 字")
    n = len(AGENTS.list())
    if n >= 12:
        raise HTTPException(400, "最多 12 个生成的 agent，先在资产里删掉一些")

    def gen():
        try:
            for ev in AGENTS.generate(req.text, req.logo, req.colors, _key()):
                yield _json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:
            yield _json.dumps({"type": "error", "error": f"{type(e).__name__}: {e}" if not isinstance(e, ValueError) else str(e)}, ensure_ascii=False) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@app.delete("/api/agents/{aid}")
def delete_agent(aid: str):
    if not AGENTS.delete(aid):
        raise HTTPException(404, "没有这个生成的 agent")
    return {"ok": True}


class MeReq(BaseModel):
    name: str | None = None
    timbre: str | None = None  # "" = no voice


@app.put("/api/agents/me")
def set_me(req: MeReq):
    if req.timbre and not any(t["id"] == req.timbre for t in TIMBRES):
        raise HTTPException(400, "没有这个音色")
    return AGENTS.set_me(req.name.strip()[:8] if req.name else None, req.timbre)


# sessions are plain JSON files: agent-studio/sessions/<id>.json
SESS = os.path.join(STUDIO, "sessions")
os.makedirs(SESS, exist_ok=True)


def _sid(s):
    import re
    s = re.sub(r"[^\w一-鿿\-]+", "_", (s or "").strip())[:60].rstrip("_")
    return s or "session"


def _sess_path(sid):
    return os.path.join(SESS, _sid(sid) + ".json")


@app.get("/api/sessions")
def list_sessions():
    import json as _json
    out = []
    for f in os.listdir(SESS):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(SESS, f), encoding="utf-8") as fh:
                d = _json.load(fh)
        except Exception:
            continue
        turns = d.get("turns", [])
        out.append({"id": f[:-5], "name": d.get("name") or f[:-5], "updated": d.get("updated"), "count": len(turns),
                    "who": [t.get("who") for t in turns][:12], "preview": [t.get("src") or t.get("text", "") for t in turns[:2]]})
    out.sort(key=lambda x: x.get("updated") or "", reverse=True)
    return out


@app.get("/api/sessions/{sid}")
def get_session(sid: str):
    import json as _json
    p = _sess_path(sid)
    if not os.path.isfile(p):
        if sid == "_autosave":
            return {"name": "自动保存", "turns": []}
        raise HTTPException(404, "没有这个会话")
    with open(p, encoding="utf-8") as fh:
        return _json.load(fh)


class SessionReq(BaseModel):
    name: str = ""
    turns: list[dict] = []
    meta: dict = {}


@app.put("/api/sessions/{sid}")
def put_session(sid: str, req: SessionReq):
    import json as _json
    if len(req.turns) > 500:
        raise HTTPException(400, "会话太长（最多 500 句）")
    p = _sess_path(sid)
    d = {"name": (req.name or sid)[:80], "updated": time.strftime("%Y-%m-%d %H:%M:%S"), "turns": req.turns, "meta": req.meta}
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        _json.dump(d, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, p)
    return {"id": os.path.basename(p)[:-5], "name": d["name"], "updated": d["updated"], "count": len(req.turns)}


@app.delete("/api/sessions/{sid}")
def delete_session(sid: str):
    p = _sess_path(sid)
    if os.path.isfile(p):
        os.remove(p)
    return {"ok": True}


app.mount("/voices", StaticFiles(directory=os.path.join(STUDIO, "voices")), name="voices")
app.mount("/film", StaticFiles(directory=FILM), name="film")
app.mount("/lab", StaticFiles(directory=LAB), name="lab")
app.mount("/docs-assets", StaticFiles(directory=DOCS), name="docs")
app.mount("/cache", StaticFiles(directory=CACHE), name="cache")


@app.get("/")
def index():
    return FileResponse(os.path.join(WEB, "index.html"))


app.mount("/", StaticFiles(directory=WEB), name="web")
