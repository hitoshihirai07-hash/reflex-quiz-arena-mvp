(function(){
  const LS_KEY = "rqa_settings_v1";

  const defaults = {
    planPreset: "standard",
    plan: { calc:4, memory:3, logic:3 },
    diffCap: 4,
    genRate: 0.45,
    // calc input preference
    mcqRate: 0.6,
    allowMcq: true,
    allowNumeric: true,
    // UI
    largeText: false,
    reduceMotion: false,
  };

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function load(){
    let s = {};
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw) s = JSON.parse(raw) || {};
    }catch(e){}
    // merge
    const out = { ...defaults, ...s };
    // deep merge plan
    out.plan = { ...defaults.plan, ...(s.plan || {}) };

    out.diffCap = clamp(parseInt(out.diffCap,10) || 4, 1, 4);
    out.genRate = clamp(parseFloat(out.genRate) || 0.45, 0, 1);
    out.mcqRate = clamp(parseFloat(out.mcqRate) || 0.6, 0.05, 0.95);
    out.allowMcq = (out.allowMcq !== false);
    out.allowNumeric = (out.allowNumeric !== false);
    out.largeText = !!out.largeText;
    out.reduceMotion = !!out.reduceMotion;

    // ensure plan sum 10 for mix
    const sum = (out.plan.calc|0)+(out.plan.memory|0)+(out.plan.logic|0);
    if(sum !== 10){
      out.plan = { ...defaults.plan };
      out.planPreset = "standard";
    }
    return out;
  }

  function save(s){
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

  function applyUI(s){
    const root = document.documentElement;
    root.classList.toggle("largeText", !!s.largeText);
    root.classList.toggle("reduceMotion", !!s.reduceMotion);
  }

  // expose
  window.RQA_SETTINGS = { load, save, applyUI, defaults, key: LS_KEY };

  // auto apply on each page
  try{
    const s = load();
    applyUI(s);
  }catch(e){}
})();
