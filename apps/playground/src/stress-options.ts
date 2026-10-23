export type StressOptions = {
  choices: 3 | 6 | 7 | 150;
  distribution: "peaked" | "tied" | "zeros";
  longLabels: boolean;
  largeContext: boolean;
  returnedLast: boolean;
};
export const defaultStress: StressOptions = {
  choices: 150,
  distribution: "peaked",
  longLabels: false,
  largeContext: false,
  returnedLast: false,
};
export function validStress(value: unknown): value is StressOptions {
  if (!value || typeof value !== "object") return false;
  const v = value as StressOptions;
  return (
    [3, 6, 7, 150].includes(v.choices) &&
    ["peaked", "tied", "zeros"].includes(v.distribution) &&
    [v.longLabels, v.largeContext, v.returnedLast].every(
      (x) => typeof x === "boolean",
    )
  );
}
