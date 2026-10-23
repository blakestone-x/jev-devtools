import type { AnswerView, Json, Trace } from "./protocol.js";
export function findImage(value: Json): string | undefined {
  if (!value || typeof value !== "object") return;
  if (
    !Array.isArray(value) &&
    typeof value.preview === "string" &&
    /^data:image\/(png|jpeg);base64,/.test(value.preview)
  )
    return value.preview;
  for (const child of Object.values(value)) {
    const result = findImage(child);
    if (result) return result;
  }
}
export function flowAnswer(answer?: AnswerView) {
  if (!answer) return [];
  if (answer.type === "choice")
    return Object.entries(answer.probabilities ?? {}).map(
      ([label, probability]) => ({
        label,
        detail: `${Number((probability * 100).toPrecision(6))}% probability`,
        active: label === answer.choice,
        eyebrow: label === answer.choice ? "RETURNED CHOICE" : "ALTERNATIVE",
      }),
    );
  if (answer.type === "score")
    return [
      {
        label: `Score ${answer.score ?? "unavailable"}`,
        detail: "Returned by Jev",
        active: true,
        eyebrow: "RETURNED SCORE",
      },
    ];
  if (answer.type === "noul" && answer.noul !== undefined)
    return [
      {
        label: "True",
        detail: `${Math.round(answer.noul * 100)}% probability`,
        active: true,
        eyebrow: "P(TRUE)",
      },
      {
        label: "False",
        detail: `${Math.round((1 - answer.noul) * 100)}% probability`,
        active: true,
        eyebrow: "P(FALSE)",
      },
    ];
  if (answer.type === "box")
    return [
      {
        label: "Region coordinates",
        detail: "Your application decides how to use this region.",
        active: true,
        eyebrow: "RETURNED BOX",
      },
    ];
  return [];
}
export function stateText(trace: Trace): string {
  const state = trace.request.state;
  if (typeof state === "string") return state;
  if (state && typeof state === "object" && !Array.isArray(state)) {
    for (const key of ["message", "text", "description"])
      if (typeof state[key] === "string") return state[key] as string;
  }
  return JSON.stringify(state, null, 2) ?? "";
}
