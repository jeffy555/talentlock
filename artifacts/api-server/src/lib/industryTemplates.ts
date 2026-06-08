export const INDUSTRY_TEMPLATES: Record<string, string[]> = {
  general: [],
  software_development: [
    "Include a clause specifying that all source code, documentation, and related intellectual property created during the engagement transfers to the employer upon receipt of full payment.",
    "Include a clause defining the number of revision rounds included (recommend 2 rounds) and the process for requesting changes.",
    "Include a clause covering the freelancer's obligation to deliver working, tested code and to fix defects discovered within 30 days of delivery.",
  ],
  design_creative: [
    "Include a clause specifying that final design files (in editable source format) are delivered upon full payment, and that usage rights transfer to the employer.",
    "Include a clause defining the number of revision rounds (recommend 3 rounds) and what constitutes a revision vs a new scope item.",
    "Include a clause covering file format requirements and delivery method.",
  ],
  marketing_content: [
    "Include a clause specifying that all content created is original, does not infringe third-party rights, and ownership transfers to the employer upon full payment.",
    "Include a clause covering exclusivity — whether the freelancer may create similar content for direct competitors during and after the engagement.",
    "Include a clause defining approval timelines and what happens if the employer does not respond within the approval window.",
  ],
  consulting_strategy: [
    "Include a strong mutual confidentiality clause covering all proprietary business information shared during the engagement, surviving termination for 2 years.",
    "Include a clause defining deliverables precisely — what documents, presentations, or recommendations constitute completion.",
    "Include a clause specifying that the consultant's advice is professional opinion only and does not constitute legal, financial, or regulatory advice.",
  ],
  data_analytics: [
    "Include a clause specifying that all data provided by the employer remains the employer's property and must be deleted by the freelancer upon project completion.",
    "Include a clause covering data privacy obligations — the freelancer must comply with applicable data protection regulations.",
    "Include a clause specifying ownership of any models, algorithms, or analytical frameworks developed during the engagement.",
  ],
};

export function buildIndustrySection(industry: string): string {
  const clauses = INDUSTRY_TEMPLATES[industry] ?? [];
  if (clauses.length === 0) return "";
  return `\n\nIndustry-specific requirements:\n${clauses.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

export function buildCustomClausesSection(clauses: string[]): string {
  if (clauses.length === 0) return "";
  return `\n\nEmployer-specified custom clauses to incorporate:\n${clauses.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

export function sanitiseClause(clause: string): string {
  return clause.replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 500);
}

export const VALID_INDUSTRIES = [
  "general",
  "software_development",
  "design_creative",
  "marketing_content",
  "consulting_strategy",
  "data_analytics",
] as const;

export type AgreementIndustry = (typeof VALID_INDUSTRIES)[number];
