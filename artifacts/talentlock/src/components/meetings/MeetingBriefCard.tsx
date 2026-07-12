import { useState } from "react";
import { useGenerateMeetingBrief, type MeetingBrief } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface MeetingBriefCardProps {
  brief: MeetingBrief | null | undefined;
  briefGeneratedAt: string | null | undefined;
  meetingId: number;
  userPlan: string;
  /** Refetch the meeting; returns the latest row so polling can detect completion. */
  refetchMeeting: () => Promise<{ data?: { briefContent?: MeetingBrief | null } | null }>;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10; // ~30s

function formatGeneratedAt(value: string): string {
  try {
    return format(new Date(value), "MMM d");
  } catch {
    return "";
  }
}

export function MeetingBriefCard({
  brief,
  briefGeneratedAt,
  meetingId,
  userPlan,
  refetchMeeting,
}: MeetingBriefCardProps) {
  const { toast } = useToast();
  const generateMutation = useGenerateMeetingBrief();
  const [isGenerating, setIsGenerating] = useState(false);
  const isGrowth = userPlan === "employer_growth" || userPlan === "employer_enterprise";

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateMutation.mutateAsync({ id: meetingId });
    } catch {
      setIsGenerating(false);
      toast({ title: "Could not start brief generation", variant: "destructive" });
      return;
    }

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      try {
        const res = await refetchMeeting();
        if (res?.data?.briefContent) {
          setIsGenerating(false);
          clearInterval(poll);
          return;
        }
      } catch {
        /* keep polling until max attempts */
      }
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setIsGenerating(false);
        clearInterval(poll);
        toast({
          title: "Brief generation is taking longer than expected. Please try again.",
          variant: "destructive",
        });
      }
    }, POLL_INTERVAL_MS);
  };

  // State 2 — Generating (checked before "not generated" so regenerate shows the spinner)
  if (isGenerating) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating your meeting brief...
        </div>
        <p className="text-xs text-amber-600 mt-1">This usually takes 10–15 seconds.</p>
      </div>
    );
  }

  // State 1 — Not yet generated
  if (!brief) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <p className="text-sm text-amber-700 mb-4">
          Get AI-generated preparation for this meeting — candidate summary, suggested
          questions, and rate context.
        </p>
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleGenerate}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Generate brief
        </Button>
      </div>
    );
  }

  const { candidateSnapshot, rateContext } = brief;
  const rateUnit = candidateSnapshot.rateType === "hourly" ? "hr" : candidateSnapshot.rateType === "daily" ? "day" : candidateSnapshot.rateType;

  // State 3 — Brief loaded
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <div className="flex items-center gap-3">
          {briefGeneratedAt && (
            <span className="text-xs text-slate-400">
              Generated {formatGeneratedAt(briefGeneratedAt)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerate} className="h-7 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerate
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Section 1 — Candidate Snapshot */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Candidate Snapshot
          </h4>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-slate-800">{candidateSnapshot.name}</p>
                <p className="text-sm text-slate-600">{candidateSnapshot.field}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {candidateSnapshot.experience} · {candidateSnapshot.completenessScore}/100 profile
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-800">
                  ${candidateSnapshot.rate}/{rateUnit}
                </p>
                <p className="text-xs text-slate-500">
                  ★ {candidateSnapshot.averageRating.toFixed(1)} ({candidateSnapshot.reviewCount} reviews)
                </p>
              </div>
            </div>
            {candidateSnapshot.verifiedCredentials.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {candidateSnapshot.verifiedCredentials.map((cred, i) => (
                  <span
                    key={i}
                    className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5"
                  >
                    ✓ {cred}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 2 — Why They Match */}
        {brief.whyTheyMatch.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Why They Match
            </h4>
            <div className="space-y-2">
              {brief.whyTheyMatch.map((reason, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {reason}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 3 — Suggested Questions (plan-gated) */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Suggested Questions
          </h4>
          {isGrowth ? (
            <div className="space-y-2">
              {brief.suggestedQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="flex-shrink-0 text-xs font-semibold bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 mt-0.5">
                    Q{i + 1}
                  </span>
                  {q}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-600 mb-2">
                AI-generated interview questions are available on the Growth plan.
              </p>
              <a href="/pricing" className="text-sm font-medium text-violet-600 hover:underline">
                Upgrade to Growth →
              </a>
            </div>
          )}
        </div>

        {/* Section 4 — Rate Context */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Rate Context
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Their rate</p>
              <p
                className={`text-sm font-semibold ${
                  rateContext.withinBudget ? "text-emerald-700" : "text-red-600"
                }`}
              >
                ${rateContext.proposedRate}/{rateUnit}
                {rateContext.jobBudgetMax != null && (
                  <span className="text-xs font-normal text-slate-500 ml-1">
                    (budget {rateContext.jobBudgetMin != null ? `$${rateContext.jobBudgetMin}–` : "≤ $"}
                    {rateContext.jobBudgetMax})
                  </span>
                )}
              </p>
              {rateContext.withinBudget ? (
                <p className="text-xs text-emerald-600 mt-0.5">✅ Within budget</p>
              ) : (
                <p className="text-xs text-red-500 mt-0.5">⚠ Above budget</p>
              )}
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Market median</p>
              <p className="text-sm font-semibold text-slate-800">
                {rateContext.marketMedian > 0 ? `$${rateContext.marketMedian}/hr` : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {rateContext.marketMedian > 0 ? `${rateContext.platformPercentile}th percentile` : "insufficient data"}
              </p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Your avg paid</p>
              <p className="text-sm font-semibold text-slate-800">
                {rateContext.employerHistoricalAvg > 0 ? `$${rateContext.employerHistoricalAvg}/hr` : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">for similar roles</p>
            </div>
            {rateContext.assessment && (
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500 mb-0.5">Assessment</p>
                <p className="text-xs text-slate-700 leading-relaxed">{rateContext.assessment}</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 5 — Watch Points */}
        {brief.watchPoints.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Watch Points
            </h4>
            <div className="space-y-2">
              {brief.watchPoints.map((point, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
