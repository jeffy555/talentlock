import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostAgreementsIdRedline,
  usePatchAgreementsIdAcceptRedline,
  getGetAgreementQueryKey,
  type RedlineSuggestion,
  type Agreement,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function stripQuotes(text: string): string {
  return text.replace(/^[\s"'""'']+|[\s"'""'']+$/g, "");
}

function applySuggestion(content: string, suggestion: RedlineSuggestion): string | null {
  const variants = [
    suggestion.originalText,
    suggestion.originalText.trim(),
    stripQuotes(suggestion.originalText),
  ].filter(Boolean);

  for (const variant of variants) {
    if (content.includes(variant)) {
      return content.replace(variant, suggestion.suggestedText);
    }
  }

  const escaped = suggestion.originalText
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const re = new RegExp(escaped);
  if (re.test(content)) {
    return content.replace(re, suggestion.suggestedText);
  }

  return null;
}

interface ContractRedliningSectionProps {
  agreementId: number;
  agreement: Agreement;
  userPlan: string;
  tokensUsed: number;
  monthlyTokenLimit: number | null;
}

export default function ContractRedliningSection({
  agreementId,
  agreement,
  userPlan,
  tokensUsed,
  monthlyTokenLimit,
}: ContractRedliningSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const redlineMutation = usePostAgreementsIdRedline();
  const acceptMutation = usePatchAgreementsIdAcceptRedline();

  const [suggestions, setSuggestions] = useState<RedlineSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [contentBaseline, setContentBaseline] = useState(agreement.content ?? "");
  const [parseError, setParseError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);

  useEffect(() => {
    setContentBaseline(agreement.content ?? "");
  }, [agreement.content]);

  const estimated = agreement.estimatedRedlineTokens ?? Math.ceil((agreement.content?.length ?? 0) / 4) + 500;
  const tokensLeft = monthlyTokenLimit != null ? monthlyTokenLimit - tokensUsed : null;
  const nearQuota =
    monthlyTokenLimit != null &&
    tokensLeft != null &&
    estimated + tokensUsed > monthlyTokenLimit * 0.8;

  const displaySuggestions = suggestions
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !dismissed.has(i));

  const pendingCount = displaySuggestions.filter(({ i }) => !accepted.has(i)).length;

  const employerSigned = !!agreement.employerSignedAt;
  const freelancerSigned = !!agreement.freelancerSignedAt;
  if (employerSigned || freelancerSigned) return null;

  const isStarter = userPlan === "employer_starter" || userPlan === "free";
  if (isStarter) {
    return (
      <div id="contract-redlining" className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-500">🔒 AI Contract Review — Growth plan feature</p>
        <p className="text-sm text-slate-500 mt-1">Review contracts with AI before signing.</p>
        <Link href="/pricing" className="text-sm font-medium text-slate-700 underline mt-2 inline-block">
          Upgrade to Growth →
        </Link>
      </div>
    );
  }

  const handleRequestRedline = () => {
    setParseError(false);
    redlineMutation.mutate(
      { id: agreementId },
      {
        onSuccess: (result) => {
          setHasLoaded(true);
          if (result.parseError) {
            setParseError(true);
            setSuggestions([]);
            return;
          }
          setSuggestions(result.suggestions ?? []);
        },
        onError: () => {
          setParseError(true);
        },
      },
    );
  };

  const handleAccept = (index: number, suggestion: RedlineSuggestion) => {
    const newContent = applySuggestion(contentBaseline, suggestion);
    if (!newContent) {
      toast({
        title: "Could not apply change",
        description: "Original text was not found in the agreement. Try skipping this suggestion.",
        variant: "destructive",
      });
      return;
    }

    setAcceptingIndex(index);
    acceptMutation.mutate(
      { id: agreementId, data: { newContent } },
      {
        onSuccess: () => {
          setAccepted(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
          });
          setContentBaseline(newContent);
          setAcceptingIndex(null);

          queryClient.setQueryData(
            getGetAgreementQueryKey(agreementId),
            (old: Agreement | undefined) =>
              old
                ? {
                    ...old,
                    content: newContent,
                    status: "redlined",
                    healthScore: null,
                    healthScoreDetail: null,
                    healthScoredAt: null,
                  }
                : old,
          );

          toast({
            title: "Changes updated",
            description: "Agreement updated — both signatures have been reset. Both parties must re-sign.",
            duration: 6000,
          });
        },
        onError: () => {
          setAcceptingIndex(null);
          toast({ title: "Failed to update. Try again.", variant: "destructive" });
        },
      },
    );
  };

  if (parseError && !redlineMutation.isPending) {
    return (
      <div id="contract-redlining" className="rounded-md border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Could not parse AI review response.</p>
        <Button variant="ghost" size="sm" onClick={handleRequestRedline}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!hasLoaded && !redlineMutation.isPending) {
    return (
      <div id="contract-redlining" className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-700">🔍 AI Contract Review</p>
        <p className="text-sm text-slate-500 mt-1">Get AI suggestions before signing.</p>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">
            ~{estimated.toLocaleString()} tokens will be used
            {nearQuota && tokensLeft != null && (
              <span className="text-amber-600 text-sm ml-2">
                ⚠ This may exhaust your remaining quota ({tokensLeft.toLocaleString()} tokens left)
              </span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={handleRequestRedline}>
            <Sparkles className="h-4 w-4 mr-1" />
            Request Redlining ✦
          </Button>
        </div>
      </div>
    );
  }

  if (redlineMutation.isPending) {
    return (
      <div id="contract-redlining" className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <Button variant="outline" size="sm" disabled>
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
          Analysing contract...
        </Button>
      </div>
    );
  }

  if (displaySuggestions.length === 0) {
    return (
      <div id="contract-redlining" className="rounded-md border border-slate-200 bg-slate-50 p-4 text-center py-4">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
        <p className="text-sm text-muted-foreground">✓ All suggestions reviewed.</p>
        <p className="text-sm text-muted-foreground">The agreement is ready for signing.</p>
      </div>
    );
  }

  const total = suggestions.length;

  return (
    <div id="contract-redlining" className="space-y-4">
      <p className="text-sm font-semibold text-slate-700">
        {pendingCount === 0
          ? "AI Contract Review · all suggestions reviewed"
          : `AI Contract Review · ${pendingCount} suggestion${pendingCount !== 1 ? "s" : ""} remaining`}
      </p>
      {displaySuggestions.map(({ s, i }) => (
        <div
          key={i}
          className={`rounded-md border bg-white p-4 shadow-sm ${
            accepted.has(i) ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-medium text-slate-700">
              {s.clauseNumber} · {s.reason.split(".")[0]}
            </p>
            <span className="text-xs text-muted-foreground">
              [{displaySuggestions.findIndex(v => v.i === i) + 1}/{total}]
            </span>
          </div>

          {!accepted.has(i) && (
            <>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Original</p>
              <p className="text-sm text-slate-600 italic mb-3">&ldquo;{s.originalText}&rdquo;</p>

              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Suggested</p>
              <div className="rounded border-l-4 border-violet-400 bg-violet-50 p-3 text-sm text-slate-700 mb-3">
                &ldquo;{s.suggestedText}&rdquo;
              </div>

              <p className="text-xs text-slate-500 mt-2">Reason: {s.reason}</p>
            </>
          )}

          {accepted.has(i) ? (
            <div className="flex justify-end mt-4">
              <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Changes updated
              </span>
            </div>
          ) : (
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissed(prev => {
                  const next = new Set(prev);
                  next.add(i);
                  return next;
                })}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={acceptingIndex === i}
                onClick={() => handleAccept(i, s)}
              >
                {acceptingIndex === i ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Updating...
                  </>
                ) : (
                  "Accept Change ✓"
                )}
              </Button>
            </div>
          )}
        </div>
      ))}

      {pendingCount === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-center py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-sm text-muted-foreground">✓ All suggestions reviewed.</p>
          <p className="text-sm text-muted-foreground">The agreement is ready for signing.</p>
        </div>
      )}
    </div>
  );
}
