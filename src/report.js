// Renders agent output as a Markdown report and a self-contained HTML dashboard.

const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderMarkdown({ health, evaluations, brief }) {
  const t = health.team;
  const out = [];
  out.push(`# Pipeline report — ${health.quarter} (as of ${health.asOf})`, "");
  out.push(`> ${brief.text}`, "", `_Brief written by: ${brief.source}_`, "");
  out.push("## Team", "",
    "| Rep | Open deals | Pipeline | Weighted forecast | Coverage | Critical | Warning | Stale |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of health.reps) {
    const n = (l) => r.alerts.filter((a) => a.level === l).length;
    out.push(`| ${r.rep} | ${r.openDeals} | ${usd(r.pipeline)} | ${usd(r.weightedForecast)} | ` +
      `${r.coverage}x | ${n("CRITICAL")} | ${n("WARNING")} | ${n("STALE")} |`);
  }
  out.push(`| **Team** | ${evaluations.length} | ${usd(t.pipeline)} | ${usd(t.weightedForecast)} | ` +
    `${(t.pipeline / t.quota).toFixed(2)}x | ${t.alertCounts.CRITICAL} | ${t.alertCounts.WARNING} | ${t.alertCounts.STALE} |`, "");

  out.push("## Deal evaluations", "",
    "| Score | Recommendation | Opportunity | Owner | Stage | ARR | Overrides |",
    "| ---: | --- | --- | --- | --- | ---: | --- |");
  for (const e of evaluations) {
    const ov = e.overrides.map((o) => `${o.effect > 0 ? "▲" : "▼"} ${o.reason}`).join("<br>") || "—";
    out.push(`| ${e.finalScore} | ${e.recommendation} | ${e.opportunity} | ${e.owner} | ${e.stage} | ${usd(e.amountArr)} | ${ov} |`);
  }
  out.push("", "## Critical alerts", "");
  for (const a of health.reps.flatMap((r) => r.alerts).filter((a) => a.level === "CRITICAL")) {
    out.push(`- **${a.rule}** — ${a.message}`);
  }
  out.push("", "_All companies, people and figures in this report are synthetic._", "");
  return out.join("\n");
}

export function renderHtml({ health, evaluations, brief }) {
  const t = health.team;
  const tierColor = { strong: "#1a7f4b", active: "#3d8b5f", watch: "#b7791f", close_soft: "#c05621", close: "#c53030" };
  const rows = evaluations.map((e) => `
      <tr>
        <td class="num"><span class="pill" style="background:${tierColor[e.tier]}">${e.finalScore}</span></td>
        <td>${esc(e.recommendation)}</td>
        <td>${esc(e.opportunity)}<div class="sub">${e.breakdown.map((b) =>
          `<span title="${esc(b.factor)}" class="bar"><i style="width:${(b.score / b.max) * 100}%"></i></span>`).join("")}</div></td>
        <td>${esc(e.owner)}</td><td>${esc(e.stage)}</td><td class="num">${usd(e.amountArr)}</td>
        <td class="sub">${e.overrides.map((o) => `${o.effect > 0 ? "▲" : "▼"} ${esc(o.reason)}`).join("<br>")}</td>
      </tr>`).join("");
  const repCards = health.reps.map((r) => `
      <div class="card">
        <h3>${esc(r.rep)}</h3>
        <div class="big">${r.coverage}x</div><div class="sub">coverage · ${usd(r.weightedForecast)} weighted</div>
        <div class="sub">${r.alerts.filter((a) => a.level === "CRITICAL").length} critical · ${r.alerts.filter((a) => a.level === "WARNING").length} warning</div>
      </div>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pipeline Dashboard</title>
<style>
  :root { --bg:#f7f7f5; --fg:#1d1d1b; --muted:#6b6b66; --card:#fff; --line:#e4e4df; --accent:#2b6cb0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151514; --fg:#ececea; --muted:#9a9a94; --card:#1f1f1d; --line:#33332f; } }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui,-apple-system,sans-serif; }
  main { max-width:1100px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; } .sub { color:var(--muted); font-size:12px; }
  .brief { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--accent); padding:12px 16px; margin:16px 0; border-radius:6px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:16px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:12px 14px; }
  .card h3 { margin:0; font-size:14px; } .big { font-size:26px; font-weight:600; }
  .table-wrap { overflow-x:auto; } table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:12px; color:var(--muted); font-weight:600; } .num { text-align:right; white-space:nowrap; }
  .pill { color:#fff; border-radius:10px; padding:1px 8px; font-weight:600; }
  .bar { display:inline-block; width:28px; height:5px; background:var(--line); margin-right:3px; border-radius:3px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--accent); }
</style></head>
<body><main>
  <h1>Pipeline dashboard — ${esc(health.quarter)}</h1>
  <div class="sub">As of ${esc(health.asOf)} · ${usd(t.pipeline)} pipeline · ${usd(t.weightedForecast)} weighted · ${usd(t.quota)} quota · synthetic data</div>
  <div class="brief">${esc(brief.text)}<div class="sub">Brief: ${esc(brief.source)}</div></div>
  <div class="cards">${repCards}</div>
  <div class="table-wrap"><table>
    <thead><tr><th class="num">Score</th><th>Recommendation</th><th>Opportunity <span class="sub">(factor bars: activity · meetings · ICP · qualification · engagement · momentum)</span></th><th>Owner</th><th>Stage</th><th class="num">ARR</th><th>Overrides</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</main></body></html>`;
}
