// Generates a synthetic CRM snapshot for a fictional B2B infrastructure
// software company. Every company, person and number here is invented.
//
//   node data/generate.js [--seed 42] [--as-of 2026-09-30]

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRng } from "../src/lib/rng.js";
import { addDays } from "../src/lib/dates.js";
import { STAGES } from "../src/lib/config.js";

const args = process.argv.slice(2);
const argVal = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

export function generate({ seed = 42, asOf = "2026-09-30" } = {}) {
  const rng = createRng(seed);

  const prefixes = ["Blue", "Harbor", "Summit", "Cedar", "Ironwood", "Lumen", "Northgate", "Quarry",
    "Redline", "Silverleaf", "Tidewater", "Vantage", "Westbrook", "Brightpath", "Copperline",
    "Driftwood", "Evergreen", "Foxhollow", "Granite", "Hollow Creek", "Juniper", "Keystone",
    "Larkspur", "Meridian", "Oakridge", "Pinecrest", "Riverbend", "Stonegate", "Trailhead", "Windward"];
  const suffixes = ["Health", "Logistics", "Capital", "Retail Group", "Systems", "Labs", "Freight",
    "Clinics", "Bank", "Markets", "Media", "Energy"];
  const industries = ["Healthcare", "Logistics", "Financial Services", "Retail", "Media", "Energy", "Education"];
  const signals = ["contact-center", "iot-fleet", "programmable-voice", "legacy-pbx", "sms-marketing"];
  const competitors = [null, null, "Competitor A", "Competitor B", "Competitor C"];
  const reps = ["Avery Lane", "Jordan Pike", "Morgan Reyes", "Riley Chen"];
  const useCases = ["Contact center modernization", "IoT fleet connectivity", "Voice AI agents",
    "Appointment reminders", "Global SIP trunking", "Fraud alerts via SMS"];

  const accounts = prefixes.map((p, i) => {
    const industry = rng.pick(industries);
    const accountSignals = signals.filter(() => rng.chance(0.3));
    return {
      id: `ACC-${String(i + 1).padStart(3, "0")}`,
      name: `${p} ${rng.pick(suffixes)}`,
      industry,
      employees: rng.pick([60, 150, 400, 900, 1800, 3500, 8000, 20000]),
      region: rng.pick(["Central", "East", "West"]),
      techSignals: accountSignals,
      competitor: rng.pick(competitors),
    };
  });

  const opportunities = [];
  const activities = [];
  let oppSeq = 1;
  let actSeq = 1;

  for (const account of accounts) {
    const oppCount = rng.chance(0.35) ? 2 : 1;
    for (let k = 0; k < oppCount; k++) {
      const stage = rng.pick([0, 1, 1, 2, 2, 3, 3, 4]);
      const stageInfo = STAGES[stage];
      // Health archetype drives how realistic-looking the deal's signals are.
      const health = rng.pick(["strong", "strong", "steady", "steady", "steady", "stalled", "stalled", "dead"]);
      const createdDaysAgo = rng.int(20, 200);
      const stageAgeDays = Math.min(createdDaysAgo,
        health === "stalled" || health === "dead"
          ? rng.int(stageInfo.expectedDays, stageInfo.expectedDays * 3)
          : rng.int(5, stageInfo.expectedDays));
      const closeOffset = health === "dead" && rng.chance(0.5) ? -rng.int(3, 40) : rng.int(10, 120);

      const opp = {
        id: `OPP-${String(oppSeq++).padStart(4, "0")}`,
        accountId: account.id,
        name: `${account.name} — ${rng.pick(useCases)}`,
        owner: rng.pick(reps),
        stage,
        stageName: stageInfo.name,
        amountArr: rng.pick([24000, 36000, 60000, 90000, 120000, 180000, 250000]),
        createdDate: addDays(asOf, -createdDaysAgo),
        stageEnteredDate: addDays(asOf, -stageAgeDays),
        closeDate: addDays(asOf, closeOffset),
        closeDatePushes: health === "stalled" || health === "dead" ? rng.int(1, 5) : rng.int(0, 1),
        nextStep: health === "dead" || (health === "stalled" && rng.chance(0.6)) ? "" : rng.pick([
          "Technical deep-dive with network team", "Security review", "Pricing review with CFO",
          "Pilot kickoff", "Redline MSA", "Architecture workshop"]),
        qualification: {
          painIdentified: health !== "dead" || rng.chance(0.3),
          useCaseDefined: stage >= 1 && (health !== "dead" || rng.chance(0.3)),
          championIdentified: (health === "strong" && stage >= 1) || rng.chance(0.25),
          economicBuyerIdentified: (health === "strong" && stage >= 3) || rng.chance(0.15),
        },
        contactsEngaged: health === "strong" ? rng.int(3, 7) : health === "steady" ? rng.int(2, 4) : rng.int(1, 2),
        productUsageTrend: rng.pick(["none", "none", health === "strong" ? "rising" : "flat",
          health === "dead" ? "declining" : "flat"]),
      };
      opportunities.push(opp);

      // Activity history over the last 90 days, density driven by health.
      const density = { strong: 14, steady: 7, stalled: 2, dead: 0 }[health];
      const recentWindow = { strong: 14, steady: 25, stalled: 70, dead: 90 }[health];
      for (let n = 0; n < density; n++) {
        const daysAgo = n < 3 ? rng.int(0, recentWindow) : rng.int(0, 89);
        const type = rng.pick(["email", "email", "email", "call", "call", "meeting"]);
        activities.push({
          id: `ACT-${String(actSeq++).padStart(5, "0")}`,
          opportunityId: opp.id,
          type,
          date: addDays(asOf, -daysAgo),
          externalParticipants: type === "meeting" ? rng.int(1, opp.contactsEngaged) : 1,
        });
      }
    }
  }

  return { asOf, generatedWithSeed: seed, quarter: "Q4 2026", reps, accounts, opportunities, activities };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const data = generate({ seed: Number(argVal("--seed", 42)), asOf: argVal("--as-of", "2026-09-30") });
  const out = join(dirname(fileURLToPath(import.meta.url)), "crm.json");
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Wrote ${data.accounts.length} accounts, ${data.opportunities.length} opportunities, ` +
    `${data.activities.length} activities to data/crm.json`);
}
