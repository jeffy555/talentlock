export function getHealthGrade(score: number): {
  grade: "A" | "B" | "C" | "D" | "F";
  label: string;
  colour: string;
  bg: string;
  border: string;
} {
  if (score >= 90) return { grade: "A", label: "Excellent", colour: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300" };
  if (score >= 75) return { grade: "B", label: "Good", colour: "text-blue-700", bg: "bg-blue-50", border: "border-blue-300" };
  if (score >= 60) return { grade: "C", label: "Acceptable", colour: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300" };
  if (score >= 45) return { grade: "D", label: "Needs Review", colour: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300" };
  return { grade: "F", label: "Weak", colour: "text-red-700", bg: "bg-red-50", border: "border-red-300" };
}

export type DimensionVerdict = "Strong" | "Acceptable" | "Needs attention" | "Weak";

export function verdictColour(verdict: DimensionVerdict): string {
  switch (verdict) {
    case "Strong": return "text-emerald-600";
    case "Acceptable": return "text-blue-600";
    case "Needs attention": return "text-amber-600";
    case "Weak": return "text-red-600";
  }
}

export const DIMENSION_LABELS: Record<string, string> = {
  clarity: "Clarity",
  fairness: "Fairness",
  completeness: "Completeness",
  enforceability: "Enforceability",
  industryFit: "Industry Fit",
};

export const DIMENSION_ORDER = [
  "clarity",
  "fairness",
  "completeness",
  "enforceability",
  "industryFit",
] as const;
