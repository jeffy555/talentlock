/** Shared 402 plan/quota error handling — TOKEN_LIMIT inline, PLAN_LIMIT redirect. */
export type PlanErrorAction = "inline" | "redirect" | "none";

export function planErrorAction(status: number, code?: string | null): PlanErrorAction {
  if (status !== 402) return "none";
  if (code === "TOKEN_LIMIT") return "inline";
  if (code === "PLAN_LIMIT") return "redirect";
  return "none";
}

export function isTokenLimitError(status: number, code?: string | null): boolean {
  return planErrorAction(status, code) === "inline";
}

export function isPlanLimitError(status: number, code?: string | null): boolean {
  return planErrorAction(status, code) === "redirect";
}
