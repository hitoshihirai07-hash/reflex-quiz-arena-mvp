(function(){
  const $ = (q)=>document.querySelector(q);
  const setText = (id, t)=>{ const el=$(id); if(el) el.textContent=t; };

  function planFromPreset(p){
    if(p==="calc") return { calc:5, memory:3, logic:2 };
    if(p==="memory") return { calc:3, memory:5, logic:2 };
    if(p==="logic") return { calc:3, memory:2, logic:5 };
    // even/standard
    return { calc:4, memory:3, logic:3 };
  }

  function calcInputToPrefs(v){
    // returns { mcqRate, allowMcq, allowNumeric }
    if(v==="mcq_more") return { mcqRate:0.75, allowMcq:true, allowNumeric:true };
    if(v==="num_more") return { mcqRate:0.35, allowMcq:true, allowNumeric:true };
    if(v==="mcq_only") return { mcqRate:0.95, allowMcq:true, allowNumeric:false };
    if(v==="num_only") return { mcqRate:0.05, allowMcq:false, allowNumeric:true };
    return { mcqRate:0.6, allowMcq:true, allowNumeric:true }; // mix
  }
  function prefsToCalcInput(s){
    if(s.allowMcq && !s.allowNumeric) return "mcq_only";
    if(!s.allowMcq && s.allowNumeric) return "num_only";
    if(s.mcqRate >= 0.68) return "mcq_more";
    if(s.mcqRate <= 0.42) return "num_more";
    return "mix";
  }

  function renderSummary(s){
    setText("#planCalc", String(s.plan.calc));
    setText("#planMem", String(s.plan.memory));
    setText("#planLog", String(s.plan.logic));
    setText("#diffCapLabel", String(s.diffCap));
    setText("#genRateLabel", Math.round(s.genRate*100) + "%");
  }

  function setStatus(t){
    const el = $("#settingsStatus");
    if(el) el.textContent = t || " ";
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const core = window.RQA_SETTINGS;
    if(!core){ setStatus("設定の読み込みに失敗しました。"); return; }

    let s = core.load();

    // init controls
    $("#planPreset").value = s.planPreset || "standard";
    $("#diffCap").value = String(s.diffCap||4);
    $("#genRate").value = String(s.genRate ?? 0.45);
    $("#calcInput").value = prefsToCalcInput(s);
    $("#largeText").checked = !!s.largeText;
    $("#reduceMotion").checked = !!s.reduceMotion;

    renderSummary(s);

    // live update for sliders
    $("#diffCap").addEventListener("input", ()=>{
      setText("#diffCapLabel", String($("#diffCap").value));
    });
    $("#genRate").addEventListener("input", ()=>{
      setText("#genRateLabel", Math.round(parseFloat($("#genRate").value)*100) + "%");
    });

    // preset change updates summary
    $("#planPreset").addEventListener("change", ()=>{
      const p = $("#planPreset").value;
      const plan = planFromPreset(p);
      setText("#planCalc", String(plan.calc));
      setText("#planMem", String(plan.memory));
      setText("#planLog", String(plan.logic));
    });

    // apply UI toggles immediately
    const applyUIToggles = ()=>{
      const tmp = core.load();
      tmp.largeText = $("#largeText").checked;
      tmp.reduceMotion = $("#reduceMotion").checked;
      core.applyUI(tmp);
    };
    $("#largeText").addEventListener("change", applyUIToggles);
    $("#reduceMotion").addEventListener("change", applyUIToggles);

    $("#btnSave").onclick = ()=>{
      const preset = $("#planPreset").value;
      const plan = planFromPreset(preset);
      const diffCap = parseInt($("#diffCap").value,10);
      const genRate = parseFloat($("#genRate").value);
      const calcInput = $("#calcInput").value;
      const prefs = calcInputToPrefs(calcInput);

      s = {
        ...s,
        planPreset: preset,
        plan,
        diffCap,
        genRate,
        ...prefs,
        largeText: $("#largeText").checked,
        reduceMotion: $("#reduceMotion").checked,
      };

      core.save(s);
      core.applyUI(s);
      renderSummary(s);
      setStatus("保存しました。");
    };

    $("#btnReset").onclick = ()=>{
      const d = core.defaults;
      core.save(d);
      core.applyUI(d);

      $("#planPreset").value = d.planPreset;
      $("#diffCap").value = String(d.diffCap);
      $("#genRate").value = String(d.genRate);
      $("#calcInput").value = "mix";
      $("#largeText").checked = !!d.largeText;
      $("#reduceMotion").checked = !!d.reduceMotion;

      renderSummary(d);
      setStatus("初期化しました。");
    };
  });
})();
