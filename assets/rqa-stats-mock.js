(() => {
  const readStats = () => {
    try {
      const raw = localStorage.getItem("rqa_stats_v1");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  };

  // Only show mock when there is no stored stats yet
  const stats = readStats();
  if (stats.length > 0) return;

  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Avoid double-insert
    if (el.querySelector("[data-rqa-mock]")) return;
    el.innerHTML = html;
  };

  setHTML(
    "summaryCard",
    `
      <div data-rqa-mock>
        <div class="h2">サマリー</div>
        <div class="small muted rqa-mockNote">※サンプル表示（戦績が溜まるとここに反映されます）</div>
        <div class="kpis">
          <div class="kpi"><div class="label">試合数</div><div class="value">12</div></div>
          <div class="kpi"><div class="label">正解率</div><div class="value">78.0%</div></div>
          <div class="kpi"><div class="label">平均スコア</div><div class="value">845</div></div>
          <div class="kpi"><div class="label">平均 解答時間/問</div><div class="value">1.42秒</div></div>
        </div>
        <div class="small" style="margin-top:8px">※数値は例です。</div>
      </div>
    `.trim()
  );

  setHTML(
    "genreCard",
    `
      <div data-rqa-mock>
        <div class="h2">ジャンル別</div>
        <div class="small muted rqa-mockNote">※サンプル表示</div>
        <table class="table">
          <thead><tr><th>ジャンル</th><th>正解率</th><th>正解/総数</th></tr></thead>
          <tbody>
            <tr><td>計算</td><td>82.0%</td><td>41/50</td></tr>
            <tr><td>記憶</td><td>70.0%</td><td>35/50</td></tr>
            <tr><td>論理</td><td>82.0%</td><td>41/50</td></tr>
          </tbody>
        </table>
      </div>
    `.trim()
  );

  setHTML(
    "modeCard",
    `
      <div data-rqa-mock>
        <div class="h2">モード別</div>
        <div class="small muted rqa-mockNote">※サンプル表示</div>
        <table class="table">
          <thead><tr><th>モード</th><th>試合数</th><th>平均スコア</th></tr></thead>
          <tbody>
            <tr><td>練習</td><td>3</td><td>790</td></tr>
            <tr><td>CPU</td><td>4</td><td>820</td></tr>
            <tr><td>フリー</td><td>3</td><td>860</td></tr>
            <tr><td>レート</td><td>2</td><td>910</td></tr>
          </tbody>
        </table>
      </div>
    `.trim()
  );

  setHTML(
    "recentCard",
    `
      <div data-rqa-mock>
        <div class="h2">最近の試合</div>
        <div class="small muted rqa-mockNote">※サンプル表示</div>
        <table class="table">
          <thead><tr><th>日時</th><th>モード</th><th>スコア</th><th>正解</th></tr></thead>
          <tbody>
            <tr><td>2026-01-28 21:10</td><td>練習</td><td>840</td><td>8/10</td></tr>
            <tr><td>2026-01-27 20:45</td><td>CPU</td><td>800</td><td>7/10</td></tr>
            <tr><td>2026-01-27 19:30</td><td>フリー</td><td>890</td><td>9/10</td></tr>
            <tr><td>2026-01-26 22:05</td><td>レート</td><td>930</td><td>9/10</td></tr>
            <tr><td>2026-01-26 21:40</td><td>CPU</td><td>760</td><td>7/10</td></tr>
          </tbody>
        </table>
        <div class="small" style="margin-top:8px">※最近の試合がここに並びます。</div>
      </div>
    `.trim()
  );
})();
