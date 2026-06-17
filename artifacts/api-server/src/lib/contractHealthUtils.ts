export function buildHealthScorePrompt(
  agreementContent: string,
  fieldOfWork: string,
  jobTitle: string,
  truncated: boolean,
): string {
  const content = truncated ? agreementContent.slice(0, 8000) : agreementContent;

  return `You are a contract quality analyst for a freelance platform.
Score the following contract on exactly five dimensions, each 0–20 points.

Dimensions:
1. Clarity — Language is unambiguous; no undefined terms; no contradictions.
2. Fairness — Terms are not unreasonably one-sided; balanced obligations.
3. Completeness — All standard sections present: deliverables, payment terms, IP ownership, termination clause, dispute resolution.
4. Enforceability — Terms are specific and actionable; no vague phrases like "reasonable time" without definition.
5. Industry Fit — Terms are appropriate for the field of work: ${fieldOfWork}${jobTitle ? ` (${jobTitle})` : ""}.

Return ONLY a JSON object — no preamble, no markdown:
{
  "totalScore": <integer 0-100>,
  "dimensions": {
    "clarity":        { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "fairness":       { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "completeness":   { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "enforceability": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "industryFit":    { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" }
  },
  "summary": "<2-3 sentence overall assessment>"
}

totalScore must equal the sum of all five dimension scores.
Be honest and critical — do not inflate scores.
This is AI guidance only, not legal advice.
${truncated ? "\nNote: Contract was truncated to 8,000 characters for analysis." : ""}

Contract to evaluate:
---
${content}
---`;
}

export function validateHealthScoreResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.totalScore !== "number") return false;
  if (!p.dimensions || typeof p.dimensions !== "object") return false;
  const dims = p.dimensions as Record<string, unknown>;
  for (const dim of ["clarity", "fairness", "completeness", "enforceability", "industryFit"]) {
    const d = dims[dim] as Record<string, unknown>;
    if (!d || typeof d.score !== "number" || typeof d.verdict !== "string") return false;
  }
  return true;
}
