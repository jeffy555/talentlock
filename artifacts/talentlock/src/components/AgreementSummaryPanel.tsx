import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostAgreementsIdSummarise,
  getGetAgreementQueryKey,
  type Agreement,
  type AgreementSummaryResult,
  type AgreementSummarySections,
  type AgreementSummaryAttentionFlags,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  AGREEMENT_SUMMARY_DISCLAIMER,
  SECTION_ICONS,
  SECTION_ORDER,
} from "@/lib/agreementSummaryUtils";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";

interface AgreementSummaryPanelProps {
  agreementId: number;
  cachedSummary: Record<string, unknown> | null;
  cachedAt: string | null;
}

type PanelState = "idle" | "loading" | "loaded" | "parse_error" | "error";

function isStoredSummary(
  value: unknown,
): value is { sections: AgreementSummarySections; attentionFlags: AgreementSummaryAttentionFlags } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return !!v.sections && !!v.attentionFlags;
}

function PanelHeader({
  cached,
  onRegenerate,
  showRegenerate,
}: {
  cached: boolean;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
}) {
  return (
    <div className="bg-violet-600 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-200" />
        <span className="text-sm font-semibold text-white">AI Agreement Summary</span>
      </div>
      <div className="flex items-center gap-2">
        {cached && (
          <span className="text-xs text-violet-300 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Cached
          </span>
        )}
        {showRegenerate && onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            className="text-violet-300 hover:text-white hover:bg-violet-700 h-7 px-2 text-xs"
            onClick={onRegenerate}
          >
            Regenerate
          </Button>
        )}
        {!showRegenerate && (
          <span className="text-xs text-violet-300 bg-violet-700 px-2 py-0.5 rounded">Freelancer</span>
        )}
      </div>
    </div>
  );
}

export default function AgreementSummaryPanel({
  agreementId,
  cachedSummary,
  cachedAt,
}: AgreementSummaryPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [summaryData, setSummaryData] = useState<AgreementSummaryResult | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const queryClient = useQueryClient();
  const mutation = usePostAgreementsIdSummarise();

  const fetchSummary = useCallback(
    (force = false) => {
      setPanelState("loading");
      setHasRequested(true);
      if (force) {
        setSummaryData(null);
        setIsCached(false);
      }

      mutation.mutate(
        { id: agreementId, params: force ? { force: true } : undefined },
        {
          onSuccess: (result) => {
            if ("parseError" in result && result.parseError) {
              setPanelState("parse_error");
              setSummaryData(null);
              return;
            }
            const loaded = result as AgreementSummaryResult;
            setSummaryData(loaded);
            setIsCached(!!loaded.cached);
            setPanelState("loaded");

            queryClient.setQueryData(
              getGetAgreementQueryKey(agreementId),
              (old: Agreement | undefined) =>
                old
                  ? {
                      ...old,
                      freelancerSummary: {
                        sections: loaded.sections,
                        attentionFlags: loaded.attentionFlags,
                      },
                      freelancerSummaryScoredAt:
                        loaded.freelancerSummaryScoredAt ?? new Date().toISOString(),
                      hasSummary: true,
                    }
                  : old,
            );
          },
          onError: (error) => {
            const err = error as { status?: number };
            setPanelState(err?.status === 500 ? "error" : "parse_error");
            setSummaryData(null);
          },
        },
      );
    },
    [agreementId, mutation, queryClient],
  );

  useEffect(() => {
    if (hasRequested) return;
    if (cachedSummary && isStoredSummary(cachedSummary)) {
      setSummaryData({
        parseError: false,
        cached: true,
        truncated: false,
        freelancerSummaryScoredAt: cachedAt ?? undefined,
        sections: cachedSummary.sections,
        attentionFlags: cachedSummary.attentionFlags,
        disclaimer: AGREEMENT_SUMMARY_DISCLAIMER,
      });
      setIsCached(true);
      setPanelState("loaded");
      setHasRequested(true);
    }
  }, [cachedSummary, cachedAt, hasRequested]);

  const containerClass = "rounded-lg border border-violet-200 overflow-hidden";

  if (panelState === "loading") {
    return (
      <div className={containerClass}>
        <PanelHeader cached={false} />
        <div className="p-5 flex items-center gap-3 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          <span className="text-sm text-slate-500">Reading and summarising your agreement...</span>
        </div>
      </div>
    );
  }

  if (panelState === "parse_error" || panelState === "error") {
    const isServerError = panelState === "error";
    return (
      <div className={containerClass}>
        <PanelHeader cached={false} />
        <div className="p-5 bg-white">
          <p className="text-sm font-medium text-slate-800">
            {isServerError
              ? "The AI service is temporarily unavailable."
              : "Could not summarise this agreement."}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {isServerError
              ? "Please try again in a few moments."
              : "The AI returned an unexpected response. Please try again."}
          </p>
          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => fetchSummary(false)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (panelState === "loaded" && summaryData) {
    const { sections, attentionFlags } = summaryData;

    return (
      <div className={containerClass}>
        <PanelHeader
          cached={isCached}
          showRegenerate
          onRegenerate={() => fetchSummary(true)}
        />
        <div className="p-5 bg-white">
          <div className="rounded border-l-4 border-amber-400 bg-amber-50 px-4 py-3 mb-5">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Note: </span>
              {summaryData.disclaimer ?? AGREEMENT_SUMMARY_DISCLAIMER}
            </p>
          </div>

          {SECTION_ORDER.map((key) => (
            <div key={key} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{SECTION_ICONS[key]}</span>
                <h4 className="text-sm font-semibold text-slate-800">{sections[key].title}</h4>
              </div>
              <div className="border-b border-slate-100 mb-2" />
              <p className="text-sm text-slate-700 leading-relaxed">{sections[key].content}</p>
            </div>
          ))}

          {attentionFlags.exists && attentionFlags.items.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 overflow-hidden mt-2">
              <div className="px-4 py-2.5 border-b border-red-200 bg-red-100">
                <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Read before signing ({attentionFlags.items.length} item
                  {attentionFlags.items.length !== 1 ? "s" : ""})
                </p>
              </div>
              {attentionFlags.items.map((flag, i) => (
                <div key={i} className="px-4 py-3 border-b border-red-100 last:border-0">
                  <p className="text-xs font-semibold text-red-700 mb-1">&ldquo;{flag.heading}&rdquo;</p>
                  <p className="text-sm text-red-600">{flag.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 mt-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700">
                No unusual terms found — this appears to be a standard freelance engagement contract.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <PanelHeader cached={false} />
      <div className="p-5 bg-white">
        <p className="text-sm text-slate-600 mb-4">
          Reading every clause of a legal agreement takes time and expertise. Let AI highlight what
          matters most to you as a freelancer before you sign.
        </p>
        <div className="flex justify-end">
          <Button
            onClick={() => fetchSummary(false)}
            variant="outline"
            size="sm"
            className="border-violet-300 text-violet-700 hover:bg-violet-50"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Summarise for me
          </Button>
        </div>
      </div>
    </div>
  );
}
