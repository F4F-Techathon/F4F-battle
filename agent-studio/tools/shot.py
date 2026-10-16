"""Drive the studio in headless Edge: real typing, real audio clock, screenshots.

usage: python shot.py <base_url> <out_dir> <scenario> [...]
scenarios: home live film inspect settings library system narrow
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
scen = sys.argv[3:] or ["home"]
os.makedirs(out, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 960}, device_scale_factor=1)
    logs = []
    pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e} :: {getattr(e, 'stack', '')}"))
    pg.goto(base, wait_until="domcontentloaded")
    pg.wait_for_selector(".agent img", timeout=30000)
    pg.wait_for_timeout(1500)

    def snap(name, full=False):
        path = os.path.join(out, name + ".png")
        pg.screenshot(path=path, full_page=full)
        print("shot", path, flush=True)

    def state():
        return pg.evaluate("""() => { const e = window.__live.engine; const c = e.current;
          return { phase: c && c.phase, ms: c && c.ms, q: e.queue.length, t: e.now().toFixed(2),
                   clauses: c && c.clauses.length, done: c && c.streamDone }; }""")

    for s in scen:
        if s == "home":
            snap("home")
        elif s == "live":
            pg.click(".who button:nth-child(2)")  # 华叔
            pg.fill(".inrow textarea", "你哋川菜咁辣，食完成晚要饮水。不如嚟我度饮茶啦！")
            pg.wait_for_timeout(300)
            t0 = time.time()
            pg.press(".inrow textarea", "Enter")
            seen = set()
            for i in range(80):
                st = state()
                ph = st["phase"]
                if ph and ph not in seen:
                    seen.add(ph)
                    print(f"{time.time() - t0:5.2f}s phase={ph} ms={st['ms']} clauses={st['clauses']}", flush=True)
                    snap(f"live_{ph}")
                if ph == "speaking" and "mid" not in seen and st["clauses"] and st["clauses"] >= 2:
                    seen.add("mid")
                    pg.wait_for_timeout(700)
                    snap("live_mid")
                if ph is None and "speaking" in seen:
                    break
                pg.wait_for_timeout(150)
            print("final", state(), flush=True)
            pg.wait_for_timeout(600)
            snap("live_after")
            # a reply that quotes the line above, with interrupt off
            pg.click(".who button:nth-child(1)")  # 蓉姐
            pg.keyboard.press("Alt+ArrowUp")
            pg.fill(".inrow textarea", "饮茶？等你的汤煲好，客人都饿瘦了！")
            pg.press(".inrow textarea", "Enter")
            for i in range(60):
                st = state()
                if st["phase"] == "speaking":
                    pg.wait_for_timeout(1200)
                    snap("live_reply")
                    break
                pg.wait_for_timeout(150)
            for i in range(80):
                if state()["phase"] is None:
                    break
                pg.wait_for_timeout(150)
            print("reply", state(), flush=True)
        elif s == "film":
            pg.click(".menuwrap .iconbtn")
            pg.click("text=原片对白 · 原编排")
            for k in range(4):
                pg.wait_for_timeout(2200)
                snap(f"film_{k}")
            pg.click(".convo-h .iconbtn[title='停止']")
        elif s == "inspect":
            msgs = pg.query_selector_all(".msg")
            if msgs:
                msgs[0].click()
                pg.wait_for_timeout(600)
                snap("inspect")
                pg.click(".drawer.open .iconbtn[title='关闭']")
        elif s == "settings":
            pg.click("#btn-settings")
            pg.wait_for_timeout(600)
            snap("settings")
            pg.keyboard.press("Escape")
        elif s == "library":
            pg.click(".tabs button[data-tab='library']")
            pg.wait_for_timeout(2500)
            snap("lib_expr")
            pg.click(".spec-card >> nth=2")
            pg.wait_for_timeout(1200)
            snap("lib_detail")
            pg.click(".drawer.open .iconbtn[title='关闭']")
            for cat in ["手势", "动作", "口型", "角色", "声音", "台词", "3D"]:
                pg.click(f".cats button:has-text('{cat}')")
                pg.wait_for_timeout(2500 if cat != "3D" else 5000)
                snap("lib_" + cat)
        elif s == "system":
            pg.click(".tabs button[data-tab='system']")
            pg.wait_for_timeout(800)
            pg.click(".valbar .btn.primary")
            pg.wait_for_timeout(9000)
            snap("system")
            pg.mouse.wheel(0, 900)
            pg.wait_for_timeout(500)
            snap("system_table")
        elif s == "rewrite":
            pg.click(".who button:nth-child(2)")  # 华叔
            pg.keyboard.press("Alt+ArrowUp")
            pg.fill(".inrow textarea", "麻辣有什么好？吃完一晚上都在喝水，不如来我这喝杯好普洱！")
            pg.dispatch_event(".inrow textarea", "input")
            pg.wait_for_selector(".lz:not(.busy):not(.hidden)", timeout=15000)
            snap("rewrite_preview")
            pg.press(".inrow textarea", "Enter")
            for i in range(120):
                st = state()
                if st["phase"] == "speaking":
                    pg.wait_for_timeout(1800)
                    snap("rewrite_speaking")
                    break
                pg.wait_for_timeout(150)
            for i in range(120):
                if state()["phase"] is None:
                    break
                pg.wait_for_timeout(150)
            pg.click(".msg >> nth=-1")
            pg.wait_for_timeout(700)
            snap("rewrite_inspect")
        elif s == "sessions":
            def wait_idle(limit=240):
                for i in range(limit):
                    st = state()
                    if st["phase"] is None and st["q"] == 0:
                        return
                    pg.wait_for_timeout(150)
            for who, text in [(1, "今天新到的毛肚，七上八下，脆得很！"), (3, "毛肚？那是内脏，不是美食。")]:
                pg.click(f".who button:nth-child({who})")
                if who == 3:
                    pg.keyboard.press("Alt+ArrowUp")
                pg.fill(".inrow textarea", text)
                pg.press(".inrow textarea", "Enter")
                wait_idle()
            pg.click(".convo-h .iconbtn[title='保存会话']")
            pg.wait_for_selector(".scrim input", timeout=5000)
            pg.fill(".scrim input", "毛肚之争")
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(800)
            snap("sess_saved")
            pg.click(".convo-h .iconbtn[title='自动播放全部']")
            for i in range(80):
                if state()["phase"] == "speaking":
                    pg.wait_for_timeout(1500)
                    snap("sess_autoplay")
                    break
                pg.wait_for_timeout(150)
            wait_idle()
            print("autoplay button after:", pg.get_attribute(".convo-h .iconbtn[title^='自动播放']", "title"), flush=True)
            pg.reload(wait_until="domcontentloaded")
            pg.wait_for_selector(".restore", timeout=20000)
            snap("sess_restore_offer")
            pg.click(".restore .btn.ghost")
            for i in range(80):
                if state()["phase"] == "speaking":
                    pg.wait_for_timeout(1200)
                    snap("sess_restored_playing")
                    break
                pg.wait_for_timeout(150)
            pg.click(".convo-h .iconbtn[title='会话列表']")
            pg.wait_for_timeout(800)
            snap("sess_menu")
        elif s == "narrow":
            pg.set_viewport_size({"width": 420, "height": 900})
            pg.click(".tabs button[data-tab='live']")
            pg.wait_for_timeout(800)
            snap("narrow")
            pg.set_viewport_size({"width": 1600, "height": 960})
    print("\n".join(l for l in logs if "favicon" not in l)[-3000:])
    b.close()
