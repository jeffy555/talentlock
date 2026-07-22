import { Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/earningsFormat";

interface CommittedSpendCardProps {
  committedAmount: number;
  milestoneCount: number;
  currencyCode?: string;
  isLoading?: boolean;
}

export function CommittedSpendCard({
  committedAmount,
  milestoneCount,
  currencyCode = "USD",
  isLoading,
}: CommittedSpendCardProps) {
  if (isLoading) {
    return <Skeleton className="h-36 w-full rounded-lg" />;
  }

  const hasCommitted = committedAmount > 0 && milestoneCount > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Committed This Month</h3>
        {hasCommitted && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-slate-600"
                aria-label="Committed spend info"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Based on pending milestones due this month from active bookings. Actual spend
              depends on milestone approval.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {hasCommitted ? (
        <>
          <p className="text-2xl font-semibold text-slate-800 mt-4">
            {formatCurrency(committedAmount, currencyCode)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Across {milestoneCount} upcoming milestone{milestoneCount !== 1 ? "s" : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-4">No milestones due this month.</p>
      )}
    </div>
  );
}
