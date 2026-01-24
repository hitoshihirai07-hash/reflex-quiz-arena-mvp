(function(){
  const $ = (q, el=document)=>el.querySelector(q);
  const $$ = (q, el=document)=>[...el.querySelectorAll(q)];

  const LS_BEST = "rqa_p15_best_v1";
  const LS_STORY = "rqa_p15_story_v1";

  function nowMs(){ return performance && performance.now ? performance.now() : Date.now(); }
  function pad2(n){ return (n<10?"0":"")+n; }
  function fmt(ms){
    ms = Math.max(0, ms|0);
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const ss = s%60;
    return `${m}:${pad2(ss)}`;
  }

  function loadBest(){
    try{ return JSON.parse(localStorage.getItem(LS_BEST) || "{}"); }catch(e){ return {}; }
  }
  function saveBest(obj){
    localStorage.setItem(LS_BEST, JSON.stringify(obj));
  }
  function key(size){ return String(size); }

  function loadStory(){
    try{ return JSON.parse(localStorage.getItem(LS_STORY) || "{}"); }catch(e){ return {}; }
  }
  function saveStory(obj){
    localStorage.setItem(LS_STORY, JSON.stringify(obj));
  }

  // Generate solvable board by doing random moves from solved state
  function makeSolved(size){
    const arr = [];
    for(let i=1;i<=size*size-1;i++) arr.push(i);
    arr.push(0);
    return arr;
  }
  function neighbors(idx, size){
    const r = Math.floor(idx/size);
    const c = idx % size;
    const n = [];
    if (r>0) n.push(idx-size);
    if (r<size-1) n.push(idx+size);
    if (c>0) n.push(idx-1);
    if (c<size-1) n.push(idx+1);
    return n;
  }
  function shuffleFromSolved(size, steps=250){
    let b = makeSolved(size);
    let blank = b.indexOf(0);
    let prev = -1;
    for(let i=0;i<steps;i++){
      const ns = neighbors(blank, size).filter(x=>x!==prev);
      const pick = ns[(Math.random()*ns.length)|0];
      // swap pick with blank
      b[blank] = b[pick];
      b[pick] = 0;
      prev = blank;
      blank = pick;
    }
    // avoid accidental solved
    if (isSolved(b, size)){
      return shuffleFromSolved(size, steps+30);
    }
    return b;
  }
  function isSolved(b, size){
    for(let i=0;i<size*size-1;i++){
      if (b[i] !== i+1) return false;
    }
    return b[size*size-1] === 0;
  }

  // UI State
  let state = {
    mode: "practice", // practice | story
    size: 4,
    board: [],
    moves: 0,
    startedAt: 0,
    elapsed: 0,
    ticking: false,
    timerId: null,
    locked: false,
    currentStage: 1,
  };

  function setMode(mode){
    state.mode = mode;
    $("#modePractice").classList.toggle("primary", mode==="practice");
    $("#modeStory").classList.toggle("primary", mode==="story");
    $("#modePractice").classList.toggle("ghost", mode!=="practice");
    $("#modeStory").classList.toggle("ghost", mode!=="story");

    $("#practicePanel").style.display = mode==="practice" ? "" : "none";
    $("#storyPanel").style.display = mode==="story" ? "" : "none";
    renderStory();
  }

  function stageDefs(){
    // simple linear stages
    return [
      { id: 1, size: 3, title: "Stage 1 (3×3)", desc: "まずは小さめで慣れる" },
      { id: 2, size: 4, title: "Stage 2 (4×4)", desc: "本番サイズに挑戦" },
    ];
  }

  function startGame(size){
    state.size = size;
    state.board = shuffleFromSolved(size, size===3?150:280);
    state.moves = 0;
    state.elapsed = 0;
    state.startedAt = 0;
    stopTimer();
    render();
    setStatus("開始するには、タイルを動かしてください。");
  }

  function startTimerIfNeeded(){
    if(state.ticking) return;
    state.ticking = true;
    state.startedAt = nowMs();
    state.timerId = setInterval(()=>{
      if(!state.ticking) return;
      state.elapsed = nowMs() - state.startedAt;
      $("#timeVal").textContent = fmt(state.elapsed);
    }, 250);
  }

  function stopTimer(){
    state.ticking = false;
    if(state.timerId){
      clearInterval(state.timerId);
      state.timerId = null;
    }
    $("#timeVal").textContent = fmt(state.elapsed);
  }

  function tryMove(tileIdx){
    if(state.locked) return;
    const size = state.size;
    const blank = state.board.indexOf(0);
    const ns = neighbors(blank, size);
    if(!ns.includes(tileIdx)) return;

    startTimerIfNeeded();

    // swap
    state.board[blank] = state.board[tileIdx];
    state.board[tileIdx] = 0;
    state.moves += 1;
    $("#moveVal").textContent = String(state.moves);

    renderBoardOnly();

    if(isSolved(state.board, size)){
      stopTimer();
      onClear();
    }
  }

  function onClear(){
    const ms = state.elapsed;
    const moves = state.moves;
    const size = state.size;

    const best = loadBest();
    const k = key(size);
    const cur = best[k] || null;

    let improved = false;
    if(!cur){
      best[k] = { bestTimeMs: ms, bestMoves: moves };
      improved = true;
    }else{
      // update if time better OR moves better (store both best independently, but keep simple)
      let bestTimeMs = cur.bestTimeMs;
      let bestMoves = cur.bestMoves;
      if(ms < bestTimeMs) { bestTimeMs = ms; improved = true; }
      if(moves < bestMoves) { bestMoves = moves; improved = true; }
      best[k] = { bestTimeMs, bestMoves };
    }
    if(improved) saveBest(best);
    renderBest();

    // story progress
    if(state.mode === "story"){
      const story = loadStory();
      const stages = stageDefs();
      const stage = stages.find(s=>s.id===state.currentStage);
      if(stage && stage.size===size){
        story["cleared_"+String(stage.id)] = true;
        saveStory(story);
      }
      renderStory();
    }

    const msg = improved ? "クリア！自己ベスト更新あり。" : "クリア！";
    setStatus(`${msg}（時間 ${fmt(ms)} / 手数 ${moves}）`);
  }

  function render(){
    $("#sizeSel").value = String(state.size);
    $("#moveVal").textContent = String(state.moves);
    $("#timeVal").textContent = fmt(state.elapsed);
    renderBoardOnly();
    renderBest();
    renderStory();
  }

  function renderBoardOnly(){
    const size = state.size;
    const boardEl = $("#board");
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    boardEl.innerHTML = "";
    const max = size*size;
    for(let i=0;i<max;i++){
      const v = state.board[i];
      const btn = document.createElement("button");
      btn.className = "tile";
      btn.type = "button";
      btn.setAttribute("data-idx", String(i));
      if(v===0){
        btn.classList.add("blank");
        btn.setAttribute("aria-label","空白");
        btn.disabled = true;
      }else{
        btn.textContent = String(v);
        btn.setAttribute("aria-label", `タイル ${v}`);
        btn.onclick = ()=>tryMove(i);
      }
      boardEl.appendChild(btn);
    }
  }

  function renderBest(){
    const best = loadBest();
    const p3 = best["3"];
    const p4 = best["4"];

    $("#best3").textContent = p3 ? `時間 ${fmt(p3.bestTimeMs)} / 手数 ${p3.bestMoves}` : "—";
    $("#best4").textContent = p4 ? `時間 ${fmt(p4.bestTimeMs)} / 手数 ${p4.bestMoves}` : "—";
  }

  function renderStory(){
    const panel = $("#storyPanel");
    if(!panel) return;
    const story = loadStory();
    const stages = stageDefs();
    const list = $("#stageList");
    list.innerHTML = "";

    stages.forEach(s=>{
      const cleared = !!story["cleared_"+String(s.id)];
      const row = document.createElement("div");
      row.className = "stageRow";
      row.innerHTML = `
        <div>
          <div class="h3">${s.title} ${cleared ? '<span class="badge">CLEAR</span>' : ''}</div>
          <div class="small muted">${s.desc}</div>
        </div>
        <div>
          <button class="btn ${cleared ? 'ghost' : 'primary'}" data-stage="${s.id}">
            ${cleared ? "再挑戦" : "挑戦"}
          </button>
        </div>
      `;
      list.appendChild(row);
    });

    $$("#stageList button[data-stage]").forEach(btn=>{
      btn.onclick = ()=>{
        const id = parseInt(btn.getAttribute("data-stage"),10);
        const s = stages.find(x=>x.id===id);
        if(!s) return;
        state.currentStage = id;
        startGame(s.size);
        setStatus(`ストーリー開始：${s.title}`);
      };
    });

    $("#resetStory").onclick = ()=>{
      localStorage.removeItem(LS_STORY);
      renderStory();
      setStatus("ストーリー進行をリセットしました。");
    };
  }

  function setStatus(text){
    const el = $("#status");
    if(el) el.textContent = text;
  }

  function bindUI(){
    $("#sizeSel").onchange = (e)=>{
      const size = parseInt(e.target.value,10);
      startGame(size);
      setStatus("盤面を作り直しました。");
    };
    $("#btnShuffle").onclick = ()=>{
      startGame(state.size);
      setStatus("シャッフルしました。");
    };
    $("#btnResetBest").onclick = ()=>{
      localStorage.removeItem(LS_BEST);
      renderBest();
      setStatus("自己ベストをリセットしました。");
    };

    $("#modePractice").onclick = ()=>setMode("practice");
    $("#modeStory").onclick = ()=>setMode("story");

    // Keyboard support (optional)
    window.addEventListener("keydown", (e)=>{
      const k = e.key;
      const size = state.size;
      const blank = state.board.indexOf(0);
      let target = -1;
      if(k==="ArrowUp"){ // move tile down into blank -> blank goes up
        target = blank + size;
      }else if(k==="ArrowDown"){
        target = blank - size;
      }else if(k==="ArrowLeft"){
        target = blank + 1;
      }else if(k==="ArrowRight"){
        target = blank - 1;
      }else{
        return;
      }
      e.preventDefault();
      if(target<0 || target>=size*size) return;
      // check adjacency
      const ns = neighbors(blank, size);
      if(ns.includes(target)) tryMove(target);
    }, { passive:false });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    bindUI();
    // default
    setMode("practice");
    startGame(4);
    renderBest();
  });
})();
