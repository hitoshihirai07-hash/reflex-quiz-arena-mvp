
(function(){
  const $ = (q)=>document.querySelector(q);
  const esc = (s)=>String(s??"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]||m));
  const LS_DRAFT = "rqa_admin_questions_draft_v1";

  /** @type {any[]} */
  let questions = [];
  let filteredIdxs = [];
  let selected = -1;
  let lastValidation = [];

  function deepClone(v){ return JSON.parse(JSON.stringify(v)); }

  function normalize(q){
    const nq = {
      id: String(q?.id ?? "").trim(),
      genre: String(q?.genre ?? "calc").trim(),
      format: String(q?.format ?? "mcq").trim(),
      difficulty: Number.isFinite(+q?.difficulty) ? +q.difficulty : 1,
      prompt: String(q?.prompt ?? "").trim(),
    };
    if(q?.enabled === false) nq.enabled = false; // only store when false
    if(nq.format === "mcq"){
      nq.choices = Array.isArray(q?.choices) ? q.choices.map(x=>String(x)) : ["A","B","C","D"];
      nq.answer_index = Number.isFinite(+q?.answer_index) ? +q.answer_index : 0;
    }else{
      // numeric
      nq.answer_value = (q?.answer_value ?? q?.answer ?? 0);
      if(typeof nq.answer_value === "string" && nq.answer_value.trim() !== "" && !Number.isNaN(+nq.answer_value)){
        nq.answer_value = +nq.answer_value;
      }
    }
    return nq;
  }

  function setQuestions(list){
    questions = (list||[]).map(normalize);
    selected = -1;
    saveDraft();
    render();
  }

  function saveDraft(){
    try{
      localStorage.setItem(LS_DRAFT, JSON.stringify({ ts: Date.now(), questions }));
    }catch(e){}
  }

  function loadDraft(){
    try{
      const raw = localStorage.getItem(LS_DRAFT);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || !Array.isArray(obj.questions)) return null;
      return obj.questions;
    }catch(e){ return null; }
  }

  async function loadFromServer(){
    const r = await fetch("/data/questions.json", { cache:"no-store" });
    if(!r.ok) throw new Error("questions.json fetch failed");
    const list = await r.json();
    setQuestions(list);
  }

  function download(filename, text){
    const blob = new Blob([text], { type:"application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function exportJSON(){
    const out = JSON.stringify(questions.map(q=>{
      const qq = deepClone(q);
      // enabled: omit when true/undefined
      if(qq.enabled !== false) delete qq.enabled;
      return qq;
    }), null, 2);
    download("questions.json", out + "\n");
  }

  function exportJS(){
    const min = JSON.stringify(questions.map(q=>{
      const qq = deepClone(q);
      if(qq.enabled !== false) delete qq.enabled;
      return qq;
    }));
    const out = "window.RQA_QUESTIONS = " + min + ";\n";
    download("questions.js", out);
  }

  function selectByFilteredIndex(i){
    selected = filteredIdxs[i] ?? -1;
    renderEditor();
    highlightSelectedRow();
  }

  function highlightSelectedRow(){
    const rows = document.querySelectorAll("[data-row-idx]");
    rows.forEach(r=>{
      const idx = +r.getAttribute("data-row-idx");
      const real = filteredIdxs[idx];
      r.classList.toggle("selected", real === selected);
    });
  }

  function addQuestion(){
    const baseId = `new_${Date.now()}`;
    const q = normalize({
      id: baseId,
      genre: "calc",
      format: "mcq",
      difficulty: 1,
      prompt: "",
      choices: ["", "", "", ""],
      answer_index: 0
    });
    questions.unshift(q);
    selected = 0;
    saveDraft();
    render();
  }

  function dupQuestion(){
    if(selected < 0) return;
    const src = deepClone(questions[selected]);
    src.id = (src.id || "copy") + "_copy";
    questions.splice(selected+1, 0, normalize(src));
    selected = selected+1;
    saveDraft();
    render();
  }

  function delQuestion(){
    if(selected < 0) return;
    const id = questions[selected]?.id;
    if(!confirm(`削除しますか？\n${id}`)) return;
    questions.splice(selected,1);
    selected = -1;
    saveDraft();
    render();
  }

  function updateSelected(patch){
    if(selected < 0) return;
    questions[selected] = normalize({ ...questions[selected], ...patch });
    saveDraft();
    renderList();
    renderEditor();
    highlightSelectedRow();
  }

  function render(){
    const root = $("#adminQuestions");
    if(!root) return;

    root.innerHTML = `
      <section class="hero">
        <div class="h1">問題管理</div>
        <div class="p muted">問題の編集 → 自動チェック → JSON/JSを書き出し（ダウンロード）</div>
        <div class="small muted" style="margin-top:10px">
          読み込み：<span class="kbd">/data/questions.json</span> またはローカルJSON / 下書きは端末に保存
        </div>
      </section>

      <div class="qToolbar">
        <button class="btn primary" id="btnLoadServer">サーバーから読み込み</button>
        <label class="btn" for="fileImport">JSONを読み込み</label>
        <input id="fileImport" type="file" accept="application/json" style="display:none">
        <button class="btn" id="btnExportJson">JSONを書き出し</button>
        <button class="btn" id="btnExportJs">JSを書き出し</button>
        <button class="btn" id="btnValidate">チェック</button>
        <span class="spacer"></span>
        <button class="btn" id="btnClearDraft">下書き削除</button>
      </div>

      <div class="qWrap">
        <section class="card qList">
          <div class="row" style="align-items:flex-end; gap:10px">
            <div style="flex:1">
              <div class="small muted">検索</div>
              <input id="qSearch" type="text" placeholder="id / 問題文で検索">
            </div>
            <div>
              <button class="btn primary" id="btnAdd">＋追加</button>
            </div>
          </div>

          <div style="margin-top:10px" class="small muted">
            件数：<span id="qCount">0</span>
            <span style="margin-left:10px">表示：<span id="qFiltered">0</span></span>
          </div>

          <div style="margin-top:8px; overflow:auto; max-height:60vh">
            <table class="qTable">
              <thead>
                <tr>
                  <th style="width:180px">id</th>
                  <th style="width:110px">ジャンル</th>
                  <th style="width:90px">形式</th>
                  <th style="width:80px">難度</th>
                  <th>問題</th>
                </tr>
              </thead>
              <tbody id="qTbody"></tbody>
            </table>
          </div>

          <section class="card valBox" style="margin-top:10px">
            <div class="row">
              <div class="h2">チェック結果</div>
              <span class="adminTag" id="valSummary">未実行</span>
            </div>
            <div class="small muted" style="margin-top:6px">クリックで該当問題へ移動</div>
            <div id="valList" style="margin-top:8px"></div>
          </section>
        </section>

        <section class="card qEditor">
          <div class="row">
            <div class="h2">編集</div>
            <div style="display:flex; gap:8px; align-items:center">
              <button class="btn" id="btnDup">複製</button>
              <button class="btn" id="btnDel">削除</button>
            </div>
          </div>
          <div id="editorBody" style="margin-top:10px" class="small muted">左の一覧から選択してください。</div>
        </section>
      </div>
    `;

    bindToolbar();
    renderList();
    renderEditor();
  }

  function bindToolbar(){
    $("#btnLoadServer").onclick = async ()=>{
      try{
        await loadFromServer();
      }catch(e){
        alert("読み込みに失敗しました：/data/questions.json が取得できません。\n" + (e?.message||e));
      }
    };

    $("#fileImport").addEventListener("change", async (ev)=>{
      const file = ev.target.files?.[0];
      if(!file) return;
      try{
        const text = await file.text();
        const obj = JSON.parse(text);
        if(!Array.isArray(obj)) throw new Error("配列ではありません");
        setQuestions(obj);
      }catch(e){
        alert("JSON読み込みに失敗：" + (e?.message||e));
      }finally{
        ev.target.value = "";
      }
    });

    $("#btnExportJson").onclick = exportJSON;
    $("#btnExportJs").onclick = exportJS;

    $("#btnValidate").onclick = ()=>{
      lastValidation = validateAll(questions);
      renderValidation();
    };

    $("#btnClearDraft").onclick = ()=>{
      if(!confirm("下書きを削除しますか？")) return;
      localStorage.removeItem(LS_DRAFT);
      alert("下書きを削除しました。必要ならサーバーから読み込み直してください。");
    };

    $("#btnAdd").onclick = addQuestion;
    $("#btnDup").onclick = dupQuestion;
    $("#btnDel").onclick = delQuestion;

    $("#qSearch").addEventListener("input", ()=>renderList());
  }

  function renderList(){
    const tbody = $("#qTbody");
    if(!tbody) return;

    const q = ($("#qSearch")?.value || "").trim().toLowerCase();
    filteredIdxs = [];
    questions.forEach((qq, idx)=>{
      const hay = (qq.id + " " + qq.prompt).toLowerCase();
      if(!q || hay.includes(q)) filteredIdxs.push(idx);
    });

    $("#qCount").textContent = String(questions.length);
    $("#qFiltered").textContent = String(filteredIdxs.length);

    const rows = filteredIdxs.map((idx, i)=>{
      const qq = questions[idx];
      const enabled = (qq.enabled !== false);
      const badge = enabled ? `<span class="qBadge on">有効</span>` : `<span class="qBadge off">無効</span>`;
      return `
        <tr class="qRow" data-row-idx="${i}">
          <td>
            <div>${esc(qq.id)}</div>
            <div class="qMini">${badge}</div>
          </td>
          <td>${esc(qq.genre)}</td>
          <td>${esc(qq.format)}</td>
          <td>${esc(qq.difficulty)}</td>
          <td>${esc(qq.prompt).slice(0, 80)}${qq.prompt.length>80 ? "…" : ""}</td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="5" class="small muted">該当なし</td></tr>`;

    document.querySelectorAll("[data-row-idx]").forEach(el=>{
      el.addEventListener("click", ()=>{
        selectByFilteredIndex(+el.getAttribute("data-row-idx"));
      });
    });

    highlightSelectedRow();
  }

  function renderEditor(){
    const el = $("#editorBody");
    if(!el) return;

    if(selected < 0 || !questions[selected]){
      el.innerHTML = `<div class="small muted">左の一覧から選択してください。</div>`;
      return;
    }

    const q = questions[selected];
    const isMcq = q.format === "mcq";

    const genreOpts = ["calc","memory","logic"].map(g=>`<option value="${g}" ${q.genre===g?"selected":""}>${g}</option>`).join("");
    const fmtOpts = ["mcq","numeric"].map(f=>`<option value="${f}" ${q.format===f?"selected":""}>${f}</option>`).join("");
    const enabledChecked = (q.enabled !== false) ? "checked" : "";

    const choicesHtml = isMcq ? `
      <div style="margin-top:10px">
        <div class="row" style="align-items:center">
          <div class="h2">選択肢</div>
          <button class="btn" id="btnAddChoice">＋追加</button>
        </div>
        <div style="margin-top:8px" id="choiceList">
          ${(q.choices||[]).map((c, i)=>`
            <div class="choiceRow" data-choice="${i}">
              <span class="kbd">${i+1}</span>
              <input type="text" value="${esc(c)}" data-choice-input="${i}">
              <button class="btn" data-choice-del="${i}">削除</button>
            </div>
          `).join("")}
        </div>

        <div style="margin-top:8px">
          <label>正答（answer_index）</label>
          <select id="answerIndex">
            ${(q.choices||[]).map((c,i)=>`<option value="${i}" ${q.answer_index===i?"selected":""}>${i} : ${esc(c).slice(0,30)}</option>`).join("")}
          </select>
          <div class="small muted" style="margin-top:6px">※ choices[answer_index] が正答扱い</div>
        </div>
      </div>
    ` : `
      <div style="margin-top:10px">
        <label>正答（answer_value）</label>
        <input id="answerValue" type="number" step="1" value="${esc(q.answer_value)}">
      </div>
    `;

    el.innerHTML = `
      <div class="qGrid">
        <div>
          <label>id</label>
          <input id="qId" type="text" value="${esc(q.id)}">
        </div>
        <div style="display:flex; gap:10px; align-items:flex-end">
          <div style="flex:1">
            <label>ジャンル</label>
            <select id="qGenre">${genreOpts}</select>
          </div>
          <div style="flex:1">
            <label>形式</label>
            <select id="qFormat">${fmtOpts}</select>
          </div>
        </div>

        <div>
          <label>難易度（difficulty）</label>
          <input id="qDiff" type="number" step="1" min="1" max="5" value="${esc(q.difficulty)}">
        </div>
        <div style="display:flex; gap:10px; align-items:flex-end">
          <div style="flex:1">
            <label>有効</label>
            <label class="row" style="gap:8px">
              <input id="qEnabled" type="checkbox" ${enabledChecked}>
              <span class="small muted">チェックOFFで無効（出題されない想定）</span>
            </label>
          </div>
        </div>

        <div style="grid-column:1/-1">
          <label>問題文（prompt）</label>
          <textarea id="qPrompt">${esc(q.prompt)}</textarea>
        </div>
      </div>

      ${choicesHtml}

      <section class="card" style="margin-top:12px">
        <div class="h2">メモ</div>
        <div class="small muted">変更後は自動で下書き保存されます。書き出したJSON/JSを手元で差し替えて反映してください。</div>
      </section>
    `;

    // bind editor inputs
    $("#qId").addEventListener("input", (e)=>updateSelected({ id:e.target.value }));
    $("#qGenre").addEventListener("change", (e)=>updateSelected({ genre:e.target.value }));
    $("#qFormat").addEventListener("change", (e)=>updateSelected({ format:e.target.value }));
    $("#qDiff").addEventListener("input", (e)=>updateSelected({ difficulty: +e.target.value }));
    $("#qEnabled").addEventListener("change", (e)=>updateSelected({ enabled: e.target.checked ? undefined : false }));

    $("#qPrompt").addEventListener("input", (e)=>updateSelected({ prompt:e.target.value }));

    if(isMcq){
      document.querySelectorAll("[data-choice-input]").forEach(inp=>{
        inp.addEventListener("input", (e)=>{
          const i = +e.target.getAttribute("data-choice-input");
          const list = [...(questions[selected].choices||[])];
          list[i] = e.target.value;
          updateSelected({ choices:list });
        });
      });
      document.querySelectorAll("[data-choice-del]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const i = +btn.getAttribute("data-choice-del");
          const list = [...(questions[selected].choices||[])];
          list.splice(i,1);
          let ai = questions[selected].answer_index || 0;
          if(ai >= list.length) ai = Math.max(0, list.length-1);
          updateSelected({ choices:list, answer_index: ai });
        });
      });
      $("#btnAddChoice").addEventListener("click", ()=>{
        const list = [...(questions[selected].choices||[])];
        list.push("");
        updateSelected({ choices:list });
      });
      $("#answerIndex").addEventListener("change", (e)=>updateSelected({ answer_index:+e.target.value }));
    }else{
      $("#answerValue").addEventListener("input", (e)=>updateSelected({ answer_value: +e.target.value }));
    }
  }

  function validateAll(list){
    /** @type {{level:"error"|"warn", idx:number, id:string, msg:string}[]} */
    const out = [];
    const ids = new Map();
    const prompts = new Map();

    list.forEach((q, idx)=>{
      const id = String(q.id||"").trim();
      if(!id) out.push({ level:"error", idx, id:"(no id)", msg:"id が空です" });
      else{
        if(ids.has(id)) out.push({ level:"error", idx, id, msg:`id が重複しています（先: #${ids.get(id)+1}）`});
        else ids.set(id, idx);
      }

      if(!q.prompt) out.push({ level:"error", idx, id, msg:"prompt が空です" });

      // soft duplicate prompt
      const key = (q.prompt||"").trim();
      if(key){
        if(prompts.has(key)) out.push({ level:"warn", idx, id, msg:`同じ問題文が存在します（先: ${list[prompts.get(key)]?.id||"?"}）`});
        else prompts.set(key, idx);
      }

      if(!["calc","memory","logic"].includes(q.genre)) out.push({ level:"warn", idx, id, msg:`genre が想定外です（${q.genre}）`});
      if(!["mcq","numeric"].includes(q.format)) out.push({ level:"error", idx, id, msg:`format が不正です（${q.format}）`});
      if(!(Number.isFinite(+q.difficulty) && +q.difficulty>=1 && +q.difficulty<=5)) out.push({ level:"warn", idx, id, msg:"difficulty は 1〜5 を推奨" });

      if(q.format === "mcq"){
        if(!Array.isArray(q.choices) || q.choices.length < 2) out.push({ level:"error", idx, id, msg:"choices が2つ以上必要です" });
        const ai = +q.answer_index;
        if(!Number.isFinite(ai)) out.push({ level:"error", idx, id, msg:"answer_index が数値ではありません" });
        else if(!(ai>=0 && ai < (q.choices?.length||0))) out.push({ level:"error", idx, id, msg:"answer_index が choices の範囲外です" });
        // dup choices warn
        if(Array.isArray(q.choices)){
          const set = new Set();
          q.choices.forEach(c=>{
            const k=String(c);
            if(set.has(k)) out.push({ level:"warn", idx, id, msg:"choices に重複があります" });
            set.add(k);
          });
        }
      }else{
        const av = q.answer_value;
        if(av === undefined || av === null || av === "") out.push({ level:"error", idx, id, msg:"answer_value が空です" });
        else if(typeof av !== "number" && Number.isNaN(+av)) out.push({ level:"error", idx, id, msg:"answer_value が数値として解釈できません" });
      }

      // Smart checks
      smartCheck(q, idx, out);
    });

    return out;
  }

  function smartCheck(q, idx, out){
    const id = String(q.id||"");
    const p = String(q.prompt||"");

    // Remainder: "14を5で割った余りは？"
    let m = p.match(/(\d+)\s*を\s*(\d+)\s*で割った余り/);
    if(m){
      const a = parseInt(m[1],10);
      const b = parseInt(m[2],10);
      if(b === 0){
        out.push({ level:"error", idx, id, msg:"余り問題：0で割っています" });
        return;
      }
      const rem = a % b;
      const remStr = String(rem);
      if(q.format === "mcq"){
        const choices = (q.choices||[]).map(String);
        if(!choices.includes(remStr)){
          out.push({ level:"error", idx, id, msg:`余り問題：choices に正答(${remStr})がありません` });
        }else{
          const ai = +q.answer_index;
          const chosen = choices[ai];
          if(chosen !== remStr){
            out.push({ level:"error", idx, id, msg:`余り問題：正答は ${remStr} ですが answer_index が ${ai} になっています` });
          }
        }
      }else{
        const av = +q.answer_value;
        if(av !== rem){
          out.push({ level:"error", idx, id, msg:`余り問題：正答は ${rem} ですが answer_value が ${q.answer_value} です` });
        }
      }
    }

    // Simple arithmetic in prompt: "27 × 3 = ?"
    // support: + - × ÷ with spaces and fullwidth
    m = p.match(/^\s*(\d+)\s*([＋\+\-−×\*xX÷\/])\s*(\d+)\s*=\s*\?\s*$/);
    if(m){
      const a = parseInt(m[1],10);
      const op = m[2];
      const b = parseInt(m[3],10);
      let ans = null;
      if(op === "+" || op === "＋") ans = a + b;
      else if(op === "-" || op === "−") ans = a - b;
      else if(op === "×" || op === "*" || op.toLowerCase()==="x") ans = a * b;
      else if(op === "÷" || op === "/"){
        if(b === 0) ans = null;
        else if(a % b === 0) ans = a / b;
        else ans = a / b; // allow non-int (warn)
      }
      if(ans !== null){
        if(q.format === "numeric"){
          const av = +q.answer_value;
          if(Number.isFinite(av)){
            // if division non-int, allow small tolerance
            const ok = (Math.abs(av - ans) < 1e-9);
            if(!ok) out.push({ level:"error", idx, id, msg:`計算問題：正答は ${ans} ですが answer_value が ${q.answer_value} です` });
          }
        }else if(q.format === "mcq"){
          const choices = (q.choices||[]).map(String);
          const ansStr = String(ans);
          if(!choices.includes(ansStr)){
            out.push({ level:"warn", idx, id, msg:`計算問題：choices に正答(${ansStr})が無い可能性` });
          }else{
            const ai = +q.answer_index;
            const chosen = choices[ai];
            if(chosen !== ansStr){
              out.push({ level:"error", idx, id, msg:`計算問題：正答は ${ansStr} ですが answer_index がズレています` });
            }
          }
        }
      }
    }
  }

  function renderValidation(){
    const list = $("#valList");
    const sum = $("#valSummary");
    if(!list || !sum) return;

    const errs = lastValidation.filter(v=>v.level==="error").length;
    const warns = lastValidation.filter(v=>v.level==="warn").length;

    if(!lastValidation.length){
      sum.textContent = "OK（問題なし）";
      list.innerHTML = `<div class="small muted">問題は見つかりませんでした。</div>`;
      return;
    }
    sum.textContent = `error ${errs} / warn ${warns}`;

    list.innerHTML = lastValidation.slice(0, 200).map(v=>`
      <div class="valItem ${v.level==="error"?"err":"warn"}" data-val-idx="${v.idx}">
        <div><b>${esc(v.id)}</b>：${esc(v.msg)}</div>
        <div class="valMeta">${v.level.toUpperCase()} / #${v.idx+1}</div>
      </div>
    `).join("") + (lastValidation.length>200 ? `<div class="small muted">※表示は先頭200件まで</div>` : "");

    document.querySelectorAll("[data-val-idx]").forEach(el=>{
      el.addEventListener("click", ()=>{
        const idx = +el.getAttribute("data-val-idx");
        selected = idx;
        renderList();
        renderEditor();
        highlightSelectedRow();
        // scroll editor into view on mobile
        $("#editorBody")?.scrollIntoView({ behavior:"smooth", block:"start" });
      });
    });
  }

  async function boot(){
    render();

    const draft = loadDraft();
    if(draft){
      setQuestions(draft);
    }else{
      try{
        await loadFromServer();
      }catch(e){
        // keep empty
        setQuestions([]);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
