import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SummarySection {
  title: string;
  content: string;
}

interface EmployerSummaryData {
  sections?: Record<string, SummarySection>;
  attentionFlags?: {
    exists?: boolean;
    items?: Array<{ heading: string; detail: string }>;
  };
  disclaimer?: string;
}

const SECTION_ORDER = [
  "scopeAndDeliverables",
  "paymentTerms",
  "ipAndOwnership",
  "termination",
  "restrictions",
  "keyDates",
] as const;

export default function EmployerAgreementSummaryPanel({
  summary,
}: {
  summary: EmployerSummaryData | null;
}) {
  if (!summary?.sections) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-sm text-muted-foreground text-center">
          Summary is being generated or could not be loaded. You can still review the full document below.
        </CardContent>
      </Card>
    );
  }

  const flags = summary.attentionFlags?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-primary px-5 py-3">
          <span className="text-sm font-semibold text-white">Quick Review Summary</span>
        </div>
        <div className="p-5 space-y-4 bg-card">
          {SECTION_ORDER.map((key) => {
            const section = summary.sections?.[key];
            if (!section) return null;
            return (
              <div key={key}>
                <h4 className="text-sm font-semibold text-foreground mb-1">{section.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
              </div>
            );
          })}
        </div>
      </div>

      {flags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Points to review
          </h4>
          {flags.map((item, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{item.heading}</p>
              <p className="text-sm text-amber-800/90 mt-1">{item.detail}</p>
            </div>
          ))}
        </div>
      )}

      {summary.disclaimer && (
        <p className="text-xs text-muted-foreground italic">{summary.disclaimer}</p>
      )}
    </div>
  );
}
