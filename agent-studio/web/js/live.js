// live.js — the real-time engine. A line is performed the moment it is sent:
//   send ──► prepare (0 ms: speaker turns, others look, bubble types)
//        ├─► Jev decision (≈0.1–0.5 s) ──► intent (face + gesture before the first word)
//        └─► CosyVoice3 clause stream ──► perform (first clause plays; lip track, typewriter
//            and listener reactions extend as each later clause arrives)
// One speaker at a time; new lines queue, or cut in when "interrupt" is on.

import { api, bus, clamp } from "./util.js";
import { STAGE, makePlan, cancelFuture, prepare, intent, perform, reactions, interrupted, settle, truthAnswers, quotesOf } from "./plan.js";

const DECIDE_WAIT = 1.0; // once audio is ready, wait at most this long for Jev
const PUNCT = "，。！？、：；…,.!?~— ";

export class LiveEngine {
  constructor(stage, cat, status) {
    this.stage = stage;
    this.cat = cat;
    this.status = status;
    this.t0 = performance.now();
    this.queue = [];
    this.current = null;
    this.log = [];
    this.subs = new Set();
    this.decideMode = "auto";
    // every language but plain 普通话 is rewritten by the LLM before it is voiced
    this.rewrite = new Set(cat.languages.filter((l) => l.id !== "zh").map((l) => l.id));
    this.ctx = null;
    this._last = performance.now();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  now() {
    return (performance.now() - this.t0) / 1000;
  }
  on(fn) {
    this.subs.add(fn);
  }
  _emit(turn) {
    this.subs.forEach((fn) => fn(turn));
  }
  audio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  /* ------------------------------------------------------------ input */
  send(turn) {
    this.audio();
    Object.assign(turn, { status: "queued", phase: "queued", clauses: [], streamDone: false, audioReady: false, ms: {}, sentAt: performance.now() });
    turn.src = turn.src || turn.text;
    if (!turn.replayOf) this.log.push(turn);
    this.queue.push(turn);
    bus.emit("turn.send", { turnId: turn.id, actorId: turn.who, text: turn.text, quote: turn.quote });
    if (!turn.decision) this._decide(turn);
    else turn.plan = makePlan(this.cat, turn);
    // the director writes 普通话; the voice waits for the dialect rewrite, Jev does not
    if (!turn.film && !turn.replayOf && turn.rewrite !== false && this.rewrite.has(turn.lang)) this._localize(turn).then(() => this._voice(turn));
    else this._voice(turn);
    if (turn.interrupt) {
      // cutting in jumps the queue and stops whoever is talking
      this.queue.splice(this.queue.indexOf(turn), 1);
      this.queue.unshift(turn);
      if (this.current && this.current.phase !== "done") this._interrupt();
    }
    this._emit(turn);
    this._pump();
    return turn;
  }

  replay(src) {
    const t = {
      id: src.id + "·r" + Math.random().toString(36).slice(2, 6), ref: src, replayOf: src,
      who: src.who, text: src.text, src: src.src, lang: src.lang, gloss: src.gloss, quote: src.quote, quotes: src.quotes, lz: src.lz,
      decision: src.decision, override: src.override, voiceOn: src.voiceOn, film: src.film,
    };
    return this.send(t);
  }

  // while typing: rewrite into the dialect and pre-synthesise finished clauses → the preview
  prefetch(who, text, lang) {
    const voice = this.status.tts && this.status.tts.state === "ready";
    if (this.rewrite.has(lang)) return api("/api/prefetch", { who, text, lang }).catch(() => null);
    if (voice) api("/api/tts/prefetch", { who, text, lang }).catch(() => {});
    return Promise.resolve(null);
  }

  async _localize(turn) {
    turn.lzPending = true;
    this._emit(turn);
    const t0 = performance.now();
    try {
      const r = await api("/api/localize", { who: turn.who, text: turn.src, lang: turn.lang });
      turn.text = r.text;
      turn.gloss = r.gloss || turn.gloss || null;
      turn.lz = r;
      turn.ms.rewrite = Math.round(performance.now() - t0);
      bus.emit("text.rewrite", { turnId: turn.id, actorId: turn.who, engine: r.engine, model: r.model, ms: turn.ms.rewrite, cached: r.cached, text: r.text, note: r.note });
    } catch (e) {
      turn.lz = { engine: "error", note: "改写失败，按原文配音：" + e.message };
    }
    turn.lzPending = false;
    this._emit(turn);
  }

  stop() {
    this.queue.length = 0;
    if (this.current && this.current.phase !== "done") this._interrupt(true);
  }

  clear() {
    this.stop();
    this.log = [];
    this.stage.reset();
    this.stage.melon = 0.08;
    STAGE.forEach((w) => (this.stage.hearts[w] = { rong: 62, hua: 60.5, pierre: 58.8 }[w] || 58));
  }

  /* ------------------------------------------------------------ decide */
  async _decide(turn) {
    const t0 = performance.now();
    const history = this.log.filter((x) => x !== turn && x.phase !== "queued").slice(-6).map((x) => ({ who: x.who, text: x.src || x.text }));
    const quotes = quotesOf(turn).map((q) => ({ who: q.who, text: q.src || q.text }));
    bus.emit("jev.request", { turnId: turn.id, actorId: turn.who, text: turn.src || turn.text, quotes });
    try {
      turn.decision = await api("/api/decide", { speaker: turn.who, text: turn.src || turn.text, lang: turn.lang, quotes, stage: STAGE.slice(), history, engine: this.decideMode });
    } catch (e) {
      turn.decisionError = e.message;
      turn.decisionFailed = true;
      bus.emit("turn.error", { turnId: turn.id, actorId: turn.who, error: "决策失败：" + e.message });
      this._emit(turn);
      this._pump();
      return;
    }
    turn.ms.decide = Math.round(performance.now() - t0);
    const plan = makePlan(this.cat, turn);
    const A = turn.decision.response.answers;
    bus.emit("jev.answer", { turnId: turn.id, actorId: turn.who, source: turn.decision.source, model: turn.decision.response.model, latencyMs: turn.ms.decide,
      expr: A.speaker_expr && A.speaker_expr.choice, gesture: A.speaker_gesture && A.speaker_gesture.choice, act: A.speaker_act && A.speaker_act.choice });
    this._applyPlan(turn, plan);
  }

  // a new plan (Jev answered, or the director overrode a slot)
  _applyPlan(turn, plan) {
    const late = turn.phase === "speaking" && turn.plan && turn.plan.provisional;
    turn.plan = plan;
    const t = this.now();
    if (this.current === turn && turn.phase === "preparing") {
      intent(this.cat, this.stage.actors, turn, plan, t);
      this.stage.styleBubble(turn.id, plan.bubble.id);
    } else if (late) {
      // the voice started before Jev answered: adopt the decision mid-line
      intent(this.cat, this.stage.actors, turn, plan, t);
      this.stage.styleBubble(turn.id, plan.bubble.id);
      reactions(this.stage.actors, turn, plan, turn.T, turn.est, t);
    }
    this._emit(turn);
    this._pump();
  }

  override(turn, slot, value) {
    turn.override = turn.override || {};
    if (value == null || value === "") delete turn.override[slot];
    else turn.override[slot] = value;
    turn.plan = makePlan(this.cat, turn);
    this._emit(turn);
  }

  /* ------------------------------------------------------------ voice */
  async _voice(turn) {
    const ready = this.status.tts && this.status.tts.state === "ready";
    // film lines and replays reuse a finished recording
    const rec = turn.film ? { url: "/film/assets/voice/" + turn.film + ".wav", lipsync: window.LIPSYNC[turn.film] } : turn.replayOf && turn.replayOf.final ? turn.replayOf.final : null;
    if (rec) {
      try {
        const buf = await fetch(rec.url).then((r) => r.arrayBuffer());
        const ab = await this.audio().decodeAudioData(buf);
        const L = rec.lipsync;
        turn.final = rec;
        turn.voice = { source: turn.film ? "原片配音" : "缓存" };
        this._clause(turn, { i: 0, f32: ab.getChannelData(0), sr: ab.sampleRate, dur: ab.duration, pause: 0, v: L.v, o: L.o, ct: L.ct, text: turn.text });
        turn.streamDone = true;
        this._pump();
        return;
      } catch (e) {
        /* fall through to synthesis */
      }
    }
    if (!turn.voiceOn || !ready) return this._estimate(turn, !turn.voiceOn ? "未开启配音" : "CosyVoice3 " + ((this.status.tts && this.status.tts.state) || "未就绪"));
    const t0 = performance.now();
    turn.abort = new AbortController();
    bus.emit("voice.request", { turnId: turn.id, actorId: turn.who, lang: turn.lang });
    try {
      const res = await fetch("/api/tts/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ who: turn.who, text: turn.text, lang: turn.lang }), signal: turn.abort.signal });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "HTTP " + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const d = JSON.parse(line);
          if (d.type === "meta") {
            turn.meta = d;
            turn.voice = { source: "CosyVoice3", job: d.job, clauses: d.clauses };
          } else if (d.type === "clause") {
            if (turn.ms.firstAudio == null) turn.ms.firstAudio = Math.round(performance.now() - t0);
            const bin = atob(d.pcm);
            const i16 = new Int16Array(bin.length / 2);
            for (let k = 0; k < i16.length; k += 1) i16[k] = (bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8)) << 16 >> 16;
            const f32 = new Float32Array(i16.length);
            for (let k = 0; k < i16.length; k += 1) f32[k] = i16[k] / 32768;
            this._clause(turn, { i: d.i, f32, sr: turn.meta.sr, dur: d.dur, pause: d.pause, v: d.v, o: d.o, ct: d.ct, text: d.text, cached: d.cached });
          } else if (d.type === "done") {
            turn.final = { url: d.url, lipsync: d.lipsync };
            turn.ms.total = Math.round(performance.now() - t0);
            turn.streamDone = true;
            if (turn.L && turn.phase === "speaking") turn.L.dur = Math.max(0, turn.cursor - (turn.lastPause || 0));
            bus.emit("voice.ready", { turnId: turn.id, actorId: turn.who, firstMs: turn.ms.firstAudio, totalMs: turn.ms.total, clauses: turn.clauses.length });
          } else if (d.type === "error") throw new Error(d.error);
        }
      }
    } catch (e) {
      if (turn.abort.signal.aborted) return;
      if (!turn.clauses.length) return this._estimate(turn, "配音失败：" + e.message);
      turn.streamDone = true;
      turn.voiceError = e.message;
    }
    this._emit(turn);
    this._pump();
  }

  _estimate(turn, reason) {
    const L = estimateLipsync(turn);
    turn.voice = { source: "estimate", reason };
    this._clause(turn, { i: 0, f32: null, sr: 24000, dur: L.dur, pause: 0, v: L.v, o: L.o, ct: L.ct, text: turn.text });
    turn.streamDone = true;
    bus.emit("voice.estimate", { turnId: turn.id, actorId: turn.who, reason });
    this._emit(turn);
    this._pump();
  }

  _clause(turn, c) {
    turn.clauses.push(c);
    if (!turn.audioReady) {
      turn.audioReady = true;
      turn.audioReadyAt = this.now();
    }
    if (turn.phase === "speaking") this._schedule(turn, c);
    this._emit(turn);
    this._pump();
  }

  /* ------------------------------------------------------------ flow */
  _pump() {
    const c = this.current;
    if (c && c.phase !== "done") {
      if (c.phase === "preparing" && c.audioReady) {
        const waited = this.now() - c.audioReadyAt;
        if (c.plan || c.decisionFailed || waited > DECIDE_WAIT) this._start(c);
      }
      return;
    }
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    next.phase = "preparing";
    next.status = "preparing";
    const t = this.now();
    Object.values(this.stage.actors).forEach((a) => cancelFuture(a, t));
    prepare(this.stage.actors, next, t);
    if (next.plan) intent(this.cat, this.stage.actors, next, next.plan, t + 0.05);
    this.stage.openBubble(next, t);
    if (next.plan) this.stage.styleBubble(next.id, next.plan.bubble.id);
    this.stage.focus = next.who;
    this.stage.orbOn = next.who === "orb";
    bus.emit("turn.prepare", { turnId: next.id, actorId: next.who });
    this._emit(next);
    this._pump();
  }

  _start(turn) {
    const t = this.now();
    turn.phase = "speaking";
    turn.status = "speaking";
    if (!turn.plan) {
      turn.plan = makePlan(this.cat, turn);
      turn.plan.provisional = true;
    }
    const L = { who: turn.who, text: turn.text, dur: 0, v: "", o: "", ct: [], lang: turn.lang };
    if (turn.gloss) L.gloss = turn.gloss;
    turn.lipId = "live_" + turn.id;
    window.LIPSYNC[turn.lipId] = L;
    turn.L = L;
    const lead = 0.06;
    turn.T = t + lead;
    turn.cursor = 0;
    turn.sources = [];
    if (this.ctx) turn.ctxStart = this.ctx.currentTime + lead;
    turn.clauses.forEach((c) => this._schedule(turn, c));
    turn.est = this._estimateTotal(turn);
    perform(this.cat, this.stage.actors, turn, turn.plan, turn.T, turn.est);
    this.stage.speakBubble(turn.id, turn.T, L);
    this.stage.focus = turn.who;
    this.stage.orbOn = turn.who === "orb";
    // the meters move when the line lands
    const p = turn.plan;
    this.stage.melon = clamp(this.stage.melon + 0.03 + 0.07 * (p.drama || 0), 0, 1);
    if (this.stage.hearts[turn.who] != null) this.stage.hearts[turn.who] = clamp(this.stage.hearts[turn.who] + ((p.persuasion || 1) - 1.2) * 3.2, 30, 99.9);
    // a rebuttal costs every owner it answers a little of the audience's heart
    if (p.stance && ["rebut", "mock"].includes(p.stance.id))
      [...new Set(quotesOf(turn).map((q) => q.who))].forEach((q) => {
        if (q !== turn.who && this.stage.hearts[q] != null) this.stage.hearts[q] = clamp(this.stage.hearts[q] - 1 - 0.9 * (p.drama || 0), 30, 99.9);
      });
    turn.ms.speak = Math.round(performance.now() - turn.sentAt);
    bus.emit("actor.speak", { turnId: turn.id, actorId: turn.who, emotion: p.expr.id, gesture: p.gesture.id, act: p.act.id, gaze: p.target });
    Object.entries(p.listeners).forEach(([w, x]) => bus.emit("actor.react", { turnId: turn.id, actorId: w, emotion: x.id }));
    this._emit(turn);
  }

  _estimateTotal(turn) {
    const got = turn.clauses.reduce((s, c) => s + c.dur + c.pause, 0);
    const chars = turn.clauses.reduce((s, c) => s + c.text.length, 0);
    if (turn.streamDone || chars >= turn.text.length) return Math.max(0.6, got);
    const rate = chars ? got / chars : turn.lang === "fr" ? 0.09 : 0.19;
    return Math.max(0.6, got + (turn.text.length - chars) * rate);
  }

  // place a clause on the shared audio clock and extend the lip / typewriter tracks
  _schedule(turn, c) {
    const L = turn.L;
    let startAt = turn.cursor;
    if (c.f32 && this.ctx) {
      const elapsed = this.ctx.currentTime - turn.ctxStart;
      startAt = Math.max(turn.cursor, elapsed + 0.03);
      const buf = this.ctx.createBuffer(1, c.f32.length, c.sr);
      buf.copyToChannel(c.f32, 0);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gain);
      src.start(turn.ctxStart + startAt);
      turn.sources.push(src);
    }
    const f0 = Math.round(startAt * 30);
    if (L.v.length < f0) {
      L.v += "0".repeat(f0 - L.v.length);
      L.o += "0".repeat(f0 - L.o.length);
    }
    L.v = L.v.slice(0, f0) + c.v;
    L.o = L.o.slice(0, f0) + c.o;
    c.ct.forEach((x) => L.ct.push(+(startAt + x).toFixed(3)));
    turn.cursor = startAt + c.dur + c.pause;
    turn.lastPause = c.pause;
    L.dur = turn.streamDone && turn.clauses[turn.clauses.length - 1] === c ? startAt + c.dur : turn.cursor;
  }

  _finish(turn) {
    const t = this.now();
    turn.phase = "done";
    turn.status = "done";
    turn.ms.dur = turn.L ? +turn.L.dur.toFixed(2) : null;
    this.stage.focus = null;
    this.stage.orbOn = false;
    this.stage.closeBubble(turn.id, t + 3.2);
    settle(this.stage.actors, t + 2.6);
    bus.emit("speech.ended", { turnId: turn.id, actorId: turn.who });
    this.current = null;
    this._emit(turn);
    this._pump();
  }

  _interrupt(silent) {
    const c = this.current;
    if (!c) return;
    const t = this.now();
    (c.sources || []).forEach((s) => {
      try {
        s.stop();
      } catch (e) {
        /* already stopped */
      }
    });
    if (c.abort) c.abort.abort();
    if (c.L) c.L.dur = Math.max(0, Math.min(c.L.dur, t - c.T));
    c.phase = "done";
    c.status = "interrupted";
    Object.values(this.stage.actors).forEach((a) => cancelFuture(a, t));
    if (!silent) interrupted(this.stage.actors, c.who, t);
    else settle(this.stage.actors, t + 0.2);
    this.stage.closeBubble(c.id, t + 0.1);
    this.stage.focus = null;
    this.stage.orbOn = false;
    bus.emit("turn.cancel", { turnId: c.id, actorId: c.who });
    this.current = null;
    this._emit(c);
  }

  /* ------------------------------------------------------------ clock */
  _tick(nowMs) {
    const dt = Math.min(0.1, (nowMs - this._last) / 1000);
    this._last = nowMs;
    const t = this.now();
    const c = this.current;
    if (c) {
      if (c.phase === "preparing") this._pump();
      else if (c.phase === "speaking") {
        if (!c.streamDone) c.est = Math.max(c.est, this._estimateTotal(c));
        if (c.streamDone && t > c.T + c.L.dur + 0.2) this._finish(c);
        if (c.who === "orb" && c.L) {
          const fr = Math.floor((t - c.T) * 30);
          this.stage.orbLevel = fr >= 0 && fr < c.L.o.length ? +c.L.o.charAt(fr) / 9 : 0;
        }
      }
    }
    this.stage.render(t, dt);
    requestAnimationFrame(this._tick);
  }

  // what each agent is doing right now (agent dock)
  agentState(w) {
    const t = this.now();
    const c = this.current;
    const a = this.stage.actors[w];
    const row = (list) => {
      let r = null;
      for (const x of list) {
        if (x[0] <= t) r = x;
        else break;
      }
      return r;
    };
    let status = "idle", level = 0;
    if (c && c.who === w) {
      status = c.phase === "speaking" ? "speaking" : "preparing";
      if (c.L && c.phase === "speaking") {
        const fr = Math.floor((t - c.T) * 30);
        level = fr >= 0 && fr < c.L.o.length ? +c.L.o.charAt(fr) / 9 : 0;
      }
    } else if (c && c.phase === "speaking" && STAGE.includes(w) && t > c.T + 0.2 * (c.est || 1)) status = "reacting";
    if (!a) return { status, level, expr: null, pose: null };
    const e = row(a.expr), p = row(a.pose);
    return { status, level, expr: e ? e[1] : "idle", pose: p ? p[1] : "rest" };
  }
}

// no audio: a rough lip track from the character count
export function estimateLipsync(turn) {
  const text = turn.text;
  const per = turn.lang === "fr" ? 0.09 : 0.19;
  const ct = [];
  let t = 0.05;
  for (const ch of text) {
    ct.push(+t.toFixed(3));
    t += PUNCT.includes(ch) ? 0.16 : per;
  }
  const dur = Math.max(0.8, t);
  const n = Math.ceil(dur * 30);
  let v = "", o = "";
  const cyc = [1, 3, 2, 4, 1, 5, 3];
  for (let f = 0; f < n; f += 1) {
    const tt = f / 30;
    let ci = -1;
    for (let i = 0; i < ct.length; i += 1) if (tt >= ct[i]) ci = i;
    const ch = text[ci] || " ";
    const pause = ci < 0 || PUNCT.includes(ch);
    v += pause ? 0 : cyc[(ch.charCodeAt(0) + ci) % cyc.length];
    o += pause ? 0 : Math.round(3 + 5 * Math.abs(Math.sin(((tt - ct[ci]) / per) * Math.PI)));
  }
  return { who: turn.who, text, dur: +dur.toFixed(3), v, o, ct };
}

export { truthAnswers };
