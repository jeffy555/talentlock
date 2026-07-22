import { useCallback, useEffect, useRef, useState } from "react";
import {
  useGetBookingDebrief,
  usePostBookingDebrief,
  type EmployerDebrief,
  type FreelancerDebrief,
  type RehireRecommendationVerdict,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Lock,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

interface DebriefCardProps {
  bookingId: number;
  hasDebrief: boolean;
  debriefGeneratedAt: string | null;
  userRole: "employer" | "freelancer";
  employerPlanId?: string;
  refetchBooking: () => Promise<{
    data?: { hasDebrief?: boolean; debriefGeneratedAt?: string | null } | null;
  }>;
}

const VERDICT_STYLES: Record<RehireRecommendationVerdict, string> = {
  strong_rehire: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rehire_with_caveats: "bg-amber-50 text-amber-800 border-amber-200",
  one_off: "bg-slate-100 text-slate-600 border-slate-200",
};

const VERDICT_LABELS: Record<RehireRecommendationVerdict, string> = {
  strong_rehire: "Strong re-hire",
  rehire_with_caveats: "Re-hire with caveats",
  one_off: "One-off engagement",
};

function formatGeneratedAt(value: string): string {
  try {
    return format(new Date(value), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "";
  }
}

function extractApiError(err: unknown): { status?: number; code?: string; message?: string } {
  const e = err as { status?: number; data?: { code?: string; error?: string } };
  return {
    status: e?.status,
    code: e?.data?.code,
    message: e?.data?.error,
  };
}

export function DebriefCard({
  bookingId,
  hasDebrief,
  debriefGeneratedAt,
  userRole,
  employerPlanId,
  refetchBooking,
}: DebriefCardProps) {
  const { toast } = useToast();
  const postDebrief = usePostBookingDebrief();
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [cooldownActive, setCooldownActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isEmployer = userRole === "employer";
  const accent = isEmployer
    ? {
        card: "border-violet-200 bg-violet-50",
        header: "bg-violet-50 border-violet-200",
        title: "text-violet-800",
        body: "text-violet-700",
        btn: "bg-violet-600 hover:bg-violet-700 text-white",
      }
    : {
        card: "border-indigo-200 bg-indigo-50",
        header: "bg-indigo-50 border-indigo-200",
        title: "text-indigo-800",
        body: "text-indigo-700",
        btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
      };

  const isStarterEmployer = isEmployer && employerPlanId === "employer_starter";

  const {
    data: debriefResponse,
    isError: debriefLoadFailed,
    refetch: refetchDebrief,
  } = useGetBookingDebrief(bookingId, {
    query: { enabled: hasDebrief } as never,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await refetchBooking();
        if (res?.data?.hasDebrief) {
          setIsGenerating(false);
          stopPolling();
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setIsGenerating(false);
        stopPolling();
        setLoadError("Debrief generation is taking longer than expected. Try again.");
      }
    }, POLL_INTERVAL_MS);
  }, [refetchBooking, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (hasDebrief) {
      setIsGenerating(false);
      stopPolling();
      setLoadError(null);
    }
  }, [hasDebrief, stopPolling]);

  useEffect(() => {
    if (hasDebrief || isGenerating) return;
    setIsGenerating(true);
    startPolling();
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps -- auto-poll once on mount for background generation

  const handleGenerate = async () => {
    setInlineError(null);
    setLoadError(null);
    setIsGenerating(true);
    try {
      await postDebrief.mutateAsync({ id: bookingId });
      startPolling();
    } catch (err: unknown) {
      const { status, code } = extractApiError(err);
      setIsGenerating(false);
      if (status === 402 && code === "TOKEN_LIMIT") {
        setInlineError("Monthly AI token limit reached. Upgrade or wait until next month.");
        return;
      }
      if (status === 429 && code === "DEBRIEF_REGEN_COOLDOWN") {
        setCooldownActive(true);
        setInlineError("You can regenerate once every 24 hours.");
        return;
      }
      if (status === 403) {
        setLoadError("You don't have access to this debrief.");
        return;
      }
      setLoadError("Something went wrong. Try again.");
    }
  };

  const handleCopyInternalNotes = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  if (loadError && !isGenerating && !hasDebrief) {
    return (
      <div className={`rounded-lg border p-5 ${accent.card}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className={`h-4 w-4 ${accent.title}`} />
          <h3 id="debrief-card-title" className={`text-sm font-semibold ${accent.title}`}>
            Post-Engagement Debrief
          </h3>
        </div>
        <div className="flex items-start gap-2 text-sm text-red-700 mb-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {loadError}
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate}>
          Try again
        </Button>
      </div>
    );
  }

  if (isGenerating && !hasDebrief) {
    return (
      <div className={`rounded-lg border p-5 ${accent.card}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className={`h-4 w-4 ${accent.title} animate-pulse`} />
          <h3 id="debrief-card-title" className={`text-sm font-semibold ${accent.title}`}>
            Post-Engagement Debrief
          </h3>
        </div>
        <div
          className={`flex items-center gap-2 text-sm ${accent.body}`}
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating your debrief…
        </div>
        <p className={`text-xs mt-1 ${accent.body}`}>This usually takes 10–20 seconds.</p>
        {inlineError && (
          <p className="text-xs text-red-600 mt-3">{inlineError}</p>
        )}
      </div>
    );
  }

  if (!hasDebrief) {
    return (
      <div className={`rounded-lg border p-5 ${accent.card}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className={`h-4 w-4 ${accent.title}`} />
          <h3 id="debrief-card-title" className={`text-sm font-semibold ${accent.title}`}>
            Post-Engagement Debrief
          </h3>
        </div>
        <p className={`text-sm mb-4 ${accent.body}`}>
          {isEmployer
            ? "Get a private AI wrap-up of this engagement — outcomes, re-hire signals, and internal notes."
            : "Get a private AI wrap-up of this engagement — what you delivered, strengths, and profile tips."}
        </p>
        {inlineError && (
          <p className="text-xs text-red-600 mb-3">{inlineError}</p>
        )}
        <div className="flex justify-end">
          <Button size="sm" className={accent.btn} onClick={handleGenerate} disabled={postDebrief.isPending}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Generate debrief
          </Button>
        </div>
      </div>
    );
  }

  if (debriefLoadFailed || !debriefResponse?.debrief) {
    return (
      <div className={`rounded-lg border p-5 ${accent.card}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className={`h-4 w-4 ${accent.title}`} />
          <h3 id="debrief-card-title" className={`text-sm font-semibold ${accent.title}`}>
            Post-Engagement Debrief
          </h3>
        </div>
        <div className="flex items-start gap-2 text-sm text-red-700 mb-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Could not load your debrief.
        </div>
        <Button size="sm" variant="outline" onClick={() => refetchDebrief()}>
          Try again
        </Button>
      </div>
    );
  }

  const disclaimer = debriefResponse.disclaimer;
  const generatedLabel = debriefGeneratedAt
    ? formatGeneratedAt(debriefGeneratedAt)
    : debriefResponse.generatedAt
      ? formatGeneratedAt(debriefResponse.generatedAt)
      : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-b ${accent.header}`}>
        <div className="flex items-center gap-2">
          <Sparkles className={`h-4 w-4 ${accent.title}`} />
          <h3 id="debrief-card-title" className={`text-sm font-semibold ${accent.title}`}>
            Post-Engagement Debrief
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {generatedLabel && (
            <span className="text-xs text-slate-500">Generated {generatedLabel}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerate}
            disabled={postDebrief.isPending || cooldownActive}
            aria-label="Regenerate post-engagement debrief"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerate
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <p className="text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-3 py-2">
          {disclaimer}
        </p>

        {inlineError && (
          <p className="text-xs text-red-600">{inlineError}</p>
        )}

        {isEmployer ? (
          <EmployerDebriefSections
            debrief={debriefResponse.debrief as EmployerDebrief}
            isStarterEmployer={isStarterEmployer}
            onCopyInternalNotes={handleCopyInternalNotes}
          />
        ) : (
          <FreelancerDebriefSections debrief={debriefResponse.debrief as FreelancerDebrief} />
        )}
      </div>
    </div>
  );
}

function EmployerDebriefSections({
  debrief,
  isStarterEmployer,
  onCopyInternalNotes,
}: {
  debrief: EmployerDebrief;
  isStarterEmployer: boolean;
  onCopyInternalNotes: (text: string) => void;
}) {
  const snap = debrief.engagementSnapshot;
  const rateUnit =
    snap.rateType === "hourly" ? "hr" : snap.rateType === "daily" ? "day" : snap.rateType;

  return (
    <>
      <section aria-labelledby="debrief-snapshot">
        <h4 id="debrief-snapshot" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Engagement snapshot
        </h4>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
          <p>
            <span className="font-semibold">{snap.freelancerName}</span>
            {" · "}
            {snap.field}
            {" · "}
            ${snap.rate}/{rateUnit}
          </p>
          <p className="text-slate-600">
            {format(new Date(snap.startDate), "MMM d, yyyy")} –{" "}
            {format(new Date(snap.endDate), "MMM d, yyyy")}
            {" · "}
            {snap.milestonesCompleted}/{snap.milestonesTotal} milestones complete
          </p>
        </div>
      </section>

      <section aria-labelledby="debrief-outcome">
        <h4 id="debrief-outcome" className="text-sm font-semibold text-slate-700 mb-2">
          Outcome summary
        </h4>
        <p className="text-sm text-slate-700 leading-relaxed">{debrief.outcomeSummary}</p>
      </section>

      {isStarterEmployer ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-violet-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-800">Unlock full debrief on Growth</p>
              <p className="text-xs text-violet-700 mt-1">
                Get performance signals, re-hire recommendation, and internal notes template.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="border-violet-200 text-violet-800 shrink-0" asChild>
            <Link href="/pricing">View plans →</Link>
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="debrief-signals">
            <h4 id="debrief-signals" className="text-sm font-semibold text-slate-700 mb-2">
              Performance signals
            </h4>
            <ul className="space-y-2">
              {debrief.performanceSignals.map((signal, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {signal}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="debrief-rehire">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h4 id="debrief-rehire" className="text-sm font-semibold text-slate-700">
                Re-hire recommendation
              </h4>
              <span
                role="status"
                className={`text-xs font-medium border rounded-full px-2 py-0.5 ${VERDICT_STYLES[debrief.rehireRecommendation.verdict]}`}
              >
                {VERDICT_LABELS[debrief.rehireRecommendation.verdict]}
              </span>
            </div>
            <ul className="space-y-2">
              {debrief.rehireRecommendation.reasons.map((reason, i) => (
                <li key={i} className="text-sm text-slate-700">
                  • {reason}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="debrief-internal">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 id="debrief-internal" className="text-sm font-semibold text-slate-700">
                Internal notes template
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onCopyInternalNotes(debrief.internalNotesTemplate)}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy to clipboard
              </Button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm whitespace-pre-wrap text-slate-700">
              {debrief.internalNotesTemplate}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function FreelancerDebriefSections({ debrief }: { debrief: FreelancerDebrief }) {
  const snap = debrief.engagementSnapshot;
  const rateUnit =
    snap.rateType === "hourly" ? "hr" : snap.rateType === "daily" ? "day" : snap.rateType;

  return (
    <>
      <section aria-labelledby="debrief-snapshot">
        <h4 id="debrief-snapshot" className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Engagement snapshot
        </h4>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
          <p className="font-semibold">{snap.companyName}</p>
          <p>{snap.jobTitle}</p>
          <p className="text-slate-600">
            {format(new Date(snap.startDate), "MMM d, yyyy")} –{" "}
            {format(new Date(snap.endDate), "MMM d, yyyy")}
            {" · "}
            ${snap.rate}/{rateUnit}
          </p>
        </div>
      </section>

      <section aria-labelledby="debrief-delivered">
        <h4 id="debrief-delivered" className="text-sm font-semibold text-slate-700 mb-2">
          What you delivered
        </h4>
        <p className="text-sm text-slate-700 leading-relaxed">{debrief.whatYouDelivered}</p>
      </section>

      <section aria-labelledby="debrief-strengths">
        <h4 id="debrief-strengths" className="text-sm font-semibold text-slate-700 mb-2">
          Strengths demonstrated
        </h4>
        <ul className="space-y-2">
          {debrief.strengthsDemonstrated.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="debrief-growth">
        <h4 id="debrief-growth" className="text-sm font-semibold text-slate-700 mb-2">
          Growth areas
        </h4>
        <ul className="space-y-2">
          {debrief.growthAreas.map((item, i) => (
            <li key={i} className="text-sm text-amber-700">
              • {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="debrief-profile">
        <h4 id="debrief-profile" className="text-sm font-semibold text-slate-700 mb-2">
          Profile suggestions
        </h4>
        <ol className="space-y-2 list-decimal list-inside">
          {debrief.profileSuggestions.map((item, i) => (
            <li key={i} className="text-sm text-slate-700">
              {item}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
