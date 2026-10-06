// Opportunity Evaluation agent.
//
// Scores every open deal on six weighted factors (0-100), maps the score to a
// keep/close recommendation, then applies evidence-based overrides that can
// move the recommendation up or down by at most two tiers. Every point is
// explainable: the output lists each factor and each override that fired.

import { ICP, stageByNum } from "../lib/config.js";
import { daysBetween } from "../lib/dates.js";

export const FACTORS = {
  activity: { max: 20, label: "Recent activity (14d)" },
  meetings: { max: 20, label: "Meeting evidence (30d)" },
  icpFit: { max: 15, label: "ICP fit" },
  qualification: { max: 15, label: "Qualification depth" },
  engagement: { max: 15, label: "Engagement breadth" },
  momentum: { max: 15, label: "Deal momentum" },
};

export const TIERS = [
  { min: 0, max: 25, label: "Close out", key: "close" },
  { min: 26, max: 40, label: "Close out (soft)", key: "close_soft" },
  { min: 41, max: 60, label: "Keep — watch", key: "watch" },
  { min: 61, max: 80, label: "Keep — active", key: "active" },
  { min: 81, max: 100, label: "Keep — strong", key: "strong" },
];

const tierFor = (score) => TIERS.find((t) => score >= t.min && score <= t.max) || TIERS[0];
const cap = (key, value) => Math.max(0, Math.min(FACTORS[key].max, Math.round(value)));

export function scoreIcpFit(account) {
  let points = 0;
  if (ICP.targetIndustries.includes(account.industry)) points += 5;
  const [lo, hi] = ICP.employeeRange;
  if (account.employees >= lo && account.employees <= hi) points += 5;
  else if (account.employees > hi) points += 3; // enterprise: fits, slower cycle
  if (account.techSignals.some((s) => ICP.fitSignals.includes(s))) points += 5;
  return cap("icpFit", points);
}

export function evaluateOpportunity(crm, opp) {
  const account = crm.getAccount(opp.accountId);
  const recent = crm.getActivities(opp.id, 14);
  const last30 = crm.getActivities(opp.id, 30);
  const stage = stageByNum(opp.stage);
  const stageAge = daysBetween(opp.stageEnteredDate, crm.asOf);
  const daysSinceContact = crm.daysSinceLastActivity(opp.id);
  const q = opp.qualification;

  const factors = {
    // Emails count for 2 points, calls 4, meetings 5 — capped at 20.
    activity: cap("activity", recent.reduce((s, a) =>
      s + ({ email: 2, call: 4, meeting: 5 }[a.type] || 0), 0)),
    // Customer meetings in the last 30 days, weighted by attendance.
    meetings: cap("meetings", last30.filter((a) => a.type === "meeting")
      .reduce((s, m) => s + 6 + Math.min(4, m.externalParticipants), 0)),
    icpFit: scoreIcpFit(account),
    qualification: cap("qualification",
      (q.painIdentified ? 3 : 0) + (q.useCaseDefined ? 3 : 0) +
      (q.championIdentified ? 4 : 0) + (q.economicBuyerIdentified ? 3 : 0) +
      (opp.nextStep ? 2 : 0)),
    // Multi-threading: one contact is fragile, five or more is healthy.
    engagement: cap("engagement", opp.contactsEngaged * 3),
    // Full marks when the deal is inside its expected stage window and the
    // close date has not slipped; points fall away as either degrades.
    momentum: cap("momentum",
      15 * Math.min(1, stage.expectedDays / Math.max(stageAge, 1)) - opp.closeDatePushes * 3),
  };

  const baseScore = Object.values(factors).reduce((a, b) => a + b, 0);

  const overrides = [];
  const up = (reason) => overrides.push({ reason, effect: +1 });
  const down = (reason) => overrides.push({ reason, effect: -1 });
  if (q.economicBuyerIdentified) up("Economic buyer identified");
  if (opp.amountArr >= 150000) up(`Large deal ($${opp.amountArr.toLocaleString("en-US")} ARR)`);
  if (opp.productUsageTrend === "rising") up("Product usage rising during evaluation");
  if (daysSinceContact >= 60) down(daysSinceContact === Infinity ? "No logged customer contact" : `No customer contact in ${daysSinceContact} days`);
  if (opp.closeDatePushes >= 3) down(`Close date pushed ${opp.closeDatePushes} times`);
  if (opp.productUsageTrend === "declining") down("Product usage declining");
  if (daysBetween(crm.asOf, opp.closeDate) < 0) down("Close date is in the past");

  // Net shift is capped at ±2 tiers so a single strong or weak signal cannot
  // swamp the underlying evidence.
  const shift = Math.max(-2, Math.min(2, overrides.reduce((s, o) => s + o.effect, 0)));
  const baseTier = tierFor(baseScore);
  const idx = Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(baseTier) + shift));
  const finalTier = TIERS[idx];
  const finalScore = shift > 0 ? Math.max(baseScore, finalTier.min)
    : shift < 0 ? Math.min(baseScore, finalTier.max) : baseScore;

  return {
    opportunityId: opp.id,
    opportunity: opp.name,
    account: account.name,
    owner: opp.owner,
    stage: opp.stageName,
    amountArr: opp.amountArr,
    baseScore,
    finalScore,
    recommendation: finalTier.label,
    tier: finalTier.key,
    breakdown: Object.entries(factors).map(([key, score]) => ({
      factor: FACTORS[key].label, score, max: FACTORS[key].max })),
    overrides,
  };
}

export function runOppEval(crm, filter = {}) {
  return crm.listOpportunities(filter)
    .map((opp) => evaluateOpportunity(crm, opp))
    .sort((a, b) => b.finalScore - a.finalScore);
}
