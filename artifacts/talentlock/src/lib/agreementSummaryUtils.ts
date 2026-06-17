export const SECTION_ORDER = [
  "whatYouDo",
  "howYouGetPaid",
  "whoOwnsTheWork",
  "howItCanEnd",
  "restrictions",
  "keyDates",
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

export const SECTION_ICONS: Record<SectionKey, string> = {
  whatYouDo: "📋",
  howYouGetPaid: "💰",
  whoOwnsTheWork: "©",
  howItCanEnd: "🚪",
  restrictions: "🔒",
  keyDates: "📅",
};

export const AGREEMENT_SUMMARY_DISCLAIMER =
  "This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.";
