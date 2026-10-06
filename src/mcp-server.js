// MCP server: exposes the agents as tools so Claude (Claude Desktop, Claude
// Code or any MCP client) can answer pipeline questions in plain English,
// e.g. "Which of Riley's deals should I worry about this week?"
//
//   node src/mcp-server.js        # speaks MCP over stdio
//
// The server is read-only by design: it can score and report on deals but
// never writes back to the CRM.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadCrm } from "./lib/crm.js";
import { evaluateOpportunity, runOppEval } from "./agents/opp-eval.js";
import { runPipelineHealth } from "./agents/pipeline-health.js";

const crm = loadCrm();
const json = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const readOnly = { readOnlyHint: true, openWorldHint: false };

export const server = new McpServer({ name: "revenue-agents", version: "1.0.0" });

server.registerTool("list_opportunities", {
  title: "List opportunities",
  description: "List open opportunities, optionally filtered by owner and stage range (0 Discovery … 4 Negotiation).",
  inputSchema: {
    owner: z.string().optional().describe("Rep name, e.g. 'Riley Chen'"),
    minStage: z.number().int().min(0).max(4).optional(),
    maxStage: z.number().int().min(0).max(4).optional(),
  },
  annotations: readOnly,
}, async (args) => json(crm.listOpportunities(args).map(({ id, name, owner, stageName, amountArr, closeDate }) =>
  ({ id, name, owner, stage: stageName, amountArr, closeDate }))));

server.registerTool("evaluate_opportunity", {
  title: "Evaluate an opportunity",
  description: "Score one opportunity on six weighted factors and return the keep/close recommendation with every factor and override explained.",
  inputSchema: { opportunityId: z.string().describe("e.g. 'OPP-0007'") },
  annotations: readOnly,
}, async ({ opportunityId }) => {
  const opp = crm.getOpportunity(opportunityId);
  if (!opp) return { isError: true, content: [{ type: "text", text: `No opportunity ${opportunityId}` }] };
  return json(evaluateOpportunity(crm, opp));
});

server.registerTool("rank_deals", {
  title: "Rank deals",
  description: "Evaluate and rank all open deals (or one rep's) from strongest to weakest.",
  inputSchema: { owner: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
  annotations: readOnly,
}, async ({ owner, limit = 10 }) => json(runOppEval(crm, owner ? { owner } : {}).slice(0, limit)
  .map(({ opportunityId, opportunity, owner: o, finalScore, recommendation }) =>
    ({ opportunityId, opportunity, owner: o, finalScore, recommendation }))));

server.registerTool("pipeline_health", {
  title: "Pipeline health",
  description: "Coverage, stage-weighted forecast and prioritised alerts per rep, including strong deals with a forecast-risk flag.",
  inputSchema: { owner: z.string().optional() },
  annotations: readOnly,
}, async ({ owner }) => {
  const health = runPipelineHealth(crm, { evaluations: runOppEval(crm) });
  if (owner) health.reps = health.reps.filter((r) => r.rep === owner);
  return json(health);
});

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  await server.connect(new StdioServerTransport());
}
