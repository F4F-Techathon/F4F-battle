// plan.js — Jev answers → a performance plan → rig schedule rows, live.
// A turn goes prepare (the instant it is sent) → intent (Jev answered) →
// perform (first audio). Beats sit at fractions of the spoken line, as in the film.

// The owners on stage, left to right, and their x. roster.js mutates these in place when
// an agent joins, so every importer sees the new cast. The host (orb) and the customer
// (me) are agents too but stand off the floor: the orb above, 我 in the audience.
export const STAGE = ["rong", "hua", "pierre"];
export const X = { rong: 440, hua: 960, pierre: 1480, orb: 960, me: 960 };
// identity colours for the UI (DESIGN.md); the rig's own palettes are untouched
export const EDGE = { rong: "#E57A63", hua: "#4DB393", pierre: "#A18CE6", orb: "#C9B3F2", me: "#D9B77F" };
export const GROUP = { 积极: "#E2B85C", 挖苦: "#A18CE6", 受挫: "#E06C5F", 中性: "#8A93A6", 基态: "#8A93A6" };
// where `who` turns its eyes to face `target` (the film's hand-set vectors, from positions)
export function lookVec(who, target) {
  if (target === "orb") return [Math.sign(960 - (X[who] || 960)) * 0.6, -1];
  if (!target || target === "cam" || target === "me" || X[target] == null || target === who) return [0, 0.15];
  const d = X[target] - (X[who] || 960);
  return [Math.sign(d) || 1, 0.1];
}
// every line this turn answers (older turns and sessions carry a single `quote`)
export function quotesOf(turn) {
  const q = turn.quotes || (turn.quote ? [turn.quote] : []);
  return q.filter((x) => x && x.who);
}
// a listener's body follows its face (how the film pairs them)
const REACT_BODY = {
  shock: { act: ["hop", 0.32], pose: "rest" },
  sweat: { act: ["shiver", 1.2] },
  nervous: { act: ["shiver", 1.0] },
  angry: { act: ["puff", 0.8], pose: "hip" },
  laugh: { act: ["bounce", 1.2], pose: "belly" },
  squeal: { act: ["bounce", 1.4], pose: "belly" },
  smug: { pose: "hip" },
  star: { act: ["hop", 0.35], pose: "clasp" },
  pout: { pose: "hip" },
};
const ACT_DUR = { hop: 0.35, jump: 0.55, shake: 0.5, nod: 0.4, bow: 0.8, puff: 0.6 };
export const GATE = 0.12; // below this Choice confidence the persona default wins

function pick(ans, key, fallback) {
  const a = ans && ans[key];
  if (!a || !a.choice) return { id: fallback, conf: null, gated: false, p: null, missing: true };
  const gated = a.confidence != null && a.confidence < GATE && fallback != null;
  return { id: gated ? fallback : a.choice, conf: a.confidence, gated, p: a.probabilities, top: a.choice };
}

function dirRight(who, target) {
  if (!target || target === "cam" || target === "orb" || target === "me" || X[target] == null) return (X[who] || 960) <= 960; // open toward stage centre
  return X[target] > X[who];
}

export function resolvePose(cat, gestureId, who, target) {
  const g = cat.gestures.find((x) => x.id === gestureId);
  if (!g) return ["rest"];
  if (gestureId === "kiss") return ["kissR", "kissOut"];
  if (g.poses.length === 1) return [g.poses[0]];
  return [dirRight(who, target) ? g.poses[0] : g.poses[1]];
}

// the plan for a turn from its /api/decide answers (+ manual overrides)
export function makePlan(cat, turn) {
  const ans = turn.decision ? turn.decision.response.answers : {};
  const d = cat.characters[turn.who].defaults;
  const ov = turn.override || {};
  const plan = {};
  const take = (slot, key, fb) => {
    const r = pick(ans, key, fb);
    if (ov[slot] != null) {
      r.id = ov[slot];
      r.manual = true;
    }
    plan[slot] = r;
  };
  take("expr", "speaker_expr", d.expr);
  take("punch", "speaker_punch", "same");
  take("gesture", "speaker_gesture", d.gesture);
  take("act", "speaker_act", d.act);
  const qs = quotesOf(turn);
  take("gaze", "speaker_gaze", qs.length ? "quoted" : "audience");
  take("delivery", "delivery", "neutral");
  take("stance", "stance", qs.length ? "rebut" : "pitch");
  take("bubble", "bubble", "normal");
  const sc = (k, fb) => (ans && ans[k] && ans[k].score != null ? ans[k].score : fb);
  plan.intensity = sc("intensity", 1.5);
  plan.drama = sc("drama", qs.length ? 1.5 : 0.5);
  plan.persuasion = sc("persuasion", 1.5);
  plan.listeners = {};
  STAGE.filter((w) => w !== turn.who && cat.characters[w]).forEach((w) => {
    const r = pick(ans, "listener_" + w, cat.characters[w].defaults.reaction);
    if (ov["listener_" + w] != null) {
      r.id = ov["listener_" + w];
      r.manual = true;
    }
    plan.listeners[w] = r;
  });
  // answering several people: face the first, turn to the next mid-line
  const onStage = [...new Set(qs.map((x) => x.who))].filter((w) => w !== turn.who && (STAGE.includes(w) || w === "orb"));
  const q = onStage[0];
  const others = STAGE.filter((w) => w !== turn.who && !onStage.includes(w));
  plan.target = plan.gaze.id === "quoted" && q ? q : plan.gaze.id === "other" && others.length ? others[0] : q || "cam";
  plan.target2 = plan.gaze.id === "quoted" && onStage[1] ? onStage[1] : null;
  if (turn.who === "orb" || turn.who === "me") plan.target = "cam";
  return plan;
}

// drop every beat an actor has scheduled after t (a new turn takes the stage)
export function cancelFuture(a, t) {
  const cut = (list) => {
    for (let i = list.length - 1; i > 0; i -= 1) if (list[i][0] > t) list.splice(i, 1);
  };
  cut(a.expr);
  cut(a.pose);
  cut(a.looks);
  a.acts = a.acts.filter((r) => r[0] <= t);
  a.fxs = a.fxs.filter((r) => r[0] <= t);
}

function lookAt(a, who, target, t) {
  if (!a || !STAGE.includes(who)) return;
  const v = lookVec(who, target);
  a.look(t, v[0], v[1]);
}

// the instant a line is sent: the speaker turns to whoever it answers and draws breath,
// the others turn to the speaker
export function prepare(actors, turn, t) {
  const sp = actors[turn.who];
  const q = (quotesOf(turn).find((x) => x.who !== turn.who) || {}).who;
  if (sp) {
    lookAt(sp, turn.who, q || "cam", t);
    sp.act(t, "stepIn", 0.6, 0.35);
  }
  // the owners turn to whoever speaks — up to the host, out to the audience for 我
  STAGE.filter((w) => w !== turn.who && actors[w]).forEach((w, i) => {
    const a = actors[w];
    lookAt(a, w, turn.who === "orb" ? "orb" : turn.who === "me" ? "cam" : turn.who, t + 0.06 * i);
    a.e(t + 0.08 * i, "listen");
  });
}

// Jev answered: the speaker shows the chosen face and gesture before a word is said
export function intent(cat, actors, turn, plan, t) {
  const sp = actors[turn.who];
  if (!sp) return;
  sp.e(t, plan.expr.id);
  sp.p(t, resolvePose(cat, plan.gesture.id, turn.who, plan.target)[0], 0.3);
  lookAt(sp, turn.who, plan.target, t);
}

// the voice starts at T; est is the expected spoken length (refined as audio arrives)
export function perform(cat, actors, turn, plan, T, est) {
  const who = turn.who;
  const at = (f) => T + f * est;
  const amp = 0.65 + 0.22 * (plan.intensity || 0);
  const sp = actors[who];
  if (sp) {
    sp.say(T, turn.lipId);
    sp.e(T - 0.05, plan.expr.id);
    const poses = resolvePose(cat, plan.gesture.id, who, plan.target);
    sp.p(T - 0.05, poses[0], 0.3);
    if (poses[1]) sp.p(T + 0.45, poses[1], 0.3);
    const act = plan.act.id;
    if (act && act !== "none") {
      let ad = ACT_DUR[act] || 0.6;
      if (act === "bounce") ad = Math.min(1.4, est * 0.9);
      if (act === "shiver" || act === "stepIn") ad = est;
      if (act === "lean") ad = est * 0.45;
      const sign = act === "lean" ? (dirRight(who, plan.target) ? 1 : -1) * 0.6 : amp;
      sp.act(T, act, ad, sign);
    }
    lookAt(sp, who, plan.target, T);
    if (plan.target2) lookAt(sp, who, plan.target2, at(0.48));
    if (plan.punch.id && plan.punch.id !== "same" && plan.punch.id !== plan.expr.id) {
      sp.e(at(0.64), plan.punch.id);
      if (plan.punch.id === "wink" || plan.punch.id === "star") sp.p(at(0.62), resolvePose(cat, "thumb", who, "cam")[0], 0.3);
      if (plan.punch.id === "kiss") sp.p(at(0.66), "kissR", 0.25).p(at(0.82), "kissOut", 0.3);
      if (plan.punch.id === "laugh") sp.act(at(0.64), "bounce", Math.min(1.2, est * 0.5), 1);
    }
  }
  reactions(actors, turn, plan, T, est, T);
}

// listeners: the quoted one reacts early, the bystander a beat later
export function reactions(actors, turn, plan, T, est, notBefore) {
  const qs = quotesOf(turn).map((x) => x.who);
  Object.entries(plan.listeners).forEach(([w, r]) => {
    const a = actors[w];
    if (!a) return;
    const isQ = qs.includes(w);
    const tr = Math.max(notBefore + 0.1, T + (isQ ? 0.22 : 0.4) * est);
    a.e(tr, r.id);
    const b = REACT_BODY[r.id];
    if (b && b.pose) a.p(tr, b.pose, 0.3);
    if (b && b.act) a.act(tr, b.act[0], b.act[1], 1);
  });
}

// someone cut in: the interrupted speaker is startled, then sulks
export function interrupted(actors, who, t) {
  const a = actors[who];
  if (!a) return;
  a.e(t, "shock").act(t, "hop", 0.3, 0.8).p(t, "rest", 0.25).e(t + 0.9, "pout");
}

// after a turn: everyone eases back to attentive idling
export function settle(actors, t) {
  STAGE.forEach((w, i) => {
    const a = actors[w];
    if (!a) return;
    a.e(t + i * 0.15, "idle").p(t + i * 0.15, "rest", 0.4);
    lookAt(a, w, "cam", t + i * 0.15);
  });
}

// film choreography (scene-stage.js) as ground truth for the Jev check
export const FILM_TRUTH = {
  R1: { quote: null, expr: "pitch", gesture: "hip_one", act: "stepIn", punch: "wink", listeners: { hua: "eyeroll", pierre: "haughty" } },
  H1: { quote: "R1", expr: "sly", gesture: "wag", act: "lean", punch: "smug", listeners: { rong: "shock", pierre: "smug" } },
  R2: { quote: "H1", expr: "angry", gesture: "hip_point", act: "shake", punch: "same", listeners: { hua: "sweat", pierre: "laugh" } },
  P0: { quote: "R2", expr: "haughty", gesture: "shrug", act: "none", punch: "same", listeners: { rong: "eyeroll", hua: "eyeroll" } },
  P1: { quote: "R2", expr: "proud", gesture: "present", act: "none", punch: "kiss", listeners: { rong: "think", hua: "sly" } },
  H2: { quote: "P1", expr: "laugh", gesture: "point", act: "bounce", punch: "same", listeners: { pierre: "shock", rong: "laugh" } },
  P2: { quote: "H2", expr: "nervous", gesture: "handsUp", act: "shiver", punch: "same", listeners: { hua: "smug", rong: "sly" } },
  R3: { quote: "P2", expr: "sly", gesture: "hip_point", act: "none", punch: "laugh", listeners: { pierre: "shock", hua: "squeal" } },
  P3: { quote: "R3", expr: "angry", gesture: "hip_point", act: "shake", punch: "same", listeners: { rong: "smug", hua: "laugh" } },
  O3: { quote: null, expr: null, gesture: null, act: null, punch: null, listeners: { rong: "think", hua: "think", pierre: "think" } },
  R4: { quote: "O3", expr: "star", gesture: "wave", act: "stepIn", punch: "wink", listeners: { hua: "eyeroll", pierre: "pout" } },
  H3: { quote: "R4", expr: "pout", gesture: "hip", act: "none", punch: "same", listeners: {} },
  P4: { quote: "R4", expr: "kiss", gesture: "bow", act: "bow", punch: "same", listeners: {} },
};

export function truthAnswers(id) {
  const g = FILM_TRUTH[id];
  if (!g) return null;
  const one = (c) => (c ? { type: "choice", choice: c, probabilities: { [c]: 1 }, confidence: 1 } : undefined);
  const ans = {
    speaker_expr: one(g.expr),
    speaker_punch: one(g.punch),
    speaker_gesture: one(g.gesture),
    speaker_act: one(g.act),
    speaker_gaze: one(g.quote ? "quoted" : "audience"),
  };
  Object.entries(g.listeners).forEach(([w, r]) => (ans["listener_" + w] = one(r)));
  return { source: "film", response: { model: "scene-stage.js 手工编排", answers: ans } };
}
