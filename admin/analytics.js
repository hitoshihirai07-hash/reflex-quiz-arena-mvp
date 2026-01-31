(function(){
  const $ = (q)=>document.querySelector(q);
  const esc = (s)=>String(s??"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]||m));

  function getRange(){
    const u = new URL(location.href);
    return u.searchParams.get("range") || "today";
  }
  function setRange(range){
    const u = new URL(location.href);
    u.searchParams.set("range", range);
    history.replaceState(null, "", u.toString());
  }

  function fmt(n){
    if(n===null || n===undefined) return "-";
    try{ return Number(n).toLocaleString(); }catch(e){ return String(n); }
  }

  function renderShell(range){
    const el = $("#analyticsRoot");
    el.innerHTML = `
      <section class="hero">
        <div class="h1">アクセス（目安）</div>
        <div class="p muted">Cloudflare Web Analytics（RUM）から「Visits / Page Loads」を取得します。</div>
        <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn ${range==="today"?"primary":""}" data-range="today">今日（JST）</button>
          <button class="btn ${range==="24h"?"primary":""}" data-range="24h">直近24時間</button>
          <button class="btn ${range==="7d"?"primary":""}" data-range="7d">直近7日</button>
          <span class="small muted" id="rangeLabel" style="margin-left:auto"></span>
        </div>
      </section>

      <div id="analyticsBody" style="margin-top:12px"></div>
    `;

    el.querySelectorAll("button[data-range]").forEach(btn=>{
      btn.onclick = ()=>{
        const r = btn.getAttribute("data-range");
        setRange(r);
        location.reload();
      };
    });
  }

  function renderMissing(bodyEl, detail){
    const envs = [
      { k:"CF_ANALYTICS_API_TOKEN", v:"Cloudflare APIトークン（Analytics Read）" },
      { k:"CF_ANALYTICS_ACCOUNT_TAG", v:"Account ID（accountTag）" },
      { k:"CF_ANALYTICS_SITE_TAG", v:"Site Tag（Web AnalyticsのID、複数ならカンマ区切り）※推奨" },
      { k:"CF_ANALYTICS_HOST", v:"host（例: reflex-quiz-arena-mvp.pages.dev）※未設定なら自動" },
      { k:"CF_AUTH_EMAIL", v:"（必要なら）Cloudflareログインメール" }
    ];
    const items = envs.map(x=>`<li><span class="kbd">${esc(x.k)}</span>：<span class="small muted">${esc(x.v)}</span></li>`).join("");
    bodyEl.innerHTML = `
      <section class="card">
        <div class="h2">まだ設定がありません</div>
        <div class="small muted" style="margin-top:8px">管理ページ（Functions）側でCloudflareのGraphQL Analytics APIを叩きます。まずは環境変数を設定してください。</div>
        <div class="hr"></div>
        <div class="h3">必要な環境変数（Cloudflare Pages → Settings → Environment variables）</div>
        <ul class="list">${items}</ul>
        <div class="hr"></div>
        <div class="small muted">返却メッセージ：${esc(detail||"-")}</div>
      </section>
    `;
  }

  function renderOk(bodyEl, data){
    const start = data.startIso ? new Date(data.startIso).toLocaleString() : "-";
    const end = data.endIso ? new Date(data.endIso).toLocaleString() : "-";
    const topRows = (data.topPaths||[]).map(p=>{
      return `<tr>
        <td class="small">${esc(p.path || "/")}</td>
        <td>${fmt(p.visits)}</td>
        <td>${fmt(p.pageLoads)}</td>
      </tr>`;
    }).join("");

    // Hourly rows (latest 24 only)
    const series = (data.series||[]).slice().sort((a,b)=>{
      const ta = Date.parse(a.ts||"")||0;
      const tb = Date.parse(b.ts||"")||0;
      return ta - tb;
    });
    const last = series.slice(-24);
    const hourRows = last.map(x=>`<tr>
      <td class="small muted">${esc(new Date(x.ts).toLocaleString())}</td>
      <td>${fmt(x.visits)}</td>
      <td>${fmt(x.pageLoads)}</td>
    </tr>`).join("");

    bodyEl.innerHTML = `
      <div class="adminGrid">
        <section class="card adminCard">
          <div class="h2">Visits（利用の目安）</div>
          <div class="h1" style="font-size:32px;margin-top:6px">${fmt(data.totalVisits)}</div>
          <div class="small muted" style="margin-top:6px">期間：${esc(start)} ～ ${esc(end)}</div>
        </section>
        <section class="card adminCard">
          <div class="h2">Page Loads（ページ閲覧）</div>
          <div class="h1" style="font-size:32px;margin-top:6px">${fmt(data.totalPageLoads)}</div>
          <div class="small muted" style="margin-top:6px">host：<span class="kbd">${esc(data.host || "-")}</span></div>
        </section>
        <section class="card adminCard">
          <div class="h2">更新時刻</div>
          <div class="small muted" style="margin-top:8px">server time：${esc(new Date(data.generatedAt).toLocaleString())}</div>
          <div class="small muted" style="margin-top:6px">siteTag：${esc((data.siteTags||[]).join(", ") || "(未指定)")}</div>
        </section>
      </div>

      <section class="card" style="margin-top:12px">
        <div class="h2">Top Paths（Visits順）</div>
        <div class="small muted" style="margin-top:8px">※パスの集計はサンプリングの影響を受けます。</div>
        <div style="overflow:auto;margin-top:10px">
          <table class="table">
            <thead><tr><th>Path</th><th>Visits</th><th>Page Loads</th></tr></thead>
            <tbody>${topRows || `<tr><td colspan="3" class="small muted">データなし</td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="card" style="margin-top:12px">
        <div class="h2">直近の推移（最大24行）</div>
        <div style="overflow:auto;margin-top:10px">
          <table class="table">
            <thead><tr><th>Time</th><th>Visits</th><th>Page Loads</th></tr></thead>
            <tbody>${hourRows || `<tr><td colspan="3" class="small muted">データなし</td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="card" style="margin-top:12px">
        <div class="h2">メモ</div>
        <ul class="list">
          <li><b>Visits</b> は「外部/直リンクから始まった閲覧」をベースにした指標（≒セッション）です。</li>
          <li><b>Page Loads</b> はページ表示回数（ページビューの目安）。</li>
          <li>正確なユニーク人数を静的サイトだけで出すのは難しいため、このページは “目安” として使う想定です。</li>
        </ul>
      </section>
    `;
  }

  async function main(){
    const range = getRange();
    renderShell(range);

    const body = $("#analyticsBody");
    const label = $("#rangeLabel");
    label.textContent = range==="today" ? "today (JST)" : (range==="24h" ? "last 24h" : "last 7d");

    body.innerHTML = `<section class="card"><div class="small muted">読み込み中...</div></section>`;
    try{
      const r = await fetch(`/admin/analytics-data?range=${encodeURIComponent(range)}`, { cache:"no-store" });
      const j = await r.json();
      if(!j.ok){
        renderMissing(body, j.errorDetail || j.error || "unknown");
        return;
      }
      renderOk(body, j);
    }catch(e){
      renderMissing(body, String(e && e.message ? e.message : e));
    }
  }

  document.addEventListener("DOMContentLoaded", main);
})();