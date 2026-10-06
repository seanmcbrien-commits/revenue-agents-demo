// A read-only, in-memory stand-in for a CRM API (Salesforce, HubSpot, ...).
// Agents talk to this interface only, so swapping in a real CRM client means
// re-implementing these few methods and nothing else.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generate } from "../../data/generate.js";
import { daysBetween } from "./dates.js";

const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../data/crm.json");

export function loadCrm(path = DEFAULT_PATH) {
  const data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : generate();
  return createCrm(data);
}

export function createCrm(data) {
  const accountsById = new Map(data.accounts.map((a) => [a.id, a]));
  const activitiesByOpp = new Map();
  for (const act of data.activities) {
    if (!activitiesByOpp.has(act.opportunityId)) activitiesByOpp.set(act.opportunityId, []);
    activitiesByOpp.get(act.opportunityId).push(act);
  }

  return {
    asOf: data.asOf,
    quarter: data.quarter,
    reps: data.reps,
    listOpportunities({ owner, minStage, maxStage } = {}) {
      return data.opportunities.filter((o) =>
        (!owner || o.owner === owner) &&
        (minStage === undefined || o.stage >= minStage) &&
        (maxStage === undefined || o.stage <= maxStage));
    },
    getOpportunity(id) {
      return data.opportunities.find((o) => o.id === id) || null;
    },
    getAccount(id) {
      return accountsById.get(id) || null;
    },
    // Activities on an opportunity within the last `days` days of the snapshot.
    getActivities(oppId, days = 90) {
      return (activitiesByOpp.get(oppId) || []).filter(
        (a) => daysBetween(a.date, data.asOf) <= days);
    },
    daysSinceLastActivity(oppId) {
      const acts = activitiesByOpp.get(oppId) || [];
      if (acts.length === 0) return Infinity;
      return Math.min(...acts.map((a) => daysBetween(a.date, data.asOf)));
    },
  };
}
