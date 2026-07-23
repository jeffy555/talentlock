export const EMPLOYER_AGREEMENT_SUMMARY_DISCLAIMER =
  "This is an AI-generated summary for your convenience. It is not legal advice. Always review the full agreement before finalizing.";

export function buildEmployerSummaryPrompt(content: string, truncated: boolean): string {
  const trimmedContent = truncated ? content.slice(0, 12000) : content;

  return `You are helping an employer review a contract they uploaded for a freelancer engagement.
Summarise the key points in plain, clear English for quick review — no jargon.

Return ONLY a JSON object — no preamble, no markdown:
{
  "sections": {
    "scopeAndDeliverables": {
      "title": "Scope and deliverables",
      "content": "<2-4 sentences>"
    },
    "paymentTerms": {
      "title": "Payment terms",
      "content": "<2-4 sentences>"
    },
    "ipAndOwnership": {
      "title": "IP and ownership",
      "content": "<2-4 sentences>"
    },
    "termination": {
      "title": "Termination",
      "content": "<2-4 sentences>"
    },
    "restrictions": {
      "title": "Restrictions and obligations",
      "content": "<2-4 sentences>"
    },
    "keyDates": {
      "title": "Key dates",
      "content": "<2-4 sentences or 'No specific dates mentioned.'>"
    }
  },
  "attentionFlags": {
    "exists": <true|false>,
    "items": [
      {
        "heading": "<short label>",
        "detail": "<1-2 sentences why employer should review this>"
      }
    ]
  }
}

Rules:
- Frame from the employer's perspective.
- Do NOT invent content not in the contract.
- attentionFlags.items: max 3; empty array if none.
- If attentionFlags.items is empty, set attentionFlags.exists to false.
${truncated ? "\nNote: Contract truncated to 12,000 characters." : ""}

Contract:
---
${trimmedContent}
---`;
}

export function validateEmployerSummaryResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!p.sections || typeof p.sections !== "object") return false;
  const s = p.sections as Record<string, unknown>;
  const required = [
    "scopeAndDeliverables",
    "paymentTerms",
    "ipAndOwnership",
    "termination",
    "restrictions",
    "keyDates",
  ];
  for (const key of required) {
    const section = s[key] as Record<string, unknown>;
    if (!section || typeof section.title !== "string" || typeof section.content !== "string") return false;
  }
  if (!p.attentionFlags || typeof p.attentionFlags !== "object") return false;
  const af = p.attentionFlags as Record<string, unknown>;
  if (typeof af.exists !== "boolean" || !Array.isArray(af.items)) return false;
  return true;
}
