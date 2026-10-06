// Pipeline Health agent.
//
// Rolls deals up by rep, computes a stage-weighted forecast and pipeline
// coverage against remaining quota, and raises prioritised alerts for the
// patterns that usually precede a missed forecast.

import { STAGES, stageByNum, QUARTERLY_QUOTA, MIN_COVERAGE } from "../lib/config.js";
import { daysBetween } from "../lib/dates.js";

const LEVEL_ORDER = { CRITICAL: 0, WARNING: 1, STALE: 2 };

// Rules that, on an otherwise healthy deal, usually mean the forecast date or
// amount is at risk.
const FORECAST_RISK_RULES = new Set(["past_due", "single_threaded", "no_economic_buyer", "stalled_stage", "serial_slip"]);

export function dealAlerts(crm, opp) {
  const alerts = [];
  const add = (level, rule, message) =>
    alerts.push({ level, rule, opportunityId: opp.id, owner: opp.owner, message });
  const stage = stageByNum(opp.stage);
  const stageAge = daysBetween(opp.stageEnteredDate, crm.asOf);
  const daysToClose = daysBetween(crm.asOf, opp.closeDate);
  const quiet = crm.daysSinceLastActivity(opp.id);

  if (daysToClose < 0) {
    add("CRITICAL", "past_due", `${opp.name}: close date passed ${-daysToClose} days ago and the deal is still open`);
  }
  if (opp.stage >= 3 && opp.contactsEngaged <= 1) {
    add("CRITICAL", "single_threaded", `${opp.name}: ${opp.stageName} with only one engaged contact`);
  }
  if (opp.stage >= 3 && !opp.qualification.economicBuyerIdentified) {
    add("WARNING", "no_economic_buyer", `${opp.name}: ${opp.stageName} without an identified economic buyer`);
  }
  if (stageAge > stage.expectedDays * 1.5) {
    add("WARNING", "stalled_stage", `${opp.name}: ${stageAge} days in ${opp.stageName} (expected ≤ ${stage.expectedDays})`);
  }
  if (opp.closeDatePushes >= 3) {
    add("WARNING", "serial_slip", `${opp.name}: close date pushed ${opp.closeDatePushes} times`);
  }
  if (!opp.nextStep) {
    add("WARNING", "no_next_step", `${opp.name}: no next step recorded`);
  }
  if (quiet >= 14) {
    add("STALE", "no_recent_activity", `${opp.name}: ${quiet === Infinity ? "no logged activity" : `no activity in ${quiet} days`}`);
  }
  return alerts;
}

export function runPipelineHealth(crm, { evaluations = [] } = {}) {
  const evalById = new Map(evaluations.map((e) => [e.opportunityId, e]));
  const reps = crm.reps.map((rep) => {
    const opps = crm.listOpportunities({ owner: rep });
    const pipeline = opps.reduce((s, o) => s + o.amountArr, 0);
    const weighted = opps.reduce((s, o) => s + o.amountArr * stageByNum(o.stage).winProbability, 0);
    const coverage = pipeline / QUARTERLY_QUOTA;
    const alerts = opps.flatMap((o) => dealAlerts(crm, o));
    if (coverage < MIN_COVERAGE) {
      alerts.unshift({ level: "CRITICAL", rule: "low_coverage", owner: rep, opportunityId: null,
        message: `${rep}: pipeline coverage ${coverage.toFixed(1)}x quota (target ≥ ${MIN_COVERAGE}x)` });
    }
    // Deals the evaluation agent wants to keep that are also tripping a
    // forecast-risk rule are the ones a manager should look at first.
    const atRisk = opps.filter((o) => {
      const e = evalById.get(o.id);
      return e && ["active", "strong"].includes(e.tier) &&
        alerts.some((a) => a.opportunityId === o.id && FORECAST_RISK_RULES.has(a.rule));
    }).map((o) => o.id);

    return {
      rep,
      openDeals: opps.length,
      pipeline,
      weightedForecast: Math.round(weighted),
      quota: QUARTERLY_QUOTA,
      coverage: Number(coverage.toFixed(2)),
      byStage: STAGES.map((s) => ({
        stage: s.name,
        count: opps.filter((o) => o.stage === s.num).length,
        amount: opps.filter((o) => o.stage === s.num).reduce((sum, o) => sum + o.amountArr, 0),
      })),
      alerts: alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]),
      highValueAtRisk: atRisk,
    };
  });

  const allAlerts = reps.flatMap((r) => r.alerts);
  return {
    asOf: crm.asOf,
    quarter: crm.quarter,
    team: {
      pipeline: reps.reduce((s, r) => s + r.pipeline, 0),
      weightedForecast: reps.reduce((s, r) => s + r.weightedForecast, 0),
      quota: QUARTERLY_QUOTA * reps.length,
      alertCounts: Object.fromEntries(Object.keys(LEVEL_ORDER).map((l) =>
        [l, allAlerts.filter((a) => a.level === l).length])),
    },
    reps,
  };
}
