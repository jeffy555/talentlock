import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  usePostAiMatchExplanation,
  useGetTokenUsageMe,
  type MatchExplanation,
  type MatchExplanationRateFitAssessment,
  type MatchExplanationAvailabilityFitAssessment,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface MatchExplanationCardProps {
  freelancerId: string;
  jobRequirementId?: string;
  conversationId: string;
}

type CardState = "loading" | "loaded" | "quota_reached" | "error" | "parse_error";

const RATE_BADGE: Record<
  Exclude<MatchExplanationRateFitAssessment, "unknown">,
  { label: string; className: string }
> = {
  within_budget: { label: "Within Budget ✓", className: "bg-emerald-100 text-emerald-700" },
  above_budget: { label: "Above Budget", className: "bg-red-100 text-red-700" },
  below_budget: { label: "Below Budget", className: "bg-amber-100 text-amber-700" },
};

const AVAIL_BADGE: Record<MatchExplanationAvailabilityFitAssessment, { label: string; className: string }> = {
  available: { label: "Available ✓", className: "bg-emerald-100 text-emerald-700" },
  unavailable: { label: "Unavailable", className: "bg-red-100 text-red-700" },
  unknown: { label: "Availability unknown", className: "bg-slate-100 text-slate-500" },
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return format(new Date(value), "MMM d");
  } catch {
    return value;
  }
}

function RateFitBadge({ assessment }: { assessment: MatchExplanationRateFitAssessment }) {
  if (assessment === "unknown") return null;
  const config = RATE_BADGE[assessment];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function AvailabilityBadge({ assessment }: { assessment: MatchExplanationAvailabilityFitAssessment }) {
  const config = AVAIL_BADGE[assessment];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export default function MatchExplanationCard({
  freelancerId,
  jobRequirementId,
  conversationId,
}: MatchExplanationCardProps) {
  const [cardState, setCardState] = useState<CardState>("loading");
  const [data, setData] = useState<MatchExplanation | null>(null);

  const { data: tokenUsage } = useGetTokenUsageMe();
  const mutation = usePostAiMatchExplanation();

  const resetLabel = tokenUsage?.resetDate
    ? new Date(tokenUsage.resetDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "next month";

  const fetchExplanation = () => {
    setCardState("loading");
    setData(null);
    mutation.mutate(
      {
        data: {
          freelancerId: parseInt(freelancerId, 10),
          jobRequirementId: jobRequirementId ? parseInt(jobRequirementId, 10) : undefined,
          conversationId,
        },
      },
      {
        onSuccess: (result) => {
          if (result.parseError) {
            setCardState("parse_error");
            return;
          }
          setData(result);
          setCardState("loaded");
        },
        onError: (error) => {
          const err = error as { status?: number; data?: { code?: string } };
          if (err?.status === 402 && err?.data?.code === "TOKEN_LIMIT") {
            setCardState("quota_reached");
            return;
          }
          setCardState("error");
        },
      },
    );
  };

  useEffect(() => {
    fetchExplanation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerId, jobRequirementId, conversationId]);

  if (cardState === "loading") {
    return (
      <div className="rounded-md border border-violet-200 bg-violet-50 p-4 border-l-4 border-l-violet-300 mt-2">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (cardState === "quota_reached") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 border-l-4 border-l-amber-400 mt-2">
        <p className="text-sm font-medium text-amber-800">⚡ Monthly AI token limit reached</p>
        <p className="text-xs text-amber-700 mt-1">
          Match explanations are paused until {resetLabel}.{" "}
          <Link href="/pricing" className="text-xs font-medium text-amber-800 underline">
            Upgrade Plan →
          </Link>
        </p>
      </div>
    );
  }

  if (cardState === "error" || cardState === "parse_error") {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {cardState === "parse_error"
            ? "Match explanation returned unexpected format."
            : "Could not load match explanation."}
        </p>
        <Button variant="ghost" size="sm" onClick={fetchExplanation} disabled={mutation.isPending}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data?.skillsAlignment || !data.availabilityFit || !data.overallSummary) {
    return null;
  }

  const { skillsAlignment, rateFit, availabilityFit, overallSummary } = data;
  const showRateFit = rateFit != null && rateFit.assessment !== "unknown";

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 p-4 border-l-4 border-l-violet-400 mt-2">
      <p className="text-xs font-semibold text-violet-700 mb-3">✦ Why this match</p>

      <div className="mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Skills Alignment</p>
        {skillsAlignment.matched.length === 0 && skillsAlignment.gaps.length === 0 ? (
          <p className="text-xs text-slate-400">No specific skills data available.</p>
        ) : (
          <div className="flex flex-wrap">
            {skillsAlignment.matched.map(skill => (
              <span
                key={skill}
                className="bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-xs mr-1 mb-1 inline-flex items-center gap-1"
              >
                ✅ {skill}
              </span>
            ))}
            {skillsAlignment.gaps.map(skill => (
              <span
                key={skill}
                className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs mr-1 mb-1 inline-flex items-center gap-1"
              >
                ⚠ {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {showRateFit && rateFit && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Rate Fit</p>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {rateFit.freelancerRate != null && (
              <span className="text-slate-700">${rateFit.freelancerRate}/hr</span>
            )}
            {rateFit.budgetMin != null && rateFit.budgetMax != null && (
              <span className="text-slate-400">
                · Budget: ${rateFit.budgetMin}
                {rateFit.budgetMin !== rateFit.budgetMax ? ` – $${rateFit.budgetMax}` : ""}/hr
              </span>
            )}
            <RateFitBadge assessment={rateFit.assessment} />
          </div>
        </div>
      )}

      <div className="mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Availability</p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {availabilityFit.freelancerAvailableFrom && (
            <span className="text-slate-700">
              Available from {formatDate(availabilityFit.freelancerAvailableFrom)}
            </span>
          )}
          {availabilityFit.requiredStartDate && (
            <span className="text-slate-400">
              · Required: {formatDate(availabilityFit.requiredStartDate)}
            </span>
          )}
          <AvailabilityBadge assessment={availabilityFit.assessment} />
        </div>
      </div>

      <p className="text-sm text-slate-700 italic mt-3 pt-3 border-t border-violet-200">
        &ldquo;{overallSummary}&rdquo;
      </p>
    </div>
  );
}
