// Explicit response fixtures, not inference from the editable message.
export const sampleProfiles = {
  billing: {
    label: "Blocked payment",
    message:
      "I was charged twice and checkout is blocked. I need a human to help me today.",
    probabilities: { billing: 0.76, delivery: 0.14, other: 0.1 },
    severity: 1.65,
    severityProbabilities: { 0: 0.05, 1: 0.25, 2: 0.7 },
    human: 0.86,
  },
  delivery: {
    label: "Delayed delivery",
    message:
      "My parcel is a day late. The tracking link still works. Can someone check on it?",
    probabilities: { billing: 0.06, delivery: 0.89, other: 0.05 },
    severity: 0.9,
    severityProbabilities: { 0: 0.2, 1: 0.7, 2: 0.1 },
    human: 0.78,
  },
  other: {
    label: "Quick question",
    message:
      "Where can I change the color of my profile? A help article would be great.",
    probabilities: { billing: 0.04, delivery: 0.03, other: 0.93 },
    severity: 0.15,
    severityProbabilities: { 0: 0.86, 1: 0.13, 2: 0.01 },
    human: 0.08,
  },
} as const;
export type SampleProfile = keyof typeof sampleProfiles;
