// Business rules shared by the agents. In a real deployment these come from
// RevOps; here they are fixed so every run of the demo is reproducible.

export const STAGES = [
  { num: 0, name: "Discovery", winProbability: 0.05, expectedDays: 30 },
  { num: 1, name: "Qualification", winProbability: 0.15, expectedDays: 45 },
  { num: 2, name: "Solution Design", winProbability: 0.3, expectedDays: 60 },
  { num: 3, name: "Proposal", winProbability: 0.5, expectedDays: 45 },
  { num: 4, name: "Negotiation", winProbability: 0.75, expectedDays: 30 },
];

export const stageByNum = (num) => STAGES.find((s) => s.num === num);

// Ideal customer profile used by the ICP-fit factor.
export const ICP = {
  targetIndustries: ["Healthcare", "Logistics", "Financial Services", "Retail"],
  employeeRange: [200, 5000],
  // Technographic signals that indicate a strong fit for the product.
  fitSignals: ["contact-center", "iot-fleet", "programmable-voice"],
};

// Quarterly quota per rep (annual recurring revenue, USD).
export const QUARTERLY_QUOTA = 450000;

// Coverage below this multiple of remaining quota raises an alert.
export const MIN_COVERAGE = 3;
