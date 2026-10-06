// Brief Writer agent.
//
// Turns the structured output of the other agents into a short manager brief.
// With ANTHROPIC_API_KEY set it asks Claude to write the brief from the JSON;
// without a key it falls back to a deterministic template, so the demo runs
// anywhere. The LLM only writes prose: every number it may use is computed
// upstream and passed in, which keeps the brief auditable.

const usd = (n) => `$${Math.round(n / 1000).toLocaleString("en-US")}k`;

export function templateBrief(health, evaluations) {
  const t = health.team;
  const lines = [
    `Team pipeline is ${usd(t.pipeline)} against ${usd(t.quota)} of quarterly quota; ` +
      `the stage-weighted forecast is ${usd(t.weightedForecast)}.`,
    `${t.alertCounts.CRITICAL} critical and ${t.alertCounts.WARNING} warning alerts are open.`,
  ];
  const atRisk = health.reps.flatMap((r) => r.highValueAtRisk);
  if (atRisk.length) {
    const names = evaluations.filter((e) => atRisk.includes(e.opportunityId)).map((e) => e.opportunity);
    lines.push(`Look at these first — strong deals with a forecast-risk flag: ${names.join("; ")}.`);
  }
  const closeOut = evaluations.filter((e) => e.tier === "close");
  if (closeOut.length) {
    lines.push(`${closeOut.length} deals (${usd(closeOut.reduce((s, e) => s + e.amountArr, 0))}) ` +
      `score as close-out candidates and are inflating coverage.`);
  }
  const lowest = [...health.reps].sort((a, b) => a.coverage - b.coverage)[0];
  lines.push(`Lowest coverage: ${lowest.rep} at ${lowest.coverage}x.`);
  return lines.join(" ");
}

export async function writeBrief(health, evaluations, {
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.BRIEF_MODEL || "claude-sonnet-5-5",
} = {}) {
  if (!apiKey) return { source: "template", text: templateBrief(health, evaluations) };

  const payload = {
    team: health.team,
    reps: health.reps.map(({ rep, coverage, weightedForecast, highValueAtRisk, alerts }) => ({
      rep, coverage, weightedForecast, highValueAtRisk,
      criticalAlerts: alerts.filter((a) => a.level === "CRITICAL").map((a) => a.message),
    })),
    topDeals: evaluations.slice(0, 5).map(({ opportunity, finalScore, recommendation }) =>
      ({ opportunity, finalScore, recommendation })),
    closeOutCandidates: evaluations.filter((e) => e.tier === "close").map((e) => e.opportunity),
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: "You write five-sentence pipeline briefs for a sales manager. Use only numbers " +
          "present in the JSON. Lead with the forecast, then the deals to act on first.",
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const body = await res.json();
    return { source: model, text: body.content.map((c) => c.text || "").join("").trim() };
  } catch (err) {
    return { source: `template (LLM call failed: ${err.message})`, text: templateBrief(health, evaluations) };
  }
}
