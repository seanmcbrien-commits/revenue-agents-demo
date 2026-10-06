import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../src/mcp-server.js", import.meta.url));

test("MCP server lists its tools and answers calls over stdio", async () => {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath] }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(),
      ["evaluate_opportunity", "list_opportunities", "pipeline_health", "rank_deals"]);

    const ranked = JSON.parse((await client.callTool({ name: "rank_deals", arguments: { limit: 3 } })).content[0].text);
    assert.equal(ranked.length, 3);
    assert.ok(ranked[0].finalScore >= ranked[2].finalScore);

    const one = JSON.parse((await client.callTool({ name: "evaluate_opportunity",
      arguments: { opportunityId: ranked[0].opportunityId } })).content[0].text);
    assert.equal(one.breakdown.length, 6);

    const missing = await client.callTool({ name: "evaluate_opportunity", arguments: { opportunityId: "OPP-9999" } });
    assert.equal(missing.isError, true);
  } finally {
    await client.close();
  }
});
