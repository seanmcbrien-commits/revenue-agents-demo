import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../data/generate.js";
import { createCrm } from "../src/lib/crm.js";
import { evaluateOpportunity, runOppEval, scoreIcpFit, FACTORS } from "../src/agents/opp-eval.js";
import { runPipelineHealth, dealAlerts } from "../src/agents/pipeline-health.js";
import { templateBrief, writeBrief } from "../src/agents/brief-writer.js";

const ASOF = "2026-09-30";

// A hand-built CRM so each rule can be tested in isolation.
function fixture(oppOverrides = {}, activities = []) {
  const opp = {
    id: "OPP-T1", accountId: "ACC-T1", name: "Test deal", owner: "Test Rep",
    stage: 3, stageName: "Proposal", amountArr: 60000,
    createdDate: "2026-07-01", stageEnteredDate: "2026-09-15", closeDate: "2026-11-15",
    closeDatePushes: 0, nextStep: "Security review",
    qualification: { painIdentified: true, useCaseDefined: true, championIdentified: true, economicBuyerIdentified: true },
    contactsEngaged: 4, productUsageTrend: "none", ...oppOverrides,
  };
  return createCrm({
    asOf: ASOF, quarter: "Q4 2026", reps: ["Test Rep"],
    accounts: [{ id: "ACC-T1", name: "Test Co", industry: "Healthcare", employees: 900, region: "Central",
      techSignals: ["contact-center"], competitor: null }],
    opportunities: [opp], activities,
  });
}

test("synthetic data is reproducible for a given seed", () => {
  assert.deepEqual(generate({ seed: 7 }), generate({ seed: 7 }));
  assert.notDeepEqual(generate({ seed: 7 }), generate({ seed: 8 }));
});

test("ICP fit awards industry, size and technographic points", () => {
  assert.equal(scoreIcpFit({ industry: "Healthcare", employees: 900, techSignals: ["contact-center"] }), 15);
  assert.equal(scoreIcpFit({ industry: "Media", employees: 50, techSignals: [] }), 0);
});

test("every factor stays within its maximum and the score is the sum", () => {
  const crm = createCrm(generate({ seed: 3 }));
  for (const e of runOppEval(crm)) {
    for (const b of e.breakdown) assert.ok(b.score >= 0 && b.score <= b.max, `${b.factor} out of range`);
    assert.equal(e.baseScore, e.breakdown.reduce((s, b) => s + b.score, 0));
    assert.ok(e.finalScore >= 0 && e.finalScore <= 100);
  }
  assert.equal(Object.values(FACTORS).reduce((s, f) => s + f.max, 0), 100);
});

test("a quiet, slipping deal is downgraded by overrides", () => {
  const crm = fixture({ closeDatePushes: 4, closeDate: "2026-09-01", productUsageTrend: "declining",
    qualification: { painIdentified: true, useCaseDefined: false, championIdentified: false, economicBuyerIdentified: false } });
  const e = evaluateOpportunity(crm, crm.getOpportunity("OPP-T1"));
  assert.ok(e.overrides.filter((o) => o.effect < 0).length >= 3);
  assert.ok(e.finalScore <= e.baseScore);
  assert.match(e.recommendation, /Close out/);
});

test("override shift is capped at two tiers", () => {
  const crm = fixture({ amountArr: 250000, productUsageTrend: "rising", contactsEngaged: 1, stageEnteredDate: "2026-03-01" });
  const e = evaluateOpportunity(crm, crm.getOpportunity("OPP-T1"));
  assert.equal(e.overrides.filter((o) => o.effect > 0).length, 3);
  const tiers = ["close", "close_soft", "watch", "active", "strong"];
  const baseIdx = tiers.findIndex((_, i) => e.baseScore <= [25, 40, 60, 80, 100][i]);
  assert.ok(tiers.indexOf(e.tier) - baseIdx <= 2);
});

test("pipeline health raises the expected deal alerts", () => {
  const crm = fixture({ contactsEngaged: 1, closeDate: "2026-09-20", nextStep: "",
    qualification: { painIdentified: true, useCaseDefined: true, championIdentified: true, economicBuyerIdentified: false } });
  const rules = dealAlerts(crm, crm.getOpportunity("OPP-T1")).map((a) => a.rule);
  for (const r of ["past_due", "single_threaded", "no_economic_buyer", "no_next_step", "no_recent_activity"]) {
    assert.ok(rules.includes(r), `missing ${r}`);
  }
});

test("a healthy deal raises no alerts", () => {
  const crm = fixture({}, [{ id: "A1", opportunityId: "OPP-T1", type: "meeting", date: "2026-09-28", externalParticipants: 3 }]);
  assert.deepEqual(dealAlerts(crm, crm.getOpportunity("OPP-T1")), []);
});

test("team roll-up equals the sum of reps", () => {
  const crm = createCrm(generate({ seed: 42 }));
  const h = runPipelineHealth(crm, { evaluations: runOppEval(crm) });
  assert.equal(h.team.pipeline, h.reps.reduce((s, r) => s + r.pipeline, 0));
  assert.equal(h.reps.reduce((s, r) => s + r.openDeals, 0), crm.listOpportunities().length);
});

test("brief falls back to the template without an API key", async () => {
  const crm = createCrm(generate({ seed: 42 }));
  const evaluations = runOppEval(crm);
  const health = runPipelineHealth(crm, { evaluations });
  const brief = await writeBrief(health, evaluations, { apiKey: "" });
  assert.equal(brief.source, "template");
  assert.equal(brief.text, templateBrief(health, evaluations));
  assert.match(brief.text, /weighted forecast/);
});
