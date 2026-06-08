import { useCallback, useEffect, useState } from "react";
import {
  usePostAiRateSuggestion,
  type RateSuggestionResponse,
  type PostAiRateSuggestionBodyPaymentType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

interface RateSuggestionWidgetProps {
  freelancerId: string;
  fieldOfWork: string;
  jobRequirementId?: string;
  bookingId?: string;
  paymentType?: PostAiRateSuggestionBodyPaymentType;
  proposedRate?: string;
  onUseSuggestion: (rate: number) => void;
  userPlan: string;
}

type WidgetState = "loading_static" | "static" | "loading_ai" | "ai_loaded" | "quota_reached" | "error";

function parseApiError(error: unknown): { status?: number; code?: string } {
  const err = error as {
    status?: number;
    data?: { code?: string };
    response?: { status?: number; data?: { code?: string } };
  };
  return {
    status: err?.status ?? err?.response?.status,
    code: err?.data?.code ?? err?.response?.data?.code,
  };
}

function rateUnit(paymentType?: PostAiRateSuggestionBodyPaymentType): string {
  if (paymentType === "daily") return "day";
  if (paymentType === "fixed") return "project";
  return "hr";
}

function confidenceBadgeClass(confidence: RateSuggestionResponse["confidence"]): string {
  if (confidence === "high") return "text-xs bg-emerald-100 text-emerald-700 rounded px-1.5";
  if (confidence === "medium") return "text-xs bg-amber-100 text-amber-700 rounded px-1.5";
  return "text-xs bg-slate-100 text-slate-600 rounded px-1.5";
}

export default function RateSuggestionWidget({
  freelancerId,
  fieldOfWork,
  jobRequirementId,
  bookingId,
  paymentType = "hourly",
  proposedRate,
  onUseSuggestion,
  userPlan,
}: RateSuggestionWidgetProps) {
  const mutation = usePostAiRateSuggestion();
  const [widgetState, setWidgetState] = useState<WidgetState>("loading_static");
  const [staticData, setStaticData] = useState<RateSuggestionResponse | null>(null);
  const [aiData, setAiData] = useState<RateSuggestionResponse | null>(null);
  const [showAiRow, setShowAiRow] = useState(false);

  const isStarter = userPlan === "employer_starter" || userPlan === "free";
  const unit = rateUnit(paymentType);

  const buildRequestBody = useCallback(
    (includeAi: boolean) => {
      const rateNum = proposedRate ? parseFloat(proposedRate) : undefined;
      return {
        freelancerId: parseInt(freelancerId, 10),
        ...(jobRequirementId ? { jobRequirementId: parseInt(jobRequirementId, 10) } : {}),
        ...(bookingId ? { bookingId: parseInt(bookingId, 10) } : {}),
        paymentType,
        ...(rateNum != null && !Number.isNaN(rateNum) ? { proposedRate: rateNum } : {}),
        includeAi,
      };
    },
    [freelancerId, jobRequirementId, bookingId, paymentType, proposedRate],
  );

  const fetchStatic = useCallback(() => {
    setWidgetState("loading_static");
    mutation.mutate(
      { data: buildRequestBody(false) },
      {
        onSuccess: (result: RateSuggestionResponse) => {
          setStaticData(result);
          setWidgetState("static");
        },
        onError: () => {
          setWidgetState("error");
        },
      },
    );
  }, [buildRequestBody, mutation]);

  useEffect(() => {
    fetchStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerId, jobRequirementId, bookingId, paymentType]);

  const handleGetAiSuggestion = () => {
    setWidgetState("loading_ai");
    mutation.mutate(
      { data: buildRequestBody(true) },
      {
        onSuccess: (result: RateSuggestionResponse) => {
          setAiData(result);
          setShowAiRow(true);
          setWidgetState("ai_loaded");
        },
        onError: (error: unknown) => {
          const { status, code } = parseApiError(error);
          if (status === 402 && code === "TOKEN_LIMIT") {
            setWidgetState("quota_reached");
            return;
          }
          setWidgetState("error");
        },
      },
    );
  };

  const handleDismissAi = () => {
    setShowAiRow(false);
    setAiData(null);
    setWidgetState("static");
  };

  if (widgetState === "loading_static" && !staticData) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm mt-2">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading rate context…
        </div>
      </div>
    );
  }

  if (widgetState === "error" && !staticData) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm mt-2">
        <p className="text-xs text-muted-foreground">Could not load rate context.</p>
        <Button variant="ghost" size="sm" className="mt-1 h-7 px-2" onClick={fetchStatic}>
          Retry
        </Button>
      </div>
    );
  }

  const data = staticData;
  if (!data) return null;

  const displayAi = showAiRow && aiData?.isAiSuggestion;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm mt-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Rate context for {fieldOfWork}
      </p>

      <div className="space-y-1">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Freelancer&apos;s rate:</span>
          <span>${data.freelancerRate}/{unit}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-600">
          <span>Market median:</span>
          {data.marketMedian != null ? (
            <span>${data.marketMedian}/{unit}</span>
          ) : (
            <span className="text-muted-foreground italic">Not enough data in this field</span>
          )}
        </div>
        <div className="flex justify-between text-sm text-slate-600">
          <span>Your avg paid:</span>
          {data.yourHistoricalAvg != null ? (
            <span>${data.yourHistoricalAvg}/{unit}</span>
          ) : (
            <span className="text-muted-foreground italic">No history yet</span>
          )}
        </div>
      </div>

      {displayAi && aiData && (
        <>
          <div className="border-t border-slate-200 my-3" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-indigo-700">
              ✦ AI suggestion: ${aiData.suggestedRate}/{unit}
            </span>
            <span className={confidenceBadgeClass(aiData.confidence)}>
              {aiData.confidence} confidence
            </span>
          </div>
          {aiData.explanation && (
            <p className="text-xs text-slate-600 italic mt-1">{aiData.explanation}</p>
          )}
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => onUseSuggestion(aiData.suggestedRate)}
            >
              Use ${aiData.suggestedRate}/{unit}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismissAi}>
              Set my own rate
            </Button>
          </div>
        </>
      )}

      {!displayAi && !isStarter && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGetAiSuggestion}
            disabled={widgetState === "loading_ai"}
          >
            {widgetState === "loading_ai" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Analysing rates...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                ✦ Get AI suggestion
              </>
            )}
          </Button>
          {widgetState === "quota_reached" && (
            <p className="text-xs text-amber-700 mt-2">
              ⚡ Token limit reached. Upgrade to get rate suggestions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
