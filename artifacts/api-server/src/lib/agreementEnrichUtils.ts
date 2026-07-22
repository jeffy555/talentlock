import type { AgreementAmendment } from "@workspace/db";

export function buildEnrichPrompt(params: {
  originalContent: string;
  amendments: AgreementAmendment[];
  startDate: string;
  endDate: string;
  rateDisplay: string;
  currencyCode: string;
  currencyName: string;
  freelancerName: string;
  employerName: string;
  truncated: boolean;
}): { system: string; user: string } {
  const content = params.truncated ? params.originalContent.slice(0, 16000) : params.originalContent;
  const amendmentLines = params.amendments.length > 0
    ? params.amendments.map((a, i) => `${i + 1}. ${a.text}`).join("\n")
    : "(none)";

  return {
    system: `You are a legal document editor for a freelance platform.
The employer uploaded their own agreement. Your job is to produce an updated version that:
1. Preserves the employer's original structure and legal language as much as possible.
2. Incorporates any employer amendment points listed below.
3. Adds or updates a clear "Engagement Particulars" or equivalent section with the agreed dates and compensation.
4. Does NOT remove material clauses unless an amendment explicitly requires it.

Return ONLY the full updated agreement text — no JSON, no markdown fences, no commentary.`,
    user: `Update this agreement for the following engagement.

Employer: ${params.employerName}
Freelancer: ${params.freelancerName}
Engagement start: ${params.startDate}
Engagement end: ${params.endDate}
Compensation: ${params.rateDisplay}
Currency: ${params.currencyName} (${params.currencyCode})

Employer amendment points to incorporate:
${amendmentLines}

---
ORIGINAL AGREEMENT:
${content}
---`,
  };
}
