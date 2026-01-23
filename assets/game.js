const $ = (sel) => document.querySelector(sel);

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function clamp(n,min,max){return Math.max(min, Math.min(max,n));}
function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

const SCORE = { correct: 100, speedMax: 40 };

const MODE_PRESETS = {
  practice:  { label:"練習（ソロ）", bots:0, queueDelayMs: 0, botSkill:"mid", rated:false },

  // 練習：CPU対戦（あなた + CPU3）
  cpu_easy:  { label:"CPU対戦（弱）", bots:3, queueDelayMs: 0, botSkill:"low", rated:false },
  cpu_mid:   { label:"CPU対戦（中）", bots:3, queueDelayMs: 0, botSkill:"mid", rated:false },
  cpu_hard:  { label:"CPU対戦（強）", bots:3, queueDelayMs: 0, botSkill:"high", rated:false },
  cpu_oni:   { label:"CPU対戦（鬼）", bots:3, queueDelayMs: 0, botSkill:"oni", rated:false },

  free:      { label:"フリー対戦", bots:3, queueDelayMs: 900,  botSkill:"mix",   rated:false },
  rated:     { label:"レート対戦", bots:3, queueDelayMs: 1200, botSkill:"match", rated:true  },
};

const GENRE_LABEL = { calc:"計算", memory:"記憶", logic:"論理" };

function getProfile(){
  const raw = localStorage.getItem("rqa_profile_v1");
  if (raw){
    try{ return JSON.parse(raw); }catch{}
  }
  return { rp: 0, mmr: 1000, matches: 0, bestRank: null };
}
function saveProfile(p){ localStorage.setItem("rqa_profile_v1", JSON.stringify(p)); }

function timeNow(){ return performance.now(); }

function pickQuestions(n){
  const pool = window.RQA_QUESTIONS || [];
  const by = {
    calc: pool.filter(q=>q.genre==="calc"),
    memory: pool.filter(q=>q.genre==="memory"),
    logic: pool.filter(q=>q.genre==="logic"),
  };
  const picks = [];
  picks.push(...shuffle(by.calc).slice(0,4));
  picks.push(...shuffle(by.memory).slice(0,3));
  picks.push(...shuffle(by.logic).slice(0,3));
  return shuffle(picks).slice(0,n);
}

function mkBot(name, skill, mmr){
  let avg = 1.7, acc = 0.86;
  if (skill==="low"){ avg = 2.4; acc=0.72; }
  if (skill==="mid"){ avg = 1.7; acc=0.86; }
  if (skill==="high"){ avg = 1.25; acc=0.93; }
  if (skill==="oni"){ avg = 1.05; acc=0.96; }
  if (skill==="mix"){
    const r = Math.random();
    if (r<0.33) {avg=2.3; acc=0.75;}
    else if (r<0.66) {avg=1.7; acc=0.86;}
    else {avg=1.25; acc=0.93;}
  }
  return { type:"bot", name, mmr: mmr ?? 1000, avgSec: avg, acc, score:0, correct:0, timeSum:0, totalTime:0 };
}

function mkPlayer(name){
  return { type:"human", name, mmr: getProfile().mmr, score:0, correct:0, timeSum:0, totalTime:0 };
}

function scoreForAnswer(isCorrect, timeSec, timeLimit){
  if (!isCorrect) return 0;
  const t = clamp(timeSec, 0, timeLimit);
  const speed = (1 - (t / timeLimit));
  const bonus = Math.round(SCORE.speedMax * clamp(speed, 0, 1));
  return SCORE.correct + bonus;
}

function computeCorrect(q, answer){
  if (q.format==="mcq"){
    return parseInt(answer,10) === q.answer_index;
  }
  const v = parseInt(String(answer).trim(),10);
  return Number.isFinite(v) && v === q.answer_value;
}

function renderProfileBar(modeKey){
  const p = getProfile();
  const rated = MODE_PRESETS[modeKey]?.rated;
  const rp = p.rp ?? 0;
  const mmr = p.mmr ?? 1000;
  return `
    <div class="card">
      <div class="kpis">
        <div class="kpi"><div class="label">RP（表示ポイント）</div><div class="value">${rp}</div></div>
        <div class="kpi"><div class="label">内部MMR</div><div class="value">${mmr}</div></div>
        <div class="kpi"><div class="label">試合数</div><div class="value">${p.matches ?? 0}</div></div>
      </div>
      <div class="small" style="margin-top:8px">
        ${rated ? "レート対戦では、近い実力（MMR）同士で対戦し、順位に応じてRPを獲得します（RPは減りません）。" :
                 "フリー対戦はレート変動なし。練習（ソロ）はいつでも遊べます。"}
      </div>
    </div>
  `;
}

function renderPlayHome(){
  const el = $("#app");
  el.innerHTML = `
    <div class="hero">
      <div class="h1">遊ぶ</div>
      <p class="p">10問で決着する4人スコアバトル。まずは練習で感覚を掴んでから、フリー／レートへ。</p>
      <div class="btnRow">
        <button class="btn primary" id="goPractice">練習（ソロ）10問</button>
        <button class="btn" id="goCpuEasy">CPU対戦（弱）</button>
        <button class="btn" id="goCpuMid">CPU対戦（中）</button>
        <button class="btn" id="goCpuHard">CPU対戦（強）</button>
        <button class="btn danger" id="goCpuOni">CPU対戦（鬼）</button>
        <button class="btn" id="goFree">フリー対戦（ランダム）</button>
        <button class="btn warn" id="goRated">レート対戦（近い人同士）</button>
      </div>
      <div class="hr"></div>
      <div class="notice">
        <b>止まらない設計</b><br>
        マッチングが混雑しても、画面が空になったり、ずっと「読み込み中」のままになることはありません。いつでも練習に戻れます。
      </div>
    </div>

    <div class="grid grid2" style="margin-top:12px">
      <div>${renderProfileBar("free")}</div>
      <div class="card">
        <div class="h2">採点（1問あたり）</div>
        <ul class="list">
          <li>正解：+${SCORE.correct}</li>
          <li>早さボーナス：最大 +${SCORE.speedMax}（早いほど加点）</li>
          <li>不正解：0</li>
        </ul>
        <div class="hr"></div>
        <div class="small">同点は「合計スコア → 正解数 → 総回答時間（短い方）」で判定します。</div>
      </div>
    </div>
  `;
  $("#goPractice").onclick = ()=> startMatch("practice");
  $("#goCpuEasy").onclick = ()=> startMatch("cpu_easy");
  $("#goCpuMid").onclick  = ()=> startMatch("cpu_mid");
  $("#goCpuHard").onclick = ()=> startMatch("cpu_hard");
  $("#goCpuOni").onclick  = ()=> startMatch("cpu_oni");
  $("#goFree").onclick = ()=> startQueue("free");
  $("#goRated").onclick = ()=> startQueue("rated");
}

function startQueue(modeKey){
  const preset = MODE_PRESETS[modeKey];
  const el = $("#app");
  const started = timeNow();
  let cancelled = false;

  el.innerHTML = `
    <div class="card">
      <div class="h2">${preset.label}</div>
      <div class="small">対戦相手を探しています…（最大15秒で自動切替）</div>
      <div class="hr"></div>
      <div class="progress"><div id="bar"></div></div>
      <div class="btnRow" style="margin-top:12px">
        <button class="btn danger" id="cancelBtn">キャンセル</button>
        <button class="btn ghost" id="practiceBtn">練習を続ける</button>
      </div>
      <div class="hr"></div>
      <div class="notice">
        <b>待ち時間の間も遊べます</b><br>
        練習10問はいつでも即開始できます。読み込み待ちだけの画面にはしません。
      </div>
    </div>
  `;

  $("#cancelBtn").onclick = ()=> { cancelled = true; renderPlayHome(); };
  $("#practiceBtn").onclick = ()=> { cancelled = true; startMatch("practice"); };

  const bar = $("#bar");
  const tick = () => {
    if (cancelled) return;
    const t = (timeNow() - started);
    const frac = clamp(t / 15000, 0, 1);
    bar.style.width = `${Math.floor(frac*100)}%`;
    if (frac < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  setTimeout(()=>{ if (!cancelled) startMatch(modeKey); }, preset.queueDelayMs);
  setTimeout(()=>{ if (!cancelled) startMatch(modeKey); }, 15000);
}

function startMatch(modeKey){
  const preset = MODE_PRESETS[modeKey];
  const qset = pickQuestions(10);

  const profile = getProfile();
  const meMmr = profile.mmr ?? 1000;

  const players = [];
  players.push(mkPlayer("あなた"));

  if (preset.bots > 0){
    if (preset.botSkill === "match"){
      const botMmrs = [
        meMmr + Math.floor((Math.random()-0.5)*260),
        meMmr + Math.floor((Math.random()-0.5)*260),
        meMmr + Math.floor((Math.random()-0.5)*260),
      ];
      players.push(mkBot("Bot A","mid", botMmrs[0]));
      players.push(mkBot("Bot B","mid", botMmrs[1]));
      players.push(mkBot("Bot C","mid", botMmrs[2]));
    } else if (preset.botSkill === "mix"){
      players.push(mkBot("Bot A","mix"));
      players.push(mkBot("Bot B","mix"));
      players.push(mkBot("Bot C","mix"));
    } else {
      players.push(mkBot("Bot A",preset.botSkill));
      players.push(mkBot("Bot B",preset.botSkill));
      players.push(mkBot("Bot C",preset.botSkill));
    }
  }

  const state = {
    modeKey, preset, players, qset, qIndex: 0,
    timeLimit: 7.0, phase: "question",
    startedAt: null, myAnswered: false, myAnswer: null
  };

  renderMatch(state);
}

function renderMatch(state){
  const el = $("#app");
  const q = state.qset[state.qIndex];
  const n = state.qIndex + 1;

  el.innerHTML = `
    <div class="card">
      <div class="badge ${state.modeKey==="rated" ? "orange" : (state.modeKey==="free" ? "green" : "")}">
        ${escapeHtml(state.preset.label)}
      </div>
      <div class="h2" style="margin-top:10px">第${n}問 / 10　<span class="pill">${GENRE_LABEL[q.genre]}</span> <span class="pill">${q.format==="mcq"?"4択":"数字入力"}</span></div>
      <div class="hr"></div>

      ${q.genre==="memory" && q.memory ? `
        <div class="notice" id="memBox">
          <b>記憶表示（${q.memory.show_ms}ms）:</b>
          <span id="memSeq" style="font-weight:950">${q.memory.sequence.join(" ")}</span>
        </div>
        <div class="hr"></div>
      `: ""}

      <div style="font-size:18px;font-weight:950">${escapeHtml(q.prompt)}</div>
      <div class="small" style="margin-top:6px">制限時間：${state.timeLimit.toFixed(0)}秒　（早いほどボーナス）</div>

      <div class="hr"></div>
      <div id="answerArea"></div>

      <div class="hr"></div>
      <div class="btnRow">
        <button class="btn ghost" id="quitBtn">中断して戻る</button>
      </div>
    </div>

    <div class="grid grid2" style="margin-top:12px">
      <div class="card">
        <div class="h2">スコアボード</div>
        ${renderScoreboard(state)}
      </div>
      <div class="card">
        <div class="h2">この試合の状況</div>
        <div class="small">マッチング待ちでも止まらない設計（練習に切替可）。</div>
        <div class="hr"></div>
        <div class="small" id="timerText">開始準備中…</div>
        <div class="progress" style="margin-top:8px"><div id="timeBar"></div></div>
      </div>
    </div>
  `;

  $("#quitBtn").onclick = renderPlayHome;

  if (q.genre==="memory" && q.memory){
    setTimeout(()=>{
      const m = $("#memSeq");
      if (m) m.textContent = "（非表示）";
    }, q.memory.show_ms);
  }

  const area = $("#answerArea");
  if (q.format==="mcq"){
    const buttons = q.choices.map((c, idx)=> `
      <button class="btn choiceBtn" data-idx="${idx}">${escapeHtml(c)}</button>
    `).join("");
    area.innerHTML = `<div class="grid grid2">${buttons}</div>`;
    area.querySelectorAll("button[data-idx]").forEach(btn=>{
      btn.onclick = ()=> onHumanAnswer(state, parseInt(btn.dataset.idx,10));
    });
    state._keyHandler = (e)=>{
      if (state.phase!=="question") return;
      if (["1","2","3","4"].includes(e.key)){
        onHumanAnswer(state, parseInt(e.key,10)-1);
      }
    };
    window.addEventListener("keydown", state._keyHandler, { once:false });
  }else{
    area.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <input class="input" id="numInput" inputmode="numeric" placeholder="数字を入力" />
        <button class="btn" id="sendBtn">送信</button>
      </div>
    `;
    const inp = $("#numInput");
    const send = ()=> onHumanAnswer(state, inp.value);
    $("#sendBtn").onclick = send;
    state._keyHandler = (e)=>{
      if (state.phase!=="question") return;
      if (e.key==="Enter") send();
    };
    window.addEventListener("keydown", state._keyHandler, { once:false });
    setTimeout(()=>inp.focus(), 50);
  }

  state.phase = "question";
  state.startedAt = timeNow();
  state.myAnswered = false;
  state.myAnswer = null;

  runTimer(state);
  simulateBots(state);
}

function removeKeyHandler(state){
  if (state._keyHandler){
    window.removeEventListener("keydown", state._keyHandler);
    state._keyHandler = null;
  }
}

function runTimer(state){
  const start = state.startedAt;
  const limitMs = state.timeLimit * 1000;

  const tick = ()=>{
    if (state.phase!=="question") return;
    const t = timeNow() - start;
    const left = Math.max(0, limitMs - t);
    const frac = clamp(t / limitMs, 0, 1);
    const bar = $("#timeBar");
    const txt = $("#timerText");
    if (bar) bar.style.width = `${Math.floor(frac*100)}%`;
    if (txt) txt.textContent = `残り ${(left/1000).toFixed(1)} 秒`;
    if (t >= limitMs){
      resolveQuestion(state);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function onHumanAnswer(state, ans){
  if (state.phase!=="question") return;
  if (state.myAnswered) return;
  state.myAnswered = true;
  state.myAnswer = ans;
  resolveQuestion(state);
}

function simulateBots(state){
  const q = state.qset[state.qIndex];
  const start = state.startedAt;

  state.players.forEach((p)=>{
    if (p.type!=="bot") return;
    const t = Math.max(0.45, p.avgSec + (Math.random()-0.5)*0.7);
    setTimeout(()=>{
      if (state.phase!=="question") return;
      const isCorrect = Math.random() < p.acc;
      const timeSec = (timeNow()-start)/1000;
      const pick = ()=>{
        if (q.format==="mcq"){
          if (isCorrect) return q.answer_index;
          const opts=[0,1,2,3].filter(x=>x!==q.answer_index);
          return opts[Math.floor(Math.random()*opts.length)];
        }else{
          if (isCorrect) return q.answer_value;
          return q.answer_value + (Math.random()<0.5?-1:1) * (1+Math.floor(Math.random()*3));
        }
      };
      const ans = pick();
      p._last = { ans, timeSec: Math.min(timeSec, state.timeLimit), correct: computeCorrect(q, ans) };
    }, t*1000);
  });
}

function resolveQuestion(state){
  if (state.phase!=="question") return;
  state.phase = "resolve";

  removeKeyHandler(state);

  const q = state.qset[state.qIndex];
  const endTimeSec = (timeNow() - state.startedAt)/1000;

  const me = state.players[0];
  const myTime = clamp(endTimeSec, 0, state.timeLimit);
  const myCorrect = state.myAnswered ? computeCorrect(q, state.myAnswer) : false;
  const myScore = scoreForAnswer(myCorrect, myTime, state.timeLimit);
  me.score += myScore;
  me.correct += myCorrect ? 1 : 0;
  me.timeSum += myCorrect ? myTime : 0;
  me.totalTime += myTime;

  for (let i=1;i<state.players.length;i++){
    const p = state.players[i];
    if (p.type!=="bot") continue;
    const last = p._last;
    const correct = last?.correct ?? false;
    const timeSec = clamp(last?.timeSec ?? state.timeLimit, 0, state.timeLimit);
    const sc = scoreForAnswer(correct, timeSec, state.timeLimit);
    p.score += sc;
    p.correct += correct ? 1 : 0;
    p.timeSum += correct ? timeSec : 0;
    p.totalTime += timeSec;
    p._last = null;
  }

  const area = $("#answerArea");
  const msg = myCorrect ? `<div class="notice good"><b>正解！</b> +${myScore}</div>`
                        : `<div class="notice bad"><b>不正解</b> +0</div>`;
  area.innerHTML = msg + `<div class="small" style="margin-top:8px">次の問題へ進みます…</div>`;

  const boardCard = document.querySelector(".card .table")?.closest(".card");
  if (boardCard){
    boardCard.innerHTML = `<div class="h2">スコアボード</div>${renderScoreboard(state)}`;
  }

  setTimeout(()=> nextQuestion(state), 900);
}

function rankPlayers(players){
  const arr = players.slice();
  arr.sort((a,b)=>{
    if (b.score !== a.score) return b.score - a.score;
    if (b.correct !== a.correct) return b.correct - a.correct;
    // 同点判定：総回答時間（短い方が上）
    if ((a.totalTime ?? 0) !== (b.totalTime ?? 0)) return (a.totalTime ?? 0) - (b.totalTime ?? 0);
    // 念のため：正解した回答時間の合計（短い方が上）
    return (a.timeSum ?? 0) - (b.timeSum ?? 0);
  });
  return arr;
}

function renderScoreboard(state){
  const ranked = rankPlayers(state.players);
  const rows = ranked.map((p, idx)=>`
    <tr>
      <td>${idx+1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.score}</td>
      <td>${p.correct}</td>
    </tr>
  `).join("");
  return `
    <table class="table">
      <thead><tr><th>順位</th><th>プレイヤー</th><th>スコア</th><th>正解</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function nextQuestion(state){
  state.qIndex++;
  if (state.qIndex >= state.qset.length){
    finishMatch(state);
    return;
  }
  renderMatch(state);
}

function finishMatch(state){
  removeKeyHandler(state);

  const ranked = rankPlayers(state.players);
  const myRank = ranked.findIndex(p=>p.type==="human") + 1;

  if (state.modeKey === "rated"){
    const profile = getProfile();
    const base = (myRank===1?30:(myRank===2?15:(myRank===3?5:0)));

    const avg = Math.round(ranked.reduce((s,p)=>s+(p.mmr??1000),0) / ranked.length);
    const me = profile.mmr ?? 1000;
    const underdog = Math.max(0, avg - me);
    const bonus = Math.min(10, Math.floor(underdog/150)*2);

    let add = base;
    if (myRank===1) add = base + bonus;
    if (myRank===2) add = base + Math.floor(bonus/2);

    profile.rp = (profile.rp ?? 0) + add;

    const expected = 2.5 - clamp((me-avg)/400, -1.0, 1.0);
    const delta = Math.round((expected - myRank) * 24);
    profile.mmr = Math.max(200, Math.round((profile.mmr ?? 1000) + delta));

    profile.matches = (profile.matches ?? 0) + 1;
    profile.bestRank = profile.bestRank ? Math.min(profile.bestRank, myRank) : myRank;
    saveProfile(profile);

    state._rpAdded = add;
    state._mmrDelta = delta;
    state._avgMmr = avg;
  }

  const el = $("#app");
  const you = state.players[0];
  const resultBadge = myRank===1 ? "good" : (myRank===4 ? "bad" : "");
  const extra = state.modeKey==="rated" ? `
    <div class="hr"></div>
    <div class="notice ${resultBadge}">
      <b>レート結果</b><br>
      RP +${state._rpAdded}（減りません）<br>
      内部MMR ${state._mmrDelta>=0?"+":""}${state._mmrDelta}（ロビー平均 ${state._avgMmr}）
    </div>
  ` : "";

  const rows = rankPlayers(state.players).map((p, idx)=>`
    <tr><td>${idx+1}</td><td>${escapeHtml(p.name)}</td><td>${p.score}</td><td>${p.correct}</td></tr>
  `).join("");

  el.innerHTML = `
    <div class="card">
      <div class="h2">結果</div>
      <div class="notice ${resultBadge}">
        <b>あなたの順位：</b>${myRank}位　／　スコア ${you.score}　／　正解 ${you.correct}　／　総回答時間 ${Math.round((you.totalTime ?? 0))}秒
      </div>
      ${extra}
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>順位</th><th>プレイヤー</th><th>スコア</th><th>正解</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="btnRow" style="margin-top:12px">
        <button class="btn primary" id="againBtn">もう一回</button>
        <button class="btn ghost" id="backBtn">戻る</button>
      </div>
    </div>
  `;

  $("#backBtn").onclick = renderPlayHome;
  $("#againBtn").onclick = ()=>{
    if (state.modeKey==="practice") startMatch("practice");
    else startQueue(state.modeKey);
  };
}

window.RQA = { renderPlayHome, startQueue, startMatch };

document.addEventListener("DOMContentLoaded", ()=>{
  renderPlayHome();
});