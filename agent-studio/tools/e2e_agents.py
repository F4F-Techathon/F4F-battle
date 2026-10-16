"""End-to-end: 我 + multi-quote, "+" agent generation, the new agent speaking, library, system.

  uv run --with playwright python tools/e2e_agents.py http://127.0.0.1:8770/ 0 out

argv: server URL, preset index (agentgen.js PRESETS), screenshot folder. Needs the server
running; the agent it generates is deleted again at the end (unless it existed before).
The page autosaves, so the test overwrites sessions/_autosave.json.
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770/"
PRESET = int(sys.argv[2]) if len(sys.argv) > 2 else 0
OUT = os.path.abspath(sys.argv[3] if len(sys.argv) > 3 else "out")
os.makedirs(OUT, exist_ok=True)


def wait_turn(pg, tid, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = pg.evaluate("(id) => { const t = window.__live.engine.log.find((x) => x.id === id); return t ? t.status : null; }", tid)
        if st in ("done", "interrupted"):
            return st
        pg.wait_for_timeout(300)
    return "timeout"


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errors = []
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append("CONSOLE " + m.text))
    pg.goto(URL, wait_until="domcontentloaded")
    pg.wait_for_function("!!(window.__live && window.__live.engine)", timeout=30000)
    pg.wait_for_timeout(800)
    print("order", pg.evaluate("import('/js/roster.js').then((r) => r.order())"))

    # ---- 1. two owners talk, then 我 answers both at once
    t1 = pg.evaluate("window.__live.say('rong', '我们家毛肚今天新到的，人均才八十五！').id")
    t2 = pg.evaluate("window.__live.say('hua', '辣成那样还吃得出味道？来饮早茶啦！').id")
    t3 = pg.evaluate(f"window.__live.say('me', '你们俩别吵了，我就想知道哪家离我近、今晚还能订到位子？', ['{t1}', '{t2}']).id")
    for t in (t1, t2, t3):
        print(t, wait_turn(pg, t))
    me = pg.evaluate(f"""(() => {{ const t = window.__live.engine.log.find((x) => x.id === '{t3}');
      return {{ quotes: t.quotes.map((q) => q.who), source: t.decision && t.decision.source, listeners: Object.fromEntries(Object.entries(t.plan.listeners).map(([w, r]) => [w, r.id])),
               stance: t.plan.stance.id, q: Object.keys(t.decision.response.answers), voice: t.voice && t.voice.source }}; }})()""")
    print("me turn", json.dumps(me, ensure_ascii=False))

    # ---- 2. "+" : a shop + logo → a new agent on stage
    before = set(pg.evaluate("fetch('/api/agents').then((r) => r.json()).then((d) => d.agents.map((a) => a.id))"))
    t0 = time.time()
    agent = pg.evaluate(f"""(async () => {{
      const G = await import('/js/agentgen.js');
      const p = G.PRESETS[{PRESET}];
      const logo = await G.processLogo(G.drawLogo(p.logo));
      const steps = [];
      const a = await window.__live.generateAgent({{ text: p.text, logo: logo.data, colors: logo.colors }});
      return a ? {{ id: a.id, name: a.name, restaurant: a.restaurant, language: a.language, voice: a.voice, rig: a.rig, defaults: a.defaults, colors: logo.colors,
                   sources: Object.fromEntries(Object.entries(a.decisions).map(([k, d]) => [k, d.source + ' ' + d.ms + 'ms'])) }} : null;
    }})()""")
    print("generated in %.1fs" % (time.time() - t0), json.dumps(agent, ensure_ascii=False))
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, "e2e_1_stage.png"))
    stage = pg.evaluate("import('/js/plan.js').then((P) => ({ STAGE: P.STAGE.slice(), X: Object.fromEntries(P.STAGE.map((w) => [w, Math.round(P.X[w])])) }))")
    print("stage", stage)
    # the greeting the new agent says on arrival
    pg.wait_for_function("window.__live.engine.log.some((t) => t.who === '%s')" % agent["id"], timeout=20000)
    gid = pg.evaluate("window.__live.engine.log.find((t) => t.who === '%s').id" % agent["id"])
    print("greeting", gid, wait_turn(pg, gid, 120))
    g = pg.evaluate(f"""(() => {{ const t = window.__live.engine.log.find((x) => x.id === '{gid}');
      return {{ text: t.text, src: t.src, lang: t.lang, voice: t.voice, ms: t.ms, expr: t.plan && t.plan.expr.id, gesture: t.plan && t.plan.gesture.id, lis: t.plan && Object.keys(t.plan.listeners) }}; }})()""")
    print("greeting turn", json.dumps(g, ensure_ascii=False)[:600])

    # ---- 3. the director types a line for the new agent, answering 我
    t4 = pg.evaluate(f"window.__live.say('{agent['id']}', '离得近算什么，我们家今晚还有包间，快来！', ['{t3}']).id")
    pg.wait_for_timeout(1800)
    pg.screenshot(path=os.path.join(OUT, "e2e_2_speaking.png"))
    print(t4, wait_turn(pg, t4, 120))
    r4 = pg.evaluate(f"""(() => {{ const t = window.__live.engine.log.find((x) => x.id === '{t4}');
      return {{ source: t.decision && t.decision.source, expr: t.plan.expr.id, gesture: t.plan.gesture.id, act: t.plan.act.id, target: t.plan.target, voice: t.voice && t.voice.source, ms: t.ms,
               listeners: Object.fromEntries(Object.entries(t.plan.listeners).map(([w, r]) => [w, r.id])) }}; }})()""")
    print("agent turn", json.dumps(r4, ensure_ascii=False))
    pg.screenshot(path=os.path.join(OUT, "e2e_3_after.png"))

    # ---- 4. library: overview, a template, the agent's dossier
    pg.click("button[data-tab=library]")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, "e2e_4_library.png"), full_page=False)
    pg.evaluate("document.querySelector('.lib-main').scrollTop = 99999")
    pg.wait_for_timeout(1200)
    pg.screenshot(path=os.path.join(OUT, "e2e_5_library_bottom.png"))
    pg.evaluate("document.querySelectorAll('.rail .chars button')[0].click()")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, "e2e_6_template.png"))
    pg.evaluate("[...document.querySelectorAll('.rail .cats button')].find((b) => b.textContent.startsWith('表情')).click()")
    pg.wait_for_timeout(2000)
    pg.screenshot(path=os.path.join(OUT, "e2e_7_template_expr.png"))
    pg.evaluate(f"[...document.querySelectorAll('.rail .chars button')].find((b) => b.textContent.includes({json.dumps(agent['name'])})).click()")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, "e2e_8_dossier.png"))
    pg.evaluate("[...document.querySelectorAll('.rail .cats button')].find((b) => b.textContent.startsWith('手势')).click()")
    pg.wait_for_timeout(2000)
    pg.screenshot(path=os.path.join(OUT, "e2e_9_agent_pose.png"))

    # ---- 5. system
    pg.click("button[data-tab=system]")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(OUT, "e2e_10_system.png"), full_page=True)
    if agent and agent["id"] not in before:
        pg.evaluate("(id) => fetch('/api/agents/' + id, { method: 'DELETE' })", agent["id"])
    print("errors", errors[:12])
    b.close()
    sys.exit(1 if errors or not agent else 0)
