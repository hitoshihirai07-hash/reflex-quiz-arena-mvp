const $ = (sel) => document.querySelector(sel);

const BASE_DAMAGE = {1:8,2:10,3:12,4:14};
const TIME_LIMIT = {1:6.0,2:5.0,3:4.5,4:4.0}; // used by CPU mode difficulty; story uses question difficulty
const SPEED_BONUS_CAP = 2.0; // seconds
const SPEED_BONUS_MAX = 0.4; // +40%

// Reflect tuning (simple MVP)
const REFLECT = {
  normalReduce: 0.5,
  justReduce: 0.2,
  justReturnRate: 0.1
};

// Projectile difficulty by genre (affects human reflect window)
const PROJECTILE = {
  calc:  { preDelay: 450, windowMs: 280, justMs: 70, label: "高速弾" },
  memory:{ preDelay: 520, windowMs: 360, justMs: 80, label: "分裂弾" },
  logic: { preDelay: 600, windowMs: 320, justMs: 75, label: "フェイント弾" },
};

let QUESTIONS = [];
let BOSSES = [];

async function loadData() {
  const q = await fetch("./data/questions.json").then(r => r.json());
  const b = await fetch("./data/bosses.json").then(r => r.json());
  QUESTIONS = q;
  BOSSES = b;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function pickWeighted(weights) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((s,[,v])=>s+v,0);
  let r = Math.random()*sum;
  for (const [k,v] of entries){
    r -= v;
    if (r <= 0) return k;
  }
  return entries[entries.length-1][0];
}

function pickQuestion(modeCtx) {
  // modeCtx: { weights, preferSquare, maxDifficulty? }
  const genre = pickWeighted(modeCtx.weights);
  let pool = QUESTIONS.filter(q => q.genre === genre);

  if (genre === "calc" && modeCtx.preferSquare) {
    const sq = pool.filter(q => q.id.startsWith("calc_sq_"));
    if (sq.length && Math.random() < 0.45) pool = sq;
  }
  // optional difficulty filter
  if (modeCtx.maxDifficulty) pool = pool.filter(q => q.difficulty <= modeCtx.maxDifficulty);

  return pool[Math.floor(Math.random()*pool.length)];
}

function nowMs(){ return performance.now(); }
function fmtSec(ms){ return (ms/1000).toFixed(2); }

function screenTitle() {
  const el = $("#screen");
  el.innerHTML = `
    <div class="grid">
      <button class="btn" id="goModes">START</button>
      <div class="notice">
        <b>操作</b><br>
        4択：クリック / キー(1〜4) / ローカルPvPは P1(A,S,D,F) / P2(J,K,L,;) でも回答可<br>
        数字入力：入力して Enter で送信（ローカルPvPは各自入力欄）<br>
        反射：<b>SPACE</b>（タイミングで成功/ジャスト）
      </div>
    </div>
  `;
  $("#goModes").onclick = screenModes;
}

function screenModes() {
  const el = $("#screen");
  el.innerHTML = `
    <h2>モード選択</h2>
    <div class="grid cols2">
      <button class="btn" id="storyBtn">ストーリー（ボス3体）</button>
      <button class="btn" id="cpuBtn">CPU対戦</button>
      <button class="btn secondary" id="pvpBtn">ローカルPvP（2人）</button>
      <button class="btn danger" id="backBtn">戻る</button>
    </div>
    <p class="p">オンライン対戦はこのMVPでは未実装（ルールは同問題同時出題を想定）。</p>
  `;
  $("#backBtn").onclick = screenTitle;
  $("#storyBtn").onclick = () => startStory();
  $("#cpuBtn").onclick = () => screenCpuConfig();
  $("#pvpBtn").onclick = () => startLocalPvp();
}

function screenCpuConfig() {
  const el = $("#screen");
  el.innerHTML = `
    <h2>CPU対戦</h2>
    <div class="grid cols2">
      <button class="btn" data-d="1">弱</button>
      <button class="btn" data-d="2">中</button>
      <button class="btn" data-d="3">強</button>
      <button class="btn" data-d="4">鬼</button>
      <button class="btn danger" id="backBtn">戻る</button>
    </div>
    <p class="p">難易度は <b>CPUの回答速度/正答率/反射精度</b> に影響します。</p>
  `;
  el.querySelectorAll("button[data-d]").forEach(btn => {
    btn.onclick = () => startCpuMatch(parseInt(btn.dataset.d,10));
  });
  $("#backBtn").onclick = screenModes;
}

// ---------------- Battle Engine ----------------

function makeCpuProfile(level) {
  if (level===1) return { avg: 2.6, correct: 0.70, refl: 0.55, just: 0.00 };
  if (level===2) return { avg: 1.9, correct: 0.82, refl: 0.70, just: 0.05 };
  if (level===3) return { avg: 1.3, correct: 0.92, refl: 0.85, just: 0.12 };
  return { avg: 1.0, correct: 0.97, refl: 0.93, just: 0.18 };
}

function speedMultiplier(mySec, oppSec) {
  const diff = Math.max(0, Math.min(SPEED_BONUS_CAP, oppSec - mySec));
  return 1 + (diff / SPEED_BONUS_CAP) * SPEED_BONUS_MAX;
}

function baseDamageFromQuestion(q) {
  return BASE_DAMAGE[q.difficulty] ?? 10;
}

function renderKpi(hp1, hp2, info) {
  return `
    <div class="kpi">
      <div class="box">
        <div class="label">P1 HP</div>
        <div class="value">${Math.max(0, Math.round(hp1))}</div>
      </div>
      <div class="box">
        <div class="label">P2 HP</div>
        <div class="value">${Math.max(0, Math.round(hp2))}</div>
      </div>
      <div class="box">
        <div class="label">ジャンル</div>
        <div class="value">${info.genreLabel}</div>
      </div>
      <div class="box">
        <div class="label">形式</div>
        <div class="value">${info.formatLabel}</div>
      </div>
    </div>
  `;
}

function genreLabel(g) {
  if (g==="calc") return "計算";
  if (g==="memory") return "記憶";
  return "論理";
}

function formatLabel(f) {
  return f==="mcq" ? "4択" : "数字入力";
}

function computeCorrect(q, answer) {
  if (q.format==="mcq") {
    return parseInt(answer,10) === q.answer_index;
  }
  // numeric
  const v = parseInt(String(answer).trim(),10);
  return Number.isFinite(v) && v === q.answer_value;
}

function screenBattle(state) {
  const el = $("#screen");
  const q = state.currentQ;
  const info = { genreLabel: genreLabel(q.genre), formatLabel: formatLabel(q.format) };

  // Memory: show sequence briefly, then ask (MVP: show sequence text)
  let memoryBlock = "";
  if (q.genre==="memory" && q.memory) {
    memoryBlock = `
      <div class="notice">
        <b>記憶表示（${q.memory.show_ms}ms）:</b>
        <span id="memSeq"> ${q.memory.sequence.join(" ")} </span>
      </div>
    `;
  }

  const isPvP = state.mode === "pvp";
  const rightName = state.mode === "cpu" ? "CPU" : (state.mode==="story" ? state.boss.name : "P2");

  const leftPanel = renderAnswerPanel("P1", q, "p1", isPvP);
  const rightPanel = renderAnswerPanel(rightName, q, "p2", isPvP);

  el.innerHTML = `
    <h2>${state.title}</h2>
    ${renderKpi(state.hp.p1, state.hp.p2, info)}
    <div class="hr"></div>
    ${memoryBlock}
    <div class="answer-panel">
      <div class="badge">問題</div>
      <div style="font-size:18px;font-weight:800;margin-top:8px">${escapeHtml(q.prompt)}</div>
      <div class="small">※両方の回答が揃うと判定 → 反射フェイズ</div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="col">${leftPanel}</div>
      <div class="col">${rightPanel}</div>
    </div>
    <div class="hr"></div>
    <div class="row">
      <div class="col">
        <div class="log" id="log">${state.log.map(l=>escapeHtml(l)).join("<br>")}</div>
      </div>
      <div class="col center">
        <button class="btn danger" id="quitBtn">中断して戻る</button>
      </div>
    </div>
  `;

  $("#quitBtn").onclick = () => screenModes();

  // Memory: hide after show_ms
  if (q.genre==="memory" && q.memory) {
    setTimeout(()=> {
      const m = $("#memSeq");
      if (m) m.textContent = "（非表示）";
    }, q.memory.show_ms);
  }

  attachInputHandlers(state);
  if (state.mode === "cpu" || state.mode === "story") {
    scheduleCpuAnswer(state);
  }
}

function renderAnswerPanel(name, q, side, isPvP) {
  const idPrefix = side;
  const disabledAttr = `disabled`;
  if (q.format==="mcq") {
    const btns = q.choices.map((c, idx) =>
      `<button class="btn choice" id="${idPrefix}_c${idx}" data-side="${side}" data-ans="${idx}">
        ${escapeHtml(c)}
      </button>`
    ).join("");
    return `
      <div class="answer-panel">
        <div class="badge">${escapeHtml(name)}</div>
        <div class="small">4択：クリック / キー</div>
        <div class="grid" style="margin-top:10px">${btns}</div>
        ${isPvP ? `<div class="small" style="margin-top:8px">${side==="p1"?"P1キー: A/S/D/F":"P2キー: J/K/L/;"}</div>` : ``}
      </div>
    `;
  }
  // numeric
  return `
    <div class="answer-panel">
      <div class="badge">${escapeHtml(name)}</div>
      <div class="small">数字入力：Enterで送信</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="${idPrefix}_num" placeholder="数字を入力" inputmode="numeric" />
        <button class="btn" id="${idPrefix}_send" data-side="${side}">送信</button>
      </div>
      ${isPvP ? `<div class="small" style="margin-top:8px">（各自の入力欄でOK）</div>` : ``}
    </div>
  `;
}

function attachInputHandlers(state) {
  const q = state.currentQ;

  // MCQ click
  if (q.format==="mcq") {
    for (let i=0;i<4;i++){
      const btn1 = $(`#p1_c${i}`);
      const btn2 = $(`#p2_c${i}`);
      if (btn1) btn1.onclick = () => submitAnswer(state, "p1", i);
      if (btn2) btn2.onclick = () => submitAnswer(state, "p2", i);
    }
    // keyboard
    const handler = (e) => {
      if (state.phase !== "question") return;
      const k = e.key;
      // universal 1-4 -> P1 by default (useful for solo)
      if (["1","2","3","4"].includes(k)) {
        submitAnswer(state, "p1", parseInt(k,10)-1);
      }
      // PvP mapping
      if (state.mode==="pvp") {
        const p1 = { "a":0,"s":1,"d":2,"f":3, "A":0,"S":1,"D":2,"F":3 };
        const p2 = { "j":0,"k":1,"l":2,";":3, "J":0,"K":1,"L":2, ":":3 };
        if (k in p1) submitAnswer(state,"p1",p1[k]);
        if (k in p2) submitAnswer(state,"p2",p2[k]);
      }
    };
    state._keyHandler = handler;
    window.addEventListener("keydown", handler);
  } else {
    // numeric
    const s1 = $("#p1_send");
    const s2 = $("#p2_send");
    const i1 = $("#p1_num");
    const i2 = $("#p2_num");
    if (s1) s1.onclick = () => submitAnswer(state, "p1", i1.value);
    if (s2) s2.onclick = () => submitAnswer(state, "p2", i2.value);

    const handler = (e) => {
      if (state.phase !== "question") return;
      if (e.key === "Enter") {
        // try both (for PvP), else P1
        if (state.mode==="pvp") {
          if (document.activeElement === i2) submitAnswer(state,"p2", i2.value);
          else submitAnswer(state,"p1", i1.value);
        } else {
          submitAnswer(state,"p1", i1.value);
        }
      }
    };
    state._keyHandler = handler;
    window.addEventListener("keydown", handler);
  }
}

function detachKey(state) {
  if (state._keyHandler) {
    window.removeEventListener("keydown", state._keyHandler);
    state._keyHandler = null;
  }
}

function submitAnswer(state, side, ans) {
  if (state.phase !== "question") return;
  if (state.answered[side]) return;

  const t = (nowMs() - state.questionStartMs) / 1000;
  const correct = computeCorrect(state.currentQ, ans);

  state.answered[side] = { ans, timeSec: t, correct };
  state.log.push(`${side.toUpperCase()} 回答: ${correct?"○":"×"}  (${t.toFixed(2)}s)`);

  // disable panel quickly (visual)
  if (state.currentQ.format==="mcq") {
    for (let i=0;i<4;i++){
      const btn = $(`#${side}_c${i}`);
      if (btn) btn.disabled = true;
    }
  } else {
    const inp = $(`#${side}_num`);
    const btn = $(`#${side}_send`);
    if (inp) inp.disabled = true;
    if (btn) btn.disabled = true;
  }

  // If CPU/Story and side is CPU, do nothing extra
  // If both answered (or time limit reached), resolve
  if (state.answered.p1 && state.answered.p2) {
    resolveQuestion(state);
  }
}

function scheduleCpuAnswer(state) {
  // CPU is p2
  const cpu = state.cpuProfile;
  const q = state.currentQ;
  const think = Math.max(0.3, cpu.avg + (Math.random()-0.5)*0.6);
  const willCorrect = Math.random() < cpu.correct;

  setTimeout(() => {
    if (state.phase !== "question" || state.answered.p2) return;
    if (q.format==="mcq") {
      let ansIdx;
      if (willCorrect) ansIdx = q.answer_index;
      else {
        const opts = [0,1,2,3].filter(x=>x!==q.answer_index);
        ansIdx = opts[Math.floor(Math.random()*opts.length)];
      }
      submitAnswer(state, "p2", ansIdx);
    } else {
      let val;
      if (willCorrect) val = q.answer_value;
      else val = q.answer_value + (Math.random()<0.5 ? 1 : -1) * (1+Math.floor(Math.random()*3));
      submitAnswer(state, "p2", String(val));
    }
  }, think*1000);
}

function resolveQuestion(state) {
  // cleanup key handler for question phase
  detachKey(state);

  const a1 = state.answered.p1;
  const a2 = state.answered.p2;

  let attacker = null;
  if (a1.correct && a2.correct) {
    attacker = (a1.timeSec <= a2.timeSec) ? "p1" : "p2";
  } else if (a1.correct && !a2.correct) attacker = "p1";
  else if (!a1.correct && a2.correct) attacker = "p2";
  else attacker = null;

  if (!attacker) {
    state.log.push("判定：両者不正解 → ノーダメ");
    nextRound(state, 700);
    return;
  }

  const defender = attacker === "p1" ? "p2" : "p1";
  state.attacker = attacker;
  state.defender = defender;

  // compute damage before reflect
  const q = state.currentQ;
  const base = baseDamageFromQuestion(q);
  const my = state.answered[attacker].timeSec;
  const opp = state.answered[defender].timeSec;
  const mult = speedMultiplier(my, opp);
  state.pending = {
    base,
    mult,
    total: base * mult,
    genre: q.genre
  };

  state.log.push(`攻撃権：${attacker.toUpperCase()}（${(base*mult).toFixed(1)} dmg 予定）`);

  startReflectPhase(state);
}

function startReflectPhase(state) {
  state.phase = "reflect";
  const q = state.currentQ;
  const proj = PROJECTILE[q.genre] || PROJECTILE.calc;

  const el = $("#screen");
  const info = { genreLabel: genreLabel(q.genre), formatLabel: formatLabel(q.format) };

  const defenderName = (state.defender==="p2" && (state.mode==="cpu" || state.mode==="story")) ? (state.mode==="story"?state.boss.name:"CPU") : state.defender.toUpperCase();

  el.innerHTML = `
    <h2>${state.title}</h2>
    ${renderKpi(state.hp.p1, state.hp.p2, info)}
    <div class="hr"></div>
    <div class="reflectBox">
      <div class="badge">反射フェイズ</div>
      <div style="font-size:16px;font-weight:800;margin-top:8px">防御側：${escapeHtml(defenderName)}　/　弾：${escapeHtml(proj.label)}</div>
      <p class="p">SPACEで反射（成功で被ダメ半減、ジャストで大幅軽減＋返し）</p>
      <div class="bar"><div id="barFill"></div></div>
      <div class="small" id="reflectHint">準備中…</div>
    </div>
    <div class="hr"></div>
    <div class="log" id="log">${state.log.map(l=>escapeHtml(l)).join("<br>")}</div>
  `;

  // Memory split: two hits
  const hits = (q.genre==="memory") ? 2 : 1;
  state._reflectHits = { total: hits, done: 0, results: [] };

  if (state.mode==="cpu" || state.mode==="story") {
    // defender is CPU if defender == p2 else human
    if (state.defender === "p2") {
      simulateCpuReflect(state, hits);
      return;
    }
  }

  // Human reflect
  runHumanReflect(state, hits, proj);
}

function simulateCpuReflect(state, hits) {
  const cpu = state.cpuProfileDef || state.cpuProfile; // defender profile
  const q = state.currentQ;
  const proj = PROJECTILE[q.genre] || PROJECTILE.calc;

  const doOne = () => {
    const roll = Math.random();
    let outcome = "fail";
    if (roll < cpu.just) outcome = "just";
    else if (roll < cpu.refl) outcome = "ok";
    state._reflectHits.results.push(outcome);
    state._reflectHits.done++;
  };

  // emulate timing
  let delay = proj.preDelay;
  for (let i=0;i<hits;i++){
    setTimeout(()=>{ doOne(); updateBar(state, (i+1)/hits); }, delay + i*(proj.windowMs+120));
  }
  setTimeout(()=>applyReflectDamage(state), delay + hits*(proj.windowMs+140));
}

function updateBar(state, frac) {
  const bar = $("#barFill");
  if (!bar) return;
  bar.style.width = `${Math.floor(frac*100)}%`;
}

function runHumanReflect(state, hits, proj) {
  let currentHit = 0;
  let windowStart = 0;
  let windowEnd = 0;
  let justEnd = 0;
  let active = false;

  const hint = $("#reflectHint");
  const bar = $("#barFill");
  const q = state.currentQ;

  const startHit = () => {
    currentHit++;
    active = false;
    hint.textContent = (q.genre==="logic") ? "（フェイント中…）" : "準備…";
    bar.style.width = `${Math.floor(((currentHit-1)/hits)*100)}%`;

    // logic feint: show fake cue then real window later
    const extraDelay = (q.genre==="logic") ? 250 : 0;
    const pre = proj.preDelay + extraDelay;
    setTimeout(() => {
      const t0 = nowMs();
      windowStart = t0;
      windowEnd = t0 + proj.windowMs;
      justEnd = t0 + proj.justMs;
      active = true;
      hint.textContent = `SPACEで反射！（${currentHit}/${hits})`;
      // animate fill over window
      const animStart = nowMs();
      const step = () => {
        if (!active) return;
        const p = Math.min(1, (nowMs()-animStart)/proj.windowMs);
        const baseFrac = (currentHit-1)/hits;
        const frac = baseFrac + p*(1/hits);
        bar.style.width = `${Math.floor(frac*100)}%`;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);

      // auto fail if no input
      setTimeout(() => {
        if (!active) return;
        active = false;
        state._reflectHits.results.push("fail");
        hint.textContent = "反射失敗";
        nextOrFinish();
      }, proj.windowMs + 10);
    }, pre);
  };

  const nextOrFinish = () => {
    state._reflectHits.done++;
    if (state._reflectHits.done >= hits) {
      applyReflectDamage(state);
    } else {
      setTimeout(startHit, 280);
    }
  };

  const onKey = (e) => {
    if (e.code !== "Space") return;
    if (state.phase !== "reflect") return;
    if (!active) return;

    const t = nowMs();
    active = false;
    let outcome = "ok";
    if (t <= justEnd) outcome = "just";
    state._reflectHits.results.push(outcome);
    hint.textContent = outcome==="just" ? "ジャスト反射！" : "反射成功";
    nextOrFinish();
  };

  state._keyHandler = onKey;
  window.addEventListener("keydown", onKey);

  // Start first hit
  startHit();
}

function applyReflectDamage(state) {
  // cleanup reflect key
  detachKey(state);

  const q = state.currentQ;
  const total = state.pending.total;
  const hits = state._reflectHits.total;
  const perHit = total / hits;

  let dealtToDef = 0;
  let dealtToAtk = 0;

  for (const outcome of state._reflectHits.results) {
    if (outcome === "just") {
      dealtToDef += perHit * REFLECT.justReduce;
      dealtToAtk += (baseDamageFromQuestion(q)) * REFLECT.justReturnRate; // small fixed return
    } else if (outcome === "ok") {
      dealtToDef += perHit * REFLECT.normalReduce;
    } else {
      dealtToDef += perHit;
    }
  }

  const attacker = state.attacker;
  const defender = state.defender;

  state.hp[defender] -= dealtToDef;
  state.hp[attacker] -= dealtToAtk;

  state.log.push(`反射結果: ${state._reflectHits.results.join(", ")} → 防御側被ダメ ${(dealtToDef).toFixed(1)} / 返し ${(dealtToAtk).toFixed(1)}`);

  // win check
  if (state.hp.p1 <= 0 || state.hp.p2 <= 0) {
    finishMatch(state);
    return;
  }
  nextRound(state, 900);
}

function nextRound(state, delayMs) {
  setTimeout(() => {
    state.phase = "question";
    state.answered = {p1:null, p2:null};
    state.attacker = null;
    state.defender = null;
    state.pending = null;

    // pick next question
    state.currentQ = pickQuestion(state.modeCtx);
    state.questionStartMs = nowMs();

    // reset CPU defender profile if needed
    state.cpuProfileDef = state.cpuProfile; // simple MVP

    screenBattle(state);
  }, delayMs);
}

function finishMatch(state) {
  const el = $("#screen");
  const winner = (state.hp.p1 <= 0 && state.hp.p2 <= 0) ? "引き分け" : (state.hp.p2 <= 0 ? "P1 勝利" : "P2 勝利");

  el.innerHTML = `
    <h2>${state.title}</h2>
    <div class="notice ${winner.includes("P1") ? "good" : (winner.includes("P2") ? "bad" : "")}">
      <b>結果：</b>${escapeHtml(winner)}
    </div>
    <div class="hr"></div>
    <div class="log">${state.log.map(l=>escapeHtml(l)).join("<br>")}</div>
    <div class="hr"></div>
    <div class="grid cols2">
      <button class="btn" id="againBtn">もう一回</button>
      <button class="btn danger" id="backBtn">モード選択へ</button>
    </div>
  `;
  $("#backBtn").onclick = screenModes;
  $("#againBtn").onclick = () => {
    if (state.mode==="story") startStory();
    else if (state.mode==="cpu") startCpuMatch(state.cpuLevel);
    else startLocalPvp();
  };
}

function startCpuMatch(level) {
  const cpuProfile = makeCpuProfile(level);
  const state = {
    mode: "cpu",
    cpuLevel: level,
    cpuProfile,
    title: `CPU対戦（${["","弱","中","強","鬼"][level]}）`,
    hp: { p1: 100, p2: 100 },
    phase: "question",
    answered: { p1: null, p2: null },
    log: [],
    modeCtx: {
      weights: { calc: 1/3, memory: 1/3, logic: 1/3 },
      preferSquare: (level>=4),
      maxDifficulty: level
    },
    currentQ: null,
    questionStartMs: 0
  };
  state.currentQ = pickQuestion(state.modeCtx);
  state.questionStartMs = nowMs();
  screenBattle(state);
}

function startLocalPvp() {
  const state = {
    mode: "pvp",
    title: "ローカルPvP（2人対戦）",
    hp: { p1: 100, p2: 100 },
    phase: "question",
    answered: { p1: null, p2: null },
    log: [],
    modeCtx: {
      weights: { calc: 1/3, memory: 1/3, logic: 1/3 },
      preferSquare: false
    },
    currentQ: null,
    questionStartMs: 0
  };
  state.currentQ = pickQuestion(state.modeCtx);
  state.questionStartMs = nowMs();
  screenBattle(state);
}

function startStory() {
  // MVP: sequential bosses
  let bossIndex = 0;

  const fightBoss = () => {
    const boss = BOSSES[bossIndex];
    const cpuProfile = {
      avg: boss.cpu.avg_answer_sec,
      correct: boss.cpu.correct_rate,
      refl: boss.cpu.reflect_success,
      just: boss.cpu.reflect_just
    };

    const state = {
      mode: "story",
      boss,
      cpuProfile,
      cpuProfileDef: cpuProfile,
      title: `ストーリー：${bossIndex+1}/3　VS ${boss.name}`,
      hp: { p1: 100, p2: boss.hp },
      phase: "question",
      answered: { p1: null, p2: null },
      log: [`ボス「${boss.name}」出現！`],
      modeCtx: {
        weights: boss.question_weights,
        preferSquare: !!boss.gimmicks.prefer_square_questions
      },
      currentQ: null,
      questionStartMs: 0
    };

    // gimmick: memory show multiplier handled by data (not fully applied in MVP UI)
    state.currentQ = pickQuestion(state.modeCtx);
    // apply memory show multiplier if boss has it
    if (state.currentQ.genre==="memory" && state.currentQ.memory && boss.gimmicks.memory_show_ms_multiplier) {
      state.currentQ = structuredClone(state.currentQ);
      state.currentQ.memory.show_ms = Math.max(350, Math.floor(state.currentQ.memory.show_ms * boss.gimmicks.memory_show_ms_multiplier));
    }
    state.questionStartMs = nowMs();

    // override pickQuestion to apply gimmick every round
    const originalNextRound = nextRound;
    // We'll keep it simple: on each round, pick then apply memory multiplier
    state._storyPick = () => {
      let q = pickQuestion(state.modeCtx);
      if (q.genre==="memory" && q.memory && boss.gimmicks.memory_show_ms_multiplier) {
        q = structuredClone(q);
        q.memory.show_ms = Math.max(350, Math.floor(q.memory.show_ms * boss.gimmicks.memory_show_ms_multiplier));
      }
      return q;
    };

    // monkey patch in state by wrapping nextRound usage
    const _nextRound = (st, delayMs) => {
      setTimeout(() => {
        st.phase="question";
        st.answered={p1:null,p2:null};
        st.attacker=null; st.defender=null; st.pending=null;
        st.currentQ = st._storyPick();
        st.questionStartMs = nowMs();
        screenBattle(st);
      }, delayMs);
    };
    state._nextRound = _nextRound;

    // Override nextRound calls used in this file by checking state._nextRound
    state._useCustomNext = true;

    // Patch functions via wrapper (quick MVP hack)
    state._origNextRound = nextRound;
    // We'll re-route by shadowing globally for this story battle only (safe-ish)
    const savedNextRound = window.__nextRoundRef;
    window.__nextRoundRef = _nextRound;

    // Hook finish to progress
    const savedFinish = window.__finishRef;

    // start battle rendering
    screenBattle(state);

    // Wrap nextRound and finishMatch behavior by intercepting in applyReflectDamage/resolve paths:
    // We can't easily without refactor; so we use a simple checker in nextRound() itself:
    // (implemented below by reading window.__nextRoundRef)
    // For finish, we'll use mutation observer? Too much. We'll detect win in finishMatch and provide a "次へ" button.

    // Replace finishMatch for story run
    const _finish = (st) => {
      const el = $("#screen");
      const win = (st.hp.p2 <= 0);
      const lose = (st.hp.p1 <= 0);
      const msg = win ? `ボス撃破！：${boss.name}` : `敗北…：${boss.name}`;
      el.innerHTML = `
        <h2>${st.title}</h2>
        <div class="notice ${win?"good":"bad"}"><b>${escapeHtml(msg)}</b></div>
        <div class="hr"></div>
        <div class="log">${st.log.map(l=>escapeHtml(l)).join("<br>")}</div>
        <div class="hr"></div>
        <div class="grid cols2">
          <button class="btn" id="retryBtn">${win?"次へ":"リトライ"}</button>
          <button class="btn danger" id="backBtn">モード選択へ</button>
        </div>
      `;
      $("#backBtn").onclick = () => {
        window.__nextRoundRef = savedNextRound;
        screenModes();
      };
      $("#retryBtn").onclick = () => {
        window.__nextRoundRef = savedNextRound;
        if (win) {
          bossIndex++;
          if (bossIndex >= BOSSES.length) {
            // story clear
            const el2 = $("#screen");
            el2.innerHTML = `
              <h2>ストーリー</h2>
              <div class="notice good"><b>ストーリークリア！</b></div>
              <p class="p">MVPはここまで。次は演出拡張・オンライン対戦・問題追加など。</p>
              <button class="btn" id="backBtn2">モード選択へ</button>
            `;
            $("#backBtn2").onclick = screenModes;
          } else {
            fightBoss();
          }
        } else {
          fightBoss();
        }
      };
    };

    // store custom finish on state
    state._customFinish = _finish;
    window.__finishRef = _finish;

    // store original for restore when leaving story; restored above
    state._restore = () => {
      window.__nextRoundRef = savedNextRound;
      window.__finishRef = savedFinish;
    };
  };

  fightBoss();
}

// Overwrite nextRound and finishMatch entry points to allow story override (MVP hack)
const _nextRoundReal = nextRound;
const _finishReal = finishMatch;

function nextRound(state, delayMs) {
  if (window.__nextRoundRef && state && state.mode==="story") {
    return window.__nextRoundRef(state, delayMs);
  }
  return _nextRoundReal(state, delayMs);
}
function finishMatch(state) {
  if (window.__finishRef && state && state.mode==="story") {
    return window.__finishRef(state);
  }
  return _finishReal(state);
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

// Boot
(async function(){
  const el = $("#screen");
  el.innerHTML = `<div class="notice">読み込み中…</div>`;
  try{
    await loadData();
    screenTitle();
  }catch(e){
    el.innerHTML = `<div class="notice bad"><b>読み込み失敗</b><br>ローカルで開いている場合は、簡易サーバーで起動してください。<br><span class="small">${escapeHtml(e?.message||e)}</span></div>`;
  }
})();