import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCruiseModeActivity,
  useMarkCruiseModeFollowUp,
  getListCruiseModeActivityQueryKey,
  type CruiseModeActivityItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import {
  decisionBadgeClass,
  decisionLabel,
  scoreColour,
} from "@/lib/cruiseModeDisplayUtils";
import { useToast } from "@/hooks/use-toast";

function ActivityEntry({
  item,
  onFollowUp,
  followUpPending,
}: {
  item: CruiseModeActivityItem;
  onFollowUp: (id: string) => void;
  followUpPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { matchReasons, decision, score, jobTitle, proposedMessage, skippedReason, freelancerFollowUpSent } =
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
          <span className="text-sm font-semibold text-slate-800 truncate">{jobTitle}</span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>

        {reasonLine && <p className="text-xs text-muted-foreground">{reasonLine}</p>}

        {proposedMessage && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="text-xs text-violet-600 mt-1 flex items-center gap-1 hover:underline">
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
              View message
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded border-l-4 border-violet-300 bg-violet-50 px-3 py-2 text-sm text-slate-700 italic">
                {proposedMessage}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {decision === "sent" && !freelancerFollowUpSent && (
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
        {freelancerFollowUpSent && (
          <span className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Follow-up sent
          </span>
        )}
      </div>
    </div>
  );
}

export function CruiseModeActivityFeed() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useListCruiseModeActivity(
    { page, pageSize },
    { query: { keepPreviousData: true } as any },
  );

  const followUp = useMarkCruiseModeFollowUp();

  const handleFollowUp = (id: string) => {
    followUp.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCruiseModeActivityQueryKey() });
          toast({ title: "Follow-up marked as sent" });
        },
        onError: () =>
          toast({ title: "Error", description: "Could not mark follow-up.", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-muted-foreground text-center py-8">Could not load activity.</p>;
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No Cruise Mode activity yet. Activate Cruise Mode and new job matches will appear here.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800">Activity</h3>
      </div>
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
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        disabled={isLoading}
      />
    </div>
  );
}
