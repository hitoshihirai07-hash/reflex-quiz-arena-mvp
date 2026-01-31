(function(){
  const LS_SEEN = "rqa_quiz_howto_seen_v1";
  const LS_HIDE = "rqa_quiz_howto_hide_v1";
  const $ = (q, el=document)=>el.querySelector(q);

  function show(){
    const layer = $("#howtoQuiz");
    if(!layer) return;
    if(localStorage.getItem(LS_HIDE)==="1") return;
    if(localStorage.getItem(LS_SEEN)==="1") return;

    layer.style.display = "flex";

    const close = $("#btnHowtoQuizClose", layer);
    const never = $("#btnHowtoQuizNever", layer);

    const hideAsSeen = ()=>{
      try{ localStorage.setItem(LS_SEEN, "1"); }catch(e){}
      layer.style.display = "none";
    };

    if(close) close.onclick = hideAsSeen;

    if(never) never.onclick = ()=>{
      try{ localStorage.setItem(LS_HIDE, "1"); }catch(e){}
      layer.style.display = "none";
    };

    // 背景クリックで閉じる（＝既読）
    layer.addEventListener("click", (e)=>{
      if(e.target === layer) hideAsSeen();
    });

    // ESCで閉じる（＝既読）
    window.addEventListener("keydown", (e)=>{
      if(e.key==="Escape" && layer.style.display!=="none"){
        hideAsSeen();
      }
    }, { once:false });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", show);
  }else{
    show();
  }
})();
