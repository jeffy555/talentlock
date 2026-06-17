import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostAgreementsIdHealthScore,
  getGetAgreementQueryKey,
  type HealthScoreDimensions,
  type HealthScoreResult,
  type Agreement,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DIMENSION_LABELS,
  DIMENSION_ORDER,
  getHealthGrade,
  verdictColour,
  type DimensionVerdict,
} from "@/lib/contractHealthUtils";
import { CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";

interface ContractHealthScoreCardProps {
  agreementId: number;
  userRole: "employer" | "freelancer";
  userPlan: string;
  initialScore?: number | null;
  initialDetail?: { dimensions?: HealthScoreDimensions; summary?: string } | null;
  onRunRedlining?: () => void;
}

type CardState = "idle" | "loading" | "loaded" | "quota_reached" | "parse_error";

export default function ContractHealthScoreCard({
  agreementId,
  userRole,
  userPlan,
  initialScore,
  initialDetail,
  onRunRedlining,
}: ContractHealthScoreCardProps) {
  const [cardState, setCardState] = useState<CardState>("idle");
  const [scoreData, setScoreData] = useState<HealthScoreResult | null>(null);
  const [hasRequested, setHasRequested] = useState(false);

  const queryClient = useQueryClient();
  const mutation = usePostAgreementsIdHealthScore();

  const fetchScore = useCallback((force = false) => {
    setCardState("loading");
    setHasRequested(true);
    if (force) setScoreData(null);

    mutation.mutate(
      { id: agreementId, params: force ? { force: true } : undefined },
      {
        onSuccess: (result) => {
          if ("parseError" in result && result.parseError) {
            setCardState("parse_error");
            setScoreData(null);
            return;
          }
          const loaded = result as HealthScoreResult;
          setScoreData(loaded);
          setCardState("loaded");
          queryClient.setQueryData(
            getGetAgreementQueryKey(agreementId),
            (old: Agreement | undefined) =>
              old
                ? {
                    ...old,
                    healthScore: loaded.totalScore,
                    healthScoreDetail: {
                      dimensions: loaded.dimensions,
                      summary: loaded.summary,
                    },
                    healthScoredAt: loaded.healthScoredAt ?? new Date().toISOString(),
                  }
                : old,
          );
        },
        onError: (error) => {
          const err = error as { status?: number; data?: { code?: string } };
          if (err?.status === 402 && err?.data?.code === "TOKEN_LIMIT") {
            setCardState("quota_reached");
            return;
          }
          setCardState("parse_error");
        },
      },
    );
  }, [agreementId, mutation, queryClient]);

  useEffect(() => {
    if (hasRequested) return;
    if (initialScore != null && initialDetail?.dimensions) {
      setScoreData({
        parseError: false,
        cached: true,
        totalScore: initialScore,
        dimensions: initialDetail.dimensions,
        summary: initialDetail.summary,
      });
      setCardState("loaded");
      setHasRequested(true);
    }
  }, [initialScore, initialDetail, hasRequested]);

  const description =
    userRole === "employer"
      ? "Get an AI assessment of this contract's overall quality before signing."
      : "Understand how balanced and complete this contract is before you sign.";

  const showRedlineNudge =
    userRole === "employer" &&
    (userPlan === "employer_growth" || userPlan === "employer_enterprise") &&
    cardState === "loaded" &&
    scoreData != null &&
    scoreData.totalScore < 75;

  if (cardState === "quota_reached") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Contract Health Score</h3>
        <p className="text-sm text-slate-700 mt-3">⚡ Token limit reached for this month.</p>
        <p className="text-sm text-slate-500 mt-1">Upgrade your plan to run more AI assessments.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/pricing">Upgrade plan →</Link>
        </Button>
      </div>
    );
  }

  if (cardState === "parse_error") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Contract Health Score</h3>
        <p className="text-sm text-slate-700 mt-3">Could not score this contract.</p>
        <p className="text-sm text-slate-500 mt-1">
          The AI returned an unexpected response. Please try again.
        </p>
        <div className="flex justify-end mt-4">
          <Button variant="outline" size="sm" onClick={() => fetchScore(false)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (cardState === "loading") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-1">Contract Health Score</h3>
        <Button variant="outline" size="sm" disabled className="mt-3">
          <Loader2 className="h-4 w-4 mr-2 animate-spin text-indigo-500" />
          Analysing contract...
        </Button>
      </div>
    );
  }

  if (cardState === "loaded" && scoreData) {
    const grade = getHealthGrade(scoreData.totalScore);
    const dimensions = scoreData.dimensions;

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-slate-800">Contract Health Score</h3>
          <div className="flex items-center gap-2 shrink-0">
            {scoreData.cached && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Cached result
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => fetchScore(true)}>
              Rescore
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`flex items-center justify-center w-14 h-14 rounded-lg text-3xl font-bold border-2 ${grade.colour} ${grade.bg} ${grade.border}`}
          >
            {grade.grade}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${grade.colour}`}>{scoreData.totalScore}</span>
              <span className="text-slate-400 text-sm">/ 100</span>
              <span className={`text-sm font-medium ${grade.colour}`}>· {grade.label}</span>
            </div>
          </div>
        </div>

        {scoreData.summary && (
          <p className="text-sm text-slate-600 italic mt-3 leading-relaxed">
            &ldquo;{scoreData.summary}&rdquo;
          </p>
        )}

        {dimensions && (
          <div className="mt-5">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Dimensions</h4>
            <div className="space-y-1">
              {DIMENSION_ORDER.map((key) => {
                const dim = dimensions[key];
                if (!dim) return null;
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[120px_1fr_50px_100px] gap-3 items-center py-1.5"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm text-slate-600 underline decoration-dotted cursor-help">
                          {DIMENSION_LABELS[key]}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px] text-xs">
                        {dim.explanation ?? ""}
                      </TooltipContent>
                    </Tooltip>
                    <div className="bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 rounded-full h-2 transition-all duration-700"
                        style={{ width: `${(dim.score / 20) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-700 text-right">
                      {dim.score}/20
                    </span>
                    <span className={`text-xs font-medium ${verdictColour(dim.verdict as DimensionVerdict)}`}>
                      {dim.verdict}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showRedlineNudge && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mt-4">
            <p className="text-sm text-amber-800">
              ⚠ This contract scored below 75. Consider running AI redlining to improve specific
              clauses before signing.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
              onClick={onRunRedlining}
            >
              Run Redlining
              <Sparkles className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
          <Info className="h-3 w-3" />
          AI-generated assessment — not legal advice
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-1">Contract Health Score</h3>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      <Button variant="outline" size="sm" onClick={() => fetchScore(false)}>
        <Sparkles className="h-4 w-4 mr-1 text-indigo-500" />
        Score this contract
      </Button>
    </div>
  );
}

export function GradeBadge({ score }: { score: number }) {
  const { grade, colour, bg, border } = getHealthGrade(score);
  return (
    <span
      title={`Health score: ${score}/100`}
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold border shrink-0 ${colour} ${bg} ${border}`}
    >
      {grade}
    </span>
  );
}
