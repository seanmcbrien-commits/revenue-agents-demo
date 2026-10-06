// Orchestrator: runs the agents in order and writes the reports.
//
//   node src/orchestrator.js                 # all reps
//   node src/orchestrator.js --rep "Riley Chen"
//   node src/orchestrator.js --json          # print raw JSON instead of a summary

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCrm } from "./lib/crm.js";
import { runOppEval } from "./agents/opp-eval.js";
import { runPipelineHealth } from "./agents/pipeline-health.js";
import { writeBrief } from "./agents/brief-writer.js";
import { renderMarkdown, renderHtml } from "./report.js";

export async function run({ rep } = {}) {
  const crm = loadCrm();
  // 1. Evaluate every deal. 2. Roll up health, using the evaluations to find
  // high-value deals at risk. 3. Write the brief from both.
  const evaluations = runOppEval(crm, rep ? { owner: rep } : {});
  const health = runPipelineHealth(crm, { evaluations });
  if (rep) health.reps = health.reps.filter((r) => r.rep === rep);
  const brief = await writeBrief(health, evaluations);
  return { health, evaluations, brief };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const repIdx = args.indexOf("--rep");
  const result = await run({ rep: repIdx >= 0 ? args[repIdx + 1] : undefined });

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const outDir = join(dirname(fileURLToPath(import.meta.url)), "../reports");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "pipeline-report.md"), renderMarkdown(result));
    writeFileSync(join(outDir, "dashboard.html"), renderHtml(result));
    const t = result.health.team;
    console.log(result.brief.text);
    console.log(`\n${result.evaluations.length} deals evaluated · ` +
      `${t.alertCounts.CRITICAL} critical / ${t.alertCounts.WARNING} warning / ${t.alertCounts.STALE} stale alerts`);
    console.log("Wrote reports/pipeline-report.md and reports/dashboard.html");
  }
}
