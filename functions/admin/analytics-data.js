export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const range = (url.searchParams.get("range") || "today").toLowerCase();

  const token =
    env.CF_ANALYTICS_API_TOKEN ||
    env.CF_API_TOKEN ||
    env.CLOUDFLARE_API_TOKEN ||
    env.CLOUDFLARE_TOKEN;

  const accountTag =
    env.CF_ANALYTICS_ACCOUNT_TAG ||
    env.CF_ACCOUNT_TAG ||
    env.CLOUDFLARE_ACCOUNT_TAG;

  const host =
    env.CF_ANALYTICS_HOST ||
    env.CF_REQUEST_HOST ||
    url.host;

  const siteTagsRaw =
    env.CF_ANALYTICS_SITE_TAG ||
    env.CF_SITE_TAG ||
    "";

  const siteTags = siteTagsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const authEmail =
    env.CF_AUTH_EMAIL ||
    env.CLOUDFLARE_AUTH_EMAIL ||
    "";

  // Missing config
  if (!token || !accountTag) {
    return json({
      ok: false,
      error: "missing_env",
      errorDetail: "Need CF_ANALYTICS_API_TOKEN and CF_ANALYTICS_ACCOUNT_TAG (and optionally CF_ANALYTICS_SITE_TAG).",
    });
  }

  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const jstOffsetMs = 9 * 60 * 60 * 1000;

  let startMs;
  if (range === "24h") {
    startMs = nowMs - 24 * 60 * 60 * 1000;
  } else if (range === "7d") {
    startMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  } else {
    // today in JST
    startMs = Math.floor((nowMs + jstOffsetMs) / dayMs) * dayMs - jstOffsetMs;
  }

  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(nowMs).toISOString();

  const and = [
    { datetime_geq: startIso, datetime_leq: endIso },
    { requestHost: host },
    { bot: 0 },
  ];
  if (siteTags.length) {
    and.push({ OR: siteTags.map((t) => ({ siteTag: t })) });
  }

  const filter = { AND: and };

  const query = `
    query RqaRum($accountTag: string!, $filter: filter) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          series: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: $filter) {
            count
            avg { sampleInterval }
            sum { visits }
            dimensions { datetimeHour }
          }
          topPaths: rumPageloadEventsAdaptiveGroups(limit: 10, filter: $filter, orderBy: [sum_visits_DESC]) {
            count
            sum { visits }
            dimensions { requestPath }
          }
        }
      }
    }
  `.trim();

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
  };
  if (authEmail) {
    headers["X-AUTH-EMAIL"] = authEmail;
  }

  let apiRes;
  try {
    apiRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: { accountTag, filter } }),
    });
  } catch (e) {
    return json({ ok: false, error: "fetch_failed", errorDetail: String(e) });
  }

  let payloadText = "";
  try {
    payloadText = await apiRes.text();
  } catch (e) {
    return json({ ok: false, error: "read_failed", errorDetail: String(e) });
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (e) {
    return json({ ok: false, error: "json_parse_failed", errorDetail: payloadText.slice(0, 500) });
  }

  if (!apiRes.ok || payload.errors) {
    return json({
      ok: false,
      error: "api_error",
      errorDetail: payload.errors ? JSON.stringify(payload.errors).slice(0, 900) : payloadText.slice(0, 900),
    });
  }

  const acct = (payload.data && payload.data.viewer && payload.data.viewer.accounts && payload.data.viewer.accounts[0]) || {};
  const rawSeries = Array.isArray(acct.series) ? acct.series : [];
  const rawTop = Array.isArray(acct.topPaths) ? acct.topPaths : [];

  const series = rawSeries.map((x) => {
    const ts = x && x.dimensions ? x.dimensions.datetimeHour : null;
    const visits = x && x.sum ? (x.sum.visits || 0) : 0;
    const pageLoads = x && x.count ? x.count : 0;
    const sampleInterval = x && x.avg ? (x.avg.sampleInterval || null) : null;
    return { ts, visits, pageLoads, sampleInterval };
  });

  const totalVisits = series.reduce((a, b) => a + (Number(b.visits) || 0), 0);
  const totalPageLoads = series.reduce((a, b) => a + (Number(b.pageLoads) || 0), 0);

  const topPaths = rawTop.map((x) => {
    const path = x && x.dimensions ? x.dimensions.requestPath : "/";
    const visits = x && x.sum ? (x.sum.visits || 0) : 0;
    const pageLoads = x && x.count ? x.count : 0;
    return { path, visits, pageLoads };
  });

  return json({
    ok: true,
    range,
    generatedAt: new Date().toISOString(),
    host,
    siteTags,
    startIso,
    endIso,
    totalVisits,
    totalPageLoads,
    series,
    topPaths,
  });
}

function json(obj, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(obj, null, 2), { ...init, headers });
}
