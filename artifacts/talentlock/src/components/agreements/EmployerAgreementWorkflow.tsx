import { useState } from "react";
import {
  usePatchAgreementsIdAmendments,
  usePostAgreementsIdEnrich,
  usePostAgreementsIdFinalize,
  type Agreement,
  type HealthScoreDimensions,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, PenLine, Sparkles } from "lucide-react";
import EmployerAgreementSummaryPanel from "./EmployerAgreementSummaryPanel";
import ContractHealthScoreCard from "@/components/ContractHealthScoreCard";

const STEPS = [
  { id: "summary", label: "Review Summary" },
  { id: "amendments", label: "Add Points" },
  { id: "enrich", label: "Enrich" },
  { id: "review", label: "Final Review" },
  { id: "sign", label: "Sign" },
] as const;

function stepIndex(stage: string | null | undefined, employerSigned: boolean): number {
  if (employerSigned) return 4;
  if (stage === "finalized") return 4;
  if (stage === "enriched") return 3;
  if (stage === "summary_ready") return 0;
  return 0;
}

export interface EmployerAgreementWorkflowProps {
  agreement: Agreement & {
    source?: string;
    uploadStage?: string | null;
    amendments?: Array<{ id: string; text: string; addedAt: string }>;
    employerSummary?: Record<string, unknown> | null;
    employerSignedAt?: string | null;
    healthScore?: number | null;
    healthScoreDetail?: { dimensions?: HealthScoreDimensions; summary?: string } | null;
  };
  userPlan: string;
  onRefetch: () => void;
  onOpenSign: () => void;
}

export default function EmployerAgreementWorkflow({
  agreement,
  userPlan,
  onRefetch,
  onOpenSign,
}: EmployerAgreementWorkflowProps) {
  const { toast } = useToast();
  const patchAmendments = usePatchAgreementsIdAmendments();
  const enrichMutation = usePostAgreementsIdEnrich();
  const finalizeMutation = usePostAgreementsIdFinalize();

  const [draftAmendments, setDraftAmendments] = useState<string[]>(
    () => (agreement.amendments ?? []).map((a) => a.text),
  );
  const [newPoint, setNewPoint] = useState("");

  const currentStep = stepIndex(agreement.uploadStage, !!agreement.employerSignedAt);
  const employerSigned = !!agreement.employerSignedAt;

  const handleSaveAmendments = async () => {
    try {
      await patchAmendments.mutateAsync({
        id: agreement.id,
        data: { amendments: draftAmendments },
      });
      toast({ title: "Amendments saved" });
      onRefetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleAddPoint = () => {
    const trimmed = newPoint.trim();
    if (trimmed.length < 20) {
      toast({ title: "Each point must be at least 20 characters", variant: "destructive" });
      return;
    }
    if (draftAmendments.length >= 20) {
      toast({ title: "Maximum 20 amendment points", variant: "destructive" });
      return;
    }
    setDraftAmendments((prev) => [...prev, trimmed]);
    setNewPoint("");
  };

  const handleEnrich = async () => {
    try {
      await enrichMutation.mutateAsync({ id: agreement.id });
      toast({ title: "Agreement updated", description: "Dates and compensation have been added." });
      onRefetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Enrichment failed";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleFinalize = async () => {
    try {
      await finalizeMutation.mutateAsync({ id: agreement.id });
      toast({ title: "Agreement finalized", description: "AI review complete. You may now sign." });
      onRefetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Finalize failed";
      toast({ title: msg, variant: "destructive" });
    }
  };

  return (
    <Card className="border-gold/30 bg-gold/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          Uploaded Agreement Workflow
        </CardTitle>
        <CardDescription>
          Review your document, add any points, apply booking details, then sign.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((step, idx) => (
            <div
              key={step.id}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                idx < currentStep
                  ? "bg-green-50 text-green-700 border-green-200"
                  : idx === currentStep
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {idx < currentStep && <CheckCircle2 className="h-3 w-3 inline mr-1" />}
              {idx + 1}. {step.label}
            </div>
          ))}
        </div>

        {currentStep <= 1 && (
          <EmployerAgreementSummaryPanel
            summary={(agreement.employerSummary as Record<string, unknown> | null) ?? null}
          />
        )}

        {currentStep <= 2 && !employerSigned && agreement.uploadStage !== "finalized" && (
          <div className="space-y-3 rounded-xl border border-border p-4 bg-card">
            <Label>Amendment points (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Add any additional terms or changes you want AI to incorporate before applying booking dates and rate.
            </p>
            <div className="flex gap-2">
              <Textarea
                value={newPoint}
                onChange={(e) => setNewPoint(e.target.value)}
                placeholder="e.g. Include a 14-day confidentiality period after engagement ends…"
                rows={2}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleAddPoint} disabled={!newPoint.trim()}>
                Add
              </Button>
            </div>
            {draftAmendments.length > 0 && (
              <ul className="space-y-2">
                {draftAmendments.map((text, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-2 text-sm border rounded-lg p-2">
                    <span>{text}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7"
                      onClick={() => setDraftAmendments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              onClick={handleSaveAmendments}
              disabled={patchAmendments.isPending}
              variant="secondary"
            >
              {patchAmendments.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save amendments
            </Button>
          </div>
        )}

        {agreement.uploadStage === "summary_ready" && !employerSigned && (
          <div className="rounded-xl border border-border p-4 bg-card space-y-3">
            <p className="text-sm text-muted-foreground">
              AI will merge your amendments and add the agreed engagement dates and freelancer compensation from this booking.
            </p>
            <Button onClick={handleEnrich} disabled={enrichMutation.isPending}>
              {enrichMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply dates &amp; compensation
            </Button>
          </div>
        )}

        {agreement.uploadStage === "enriched" && !employerSigned && (
          <div className="rounded-xl border border-border p-4 bg-card space-y-3">
            <p className="text-sm text-muted-foreground">
              Run a thorough AI contract review before signing.
            </p>
            <Button onClick={handleFinalize} disabled={finalizeMutation.isPending}>
              {finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Finalize agreement
            </Button>
          </div>
        )}

        {(agreement.uploadStage === "finalized" || agreement.healthScore != null) && (
          <ContractHealthScoreCard
            agreementId={agreement.id}
            userRole="employer"
            userPlan={userPlan}
            initialScore={agreement.healthScore}
            initialDetail={agreement.healthScoreDetail ?? undefined}
          />
        )}

        {agreement.uploadStage === "finalized" && !employerSigned && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">Ready for your signature</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your agreement has been reviewed. Sign to send it to the freelancer.
              </p>
            </div>
            <Button size="lg" onClick={onOpenSign} className="animate-pulse [animation-duration:3s]">
              <PenLine className="h-5 w-5 mr-2" />
              Sign Document
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
