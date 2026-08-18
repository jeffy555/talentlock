import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTalentSearchActivity,
  useMarkTalentSearchFollowUp,
  getListTalentSearchActivityQueryKey,
  type TalentSearchActivityItem,
} from "@workspace/api-client-react";
import { useDebounce } from "use-debounce";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { EngagementListToolbar } from "@/components/lists/EngagementListToolbar";
import { CheckCircle2, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import {
  decisionBadgeClass,
  decisionLabel,
  scoreColour,
} from "@/lib/talentSearchDisplayUtils";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

const DECISION_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "dry_run_would_send", label: "Dry run" },
  { value: "skipped", label: "Skipped" },
  { value: "prefilter_rejected", label: "Pre-filter" },
  { value: "duplicate_skipped", label: "Duplicate" },
  { value: "dm_failed", label: "Failed" },
];

function ActivityEntry({
  item,
  onFollowUp,
  followUpPending,
}: {
  item: TalentSearchActivityItem;
  onFollowUp: (id: string) => void;
  followUpPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { matchReasons, decision, score, freelancerName, proposedMessage, skippedReason, employerFollowUpSent, conversationId } =
    item;

  const reasonLine =
    decision === "dry_run_would_send"
      ? "Would have sent (dry run active)"
      : decision === "sent" && matchReasons.matched.length > 0
        ? `Matched: ${matchReasons.matched.join(", ")}`
        : skippedReason
          ? `Skipped: ${skippedReason}`
          : matchReasons.blockers.length > 0
            ? matchReasons.blockers.join(", ")
            : matchReasons.concerns.length > 0
              ? matchReasons.concerns.join(", ")
              : null;

  return (
    <div className="flex gap-4 py-4 border-b border-slate-100">
      <div
        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2 ${scoreColour(score)}`}
      >
        {score}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className={`text-xs font-medium rounded border px-2 py-0.5 ${decisionBadgeClass(decision)}`}
          >
            {decisionLabel(decision)}
          </span>
          <span className="text-sm font-semibold text-slate-800 truncate">{freelancerName}</span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>

        {reasonLine && <p className="text-xs text-muted-foreground">{reasonLine}</p>}

        {proposedMessage && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="text-xs text-teal-600 mt-1 flex items-center gap-1 hover:underline">
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
              View message
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded border-l-4 border-teal-300 bg-teal-50 px-3 py-2 text-sm text-slate-700 italic">
                {proposedMessage}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {decision === "sent" && conversationId != null && (
          <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" asChild>
            <Link href={`/messages/${conversationId}`}>
              <MessageSquare className="h-3 w-3 mr-1" />
              Open conversation
            </Link>
          </Button>
        )}

        {decision === "sent" && !employerFollowUpSent && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs"
            disabled={followUpPending}
            onClick={() => onFollowUp(item.id)}
          >
            {followUpPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Send follow-up message
          </Button>
        )}
        {employerFollowUpSent && (
          <span className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Follow-up sent
          </span>
        )}
      </div>
    </div>
  );
}

export function TalentSearchActivityFeed() {
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState("all");
  const [page, setPage] = useState(1);
  const [debouncedSearch] = useDebounce(search, 400);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const apiQ = debouncedSearch.trim().length >= 2 ? debouncedSearch.trim() : undefined;
  const apiDecision = decision === "all" ? undefined : decision;
  const hasFilters = search.trim().length > 0 || (decision !== "" && decision !== "all");

  const { data, isLoading, isError } = useListTalentSearchActivity(
    { page, pageSize: PAGE_SIZE, q: apiQ, decision: apiDecision as any },
    { query: { keepPreviousData: true } as any },
  );

  const followUp = useMarkTalentSearchFollowUp();

  const handleFollowUp = (id: string) => {
    followUp.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTalentSearchActivityQueryKey() });
          toast({ title: "Follow-up marked as sent" });
        },
        onError: () =>
          toast({ title: "Error", description: "Could not mark follow-up.", variant: "destructive" }),
      },
    );
  };

  const onSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const onDecisionChange = (value: string) => {
    setDecision(value);
    setPage(1);
  };
  const onClear = () => {
    setSearch("");
    setDecision("all");
    setPage(1);
  };

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Activity</h3>
      </div>

      <EngagementListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by freelancer name…"
        status={decision}
        statusOptions={DECISION_OPTIONS}
        onStatusChange={onDecisionChange}
        onClear={onClear}
        resultSummary={isLoading ? undefined : `${total} matching`}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground text-center py-8">Could not load activity.</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? "No activity matches your search or filters."
              : "No TalentSearch activity yet. Activate TalentSearch and matching freelancers will appear here."}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>
          )}
        </div>
      ) : (
        <>
          {items.map((item) => (
            <ActivityEntry
              key={item.id}
              item={item}
              onFollowUp={handleFollowUp}
              followUpPending={followUp.isPending}
            />
          ))}
          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPageChange={(p) => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={isLoading}
            total={total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
