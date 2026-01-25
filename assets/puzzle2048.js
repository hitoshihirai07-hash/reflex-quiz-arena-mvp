(function(){
  const $ = (q, el=document)=>el.querySelector(q);

  const LS_BEST = "rqa_2048_best_v1";
  const LS_HOWTO = "rqa_2048_howto_hide_v1";

  function loadBest(){
    try{ return JSON.parse(localStorage.getItem(LS_BEST) || "{}"); }catch(e){ return {}; }
  }
  function saveBest(obj){
    localStorage.setItem(LS_BEST, JSON.stringify(obj));
  }

  function clone(a){ return a.slice(); }
  function zeros(n){ return Array(n).fill(0); }

  // State
  let state = {
    size: 4,
    board: zeros(16),
    score: 0,
    max: 0,
    over: false,
    won: false,
    // undo
    prevBoard: null,
    prevScore: 0,
    prevMax: 0,
    canUndo: false,
  };

  function idx(r,c){ return r*state.size + c; }

  function setStatus(t){
    const el = $("#status2048");
    if(el) el.textContent = t || " ";
  }

  function renderBest(){
    const best = loadBest();
    $("#bestScore").textContent = String(best.bestScore || 0);
    $("#bestMax").textContent = String(best.bestMax || 0);
  }

  function updateBest(){
    const best = loadBest();
    const bestScore = best.bestScore || 0;
    const bestMax = best.bestMax || 0;

    let changed = false;
    if(state.score > bestScore){ best.bestScore = state.score; changed = true; }
    if(state.max > bestMax){ best.bestMax = state.max; changed = true; }

    if(changed) saveBest(best);
    renderBest();
  }

  function addRandom(){
    const empties = [];
    for(let i=0;i<16;i++) if(state.board[i]===0) empties.push(i);
    if(!empties.length) return false;
    const pick = empties[(Math.random()*empties.length)|0];
    const v = Math.random() < 0.9 ? 2 : 4;
    state.board[pick] = v;
    state.max = Math.max(state.max, v);
    return true;
  }

  function startNew(){
    state.board = zeros(16);
    state.score = 0;
    state.max = 0;
    state.over = false;
    state.won = false;
    state.prevBoard = null;
    state.canUndo = false;

    $("#overLayer").style.display = "none";
    $("#btnKeepGoing").style.display = "none";

    addRandom();
    addRandom();
    renderAll();
    setStatus("スワイプ / 矢印キーで動かしてください。");
  }

  function compressLine(line){
    return line.filter(v=>v!==0);
  }
  function mergeLine(line){
    let scoreAdd = 0;
    const out = [];
    for(let i=0;i<line.length;i++){
      if(i<line.length-1 && line[i]===line[i+1]){
        const v = line[i]*2;
        out.push(v);
        scoreAdd += v;
        i++;
      }else{
        out.push(line[i]);
      }
    }
    while(out.length < state.size) out.push(0);
    return { out, scoreAdd };
  }

  function getLine(dir, n){
    const s = state.size;
    const b = state.board;
    const line = [];
    if(dir==="left"){
      for(let c=0;c<s;c++) line.push(b[idx(n,c)]);
    }else if(dir==="right"){
      for(let c=s-1;c>=0;c--) line.push(b[idx(n,c)]);
    }else if(dir==="up"){
      for(let r=0;r<s;r++) line.push(b[idx(r,n)]);
    }else if(dir==="down"){
      for(let r=s-1;r>=0;r--) line.push(b[idx(r,n)]);
    }
    return line;
  }
  function setLine(dir, n, line){
    const s = state.size;
    const b = state.board;
    if(dir==="left"){
      for(let c=0;c<s;c++) b[idx(n,c)] = line[c];
    }else if(dir==="right"){
      for(let c=s-1, i=0;c>=0;c--,i++) b[idx(n,c)] = line[i];
    }else if(dir==="up"){
      for(let r=0;r<s;r++) b[idx(r,n)] = line[r];
    }else if(dir==="down"){
      for(let r=s-1, i=0;r>=0;r--,i++) b[idx(r,n)] = line[i];
    }
  }

  function canMove(){
    const b = state.board;
    for(let i=0;i<16;i++) if(b[i]===0) return true;
    const s = state.size;
    for(let r=0;r<s;r++){
      for(let c=0;c<s;c++){
        const v = b[idx(r,c)];
        if(r<s-1 && v===b[idx(r+1,c)]) return true;
        if(c<s-1 && v===b[idx(r,c+1)]) return true;
      }
    }
    return false;
  }

  function tileAlpha(v){
    if(v<=0) return 0;
    const lg = Math.log2(v);
    return Math.min(0.56, 0.10 + lg*0.06);
  }
  function tileFontScale(v){
    if(v<100) return "1.0";
    if(v<1000) return "0.9";
    return "0.78";
  }

  function renderBoard(){
    const boardEl = $("#board2048");
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${state.size}, 1fr)`;

    for(let i=0;i<16;i++){
      const v = state.board[i];
      const cell = document.createElement("div");
      cell.className = "cell2048";
      const tile = document.createElement("div");
      tile.className = "tile2048";
      tile.setAttribute("data-v", String(v));
      if(v===0){
        tile.classList.add("empty");
      }else{
        tile.textContent = String(v);
        const a = tileAlpha(v);
        tile.style.background = `rgba(255,255,255,${a})`;
        tile.style.transform = `scale(${tileFontScale(v)})`;
      }
      cell.appendChild(tile);
      boardEl.appendChild(cell);
    }
  }

  function renderAll(){
    $("#scoreVal").textContent = String(state.score);
    $("#maxVal").textContent = String(state.max);
    $("#btnUndo").disabled = !state.canUndo;
    renderBoard();
    renderBest();
  }

  function move(dir){
    if(state.over) return;

    const before = clone(state.board);
    const beforeScore = state.score;
    const beforeMax = state.max;

    let moved = false;
    let scoreAddTotal = 0;

    for(let n=0;n<state.size;n++){
      const line = getLine(dir, n);
      const compressed = compressLine(line);
      const merged = mergeLine(compressed);
      scoreAddTotal += merged.scoreAdd;

      for(let i=0;i<state.size;i++){
        if(merged.out[i] !== line[i]) { moved = true; break; }
      }

      setLine(dir, n, merged.out);
    }

    if(!moved){
      setStatus("その方向には動けません。");
      return;
    }

    state.prevBoard = before;
    state.prevScore = beforeScore;
    state.prevMax = beforeMax;
    state.canUndo = true;

    state.score += scoreAddTotal;

    let mx = 0;
    for(const v of state.board) if(v>mx) mx=v;
    state.max = mx;

    addRandom();

    if(state.max >= 2048 && !state.won){
      state.won = true;
      setStatus("2048達成！続けてもOKです。");
      $("#btnKeepGoing").style.display = "";
    }else{
      const cur = ($("#status2048") && $("#status2048").textContent) ? $("#status2048").textContent : "";
      if(cur.includes("動けません")) setStatus(" ");
    }

    if(!canMove()){
      state.over = true;
      setStatus("ゲームオーバー。");
      $("#overLayer").style.display = "";
    }

    updateBest();
    renderAll();
  }

  function undo(){
    if(!state.canUndo || !state.prevBoard) return;
    state.board = clone(state.prevBoard);
    state.score = state.prevScore;
    state.max = state.prevMax;
    state.over = false;
    state.canUndo = false;
    $("#overLayer").style.display = "none";
    renderAll();
    setStatus("1手戻しました。");
  }

  // Swipe
  function bindSwipe(){
    const el = $("#swipeArea");
    let sx=0, sy=0, active=false;

    el.addEventListener("touchstart", (e)=>{
      if(!e.touches || e.touches.length!==1) return;
      const t = e.touches[0];
      sx=t.clientX; sy=t.clientY; active=true;
    }, { passive:true });

    el.addEventListener("touchmove", (e)=>{
      if(active) e.preventDefault();
    }, { passive:false });

    el.addEventListener("touchend", (e)=>{
      if(!active) return;
      active=false;
      const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
      if(!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if(Math.max(ax,ay) < 28) return;

      if(ax > ay) move(dx>0 ? "right" : "left");
      else move(dy>0 ? "down" : "up");
    }, { passive:true });
  }

  function bindKeys(){
    window.addEventListener("keydown", (e)=>{
      const k = e.key;
      if(k==="ArrowLeft"){ e.preventDefault(); move("left"); }
      else if(k==="ArrowRight"){ e.preventDefault(); move("right"); }
      else if(k==="ArrowUp"){ e.preventDefault(); move("up"); }
      else if(k==="ArrowDown"){ e.preventDefault(); move("down"); }
    }, { passive:false });
  }

  function bindUI(){
    $("#btnNew").onclick = ()=>startNew();
    $("#btnUndo").onclick = ()=>undo();

    $("#btnOverNew").onclick = ()=>startNew();
    $("#btnOverClose").onclick = ()=>{ $("#overLayer").style.display = "none"; };

    $("#btnKeepGoing").onclick = ()=>{
      $("#btnKeepGoing").style.display = "none";
      setStatus("続行中。");
    };

    // how-to modal
    const howto = $("#howto2048");
    const close = $("#btnHowtoClose");
    const never = $("#btnHowtoNever");
    if(close) close.onclick = ()=>{ if(howto) howto.style.display = "none"; };
    if(never) never.onclick = ()=>{ localStorage.setItem(LS_HOWTO, "1"); if(howto) howto.style.display = "none"; };

    $("#btnResetBest2048").onclick = ()=>{
      localStorage.removeItem(LS_BEST);
      renderBest();
      setStatus("自己ベストをリセットしました。");
    };
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const hide = localStorage.getItem(LS_HOWTO);
      const howto = $("#howto2048");
      if(!hide && howto) howto.style.display = "";
    }catch(e){}

    bindUI();
    bindSwipe();
    bindKeys();
    renderBest();
    startNew();
  });
})();
