export const AGREEMENT_SUMMARY_DISCLAIMER =
  "This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.";

export function buildSummaryPrompt(content: string, truncated: boolean): string {
  const trimmedContent = truncated ? content.slice(0, 8000) : content;

  return `You are helping a freelancer understand a contract they have been asked to sign.
Your job is to summarise the key points in plain, clear English — no jargon.
Write as if you are explaining this to a smart friend who is not a lawyer.

Return ONLY a JSON object — no preamble, no markdown, no explanation outside the JSON:
{
  "sections": {
    "whatYouDo": {
      "title": "What you are being hired to do",
      "content": "<2-4 sentences describing the deliverables and scope of work in plain language>"
    },
    "howYouGetPaid": {
      "title": "How and when you get paid",
      "content": "<2-4 sentences covering amount, payment timing, milestones, invoicing>"
    },
    "whoOwnsTheWork": {
      "title": "Who owns the work",
      "content": "<2-4 sentences on IP ownership, work-for-hire, what you keep vs what you assign>"
    },
    "howItCanEnd": {
      "title": "How this contract can end",
      "content": "<2-4 sentences on termination clauses, notice periods, kill fee if any>"
    },
    "restrictions": {
      "title": "Important restrictions on you",
      "content": "<2-4 sentences on non-compete, non-solicitation, confidentiality, exclusivity — or 'Not mentioned in this contract.'>"
    },
    "keyDates": {
      "title": "Key dates and deadlines",
      "content": "<2-4 sentences on start date, end date, milestone dates, notice periods — or 'No specific dates mentioned.'>"
    }
  },
  "attentionFlags": {
    "exists": <true|false>,
    "items": [
      {
        "heading": "<quote up to 8 words from the contract that the freelancer should find>",
        "detail": "<1-2 sentences explaining why this clause deserves attention before signing>"
      }
    ]
  }
}

Rules:
- If a section topic is NOT present in the contract, write exactly: "Not mentioned in this contract."
- Do NOT invent content that is not in the contract.
- attentionFlags.items should contain up to 3 items maximum. Leave it as an empty array if no unusual terms exist.
- If attentionFlags.items is empty, set attentionFlags.exists to false.
- Write for a freelancer — frame everything from their perspective.
- This is a reading aid, not legal advice.
${truncated ? "\nNote: The contract was truncated to 8,000 characters. The summary may be incomplete." : ""}

Contract to summarise:
---
${trimmedContent}
---`;
}

export function validateSummaryResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!p.sections || typeof p.sections !== "object") return false;
  const s = p.sections as Record<string, unknown>;
  const requiredSections = ["whatYouDo", "howYouGetPaid", "whoOwnsTheWork", "howItCanEnd", "restrictions", "keyDates"];
  for (const key of requiredSections) {
    const section = s[key] as Record<string, unknown>;
    if (!section || typeof section.title !== "string" || typeof section.content !== "string") return false;
  }
  if (!p.attentionFlags || typeof p.attentionFlags !== "object") return false;
  const af = p.attentionFlags as Record<string, unknown>;
  if (typeof af.exists !== "boolean" || !Array.isArray(af.items)) return false;
  return true;
}
