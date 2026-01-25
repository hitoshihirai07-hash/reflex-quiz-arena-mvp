// PWA registration + update prompt (build: 20260125121216)
(function(){
  if (!("serviceWorker" in navigator)) return;

  const BUILD = "20260125121216";
  const BANNER_ID = "rqaUpdateBanner";
  let refreshing = false;

  function showBanner(reg){
    if (document.getElementById(BANNER_ID)) return;

    const bar = document.createElement("div");
    bar.id = BANNER_ID;
    bar.style.position = "fixed";
    bar.style.left = "12px";
    bar.style.right = "12px";
    bar.style.bottom = "12px";
    bar.style.zIndex = "9999";
    bar.style.borderRadius = "14px";
    bar.style.background = "rgba(15,23,42,0.92)";
    bar.style.backdropFilter = "blur(8px)";
    bar.style.border = "1px solid rgba(255,255,255,0.14)";
    bar.style.padding = "12px 12px";
    bar.style.color = "#fff";
    bar.style.display = "flex";
    bar.style.gap = "10px";
    bar.style.alignItems = "center";
    bar.style.justifyContent = "space-between";
    bar.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";

    const msg = document.createElement("div");
    msg.style.lineHeight = "1.2";
    msg.innerHTML = `<div style="font-weight:700">新しいバージョンがあります</div>
      <div style="font-size:12px;opacity:.8;margin-top:2px">更新すると最新の問題/不具合修正が反映されます</div>`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.flexShrink = "0";

    const later = document.createElement("button");
    later.className = "btn";
    later.textContent = "あとで";
    later.onclick = () => bar.remove();

    const update = document.createElement("button");
    update.className = "btn primary";
    update.textContent = "更新する";
    update.onclick = () => {
      try {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING", build: BUILD });
        }
      } catch(e) {
        location.reload();
      }
    };

    actions.appendChild(later);
    actions.appendChild(update);
    bar.appendChild(msg);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // If there's already a waiting worker (first load after deploy)
      if (reg.waiting && navigator.serviceWorker.controller) {
        showBanner(reg);
      }

      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed") {
            if (navigator.serviceWorker.controller) {
              // update available
              showBanner(reg);
            }
          }
        });
      });

      // periodic update check (lightweight)
      setInterval(() => {
        try { reg.update(); } catch(e) {}
      }, 60 * 60 * 1000); // 1 hour
    } catch(e) {
      // ignore
    }
  });
})();
