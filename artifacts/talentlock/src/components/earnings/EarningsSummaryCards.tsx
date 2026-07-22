import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/earningsFormat";

interface EarningsSummaryCardsProps {
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  monthOverMonthChange: number | null;
  currencyCode?: string;
  isLoading?: boolean;
}

function SummaryCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-slate-800 mt-1">{value}</p>
      {trend && <div className="mt-2 text-xs">{trend}</div>}
    </div>
  );
}

export function EarningsSummaryCards({
  thisMonth,
  lastMonth,
  allTime,
  monthOverMonthChange,
  currencyCode = "USD",
  isLoading,
}: EarningsSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  let trendNode: ReactNode = null;
  if (monthOverMonthChange === null) {
    trendNode = <span className="text-slate-400">First month of data</span>;
  } else if (monthOverMonthChange > 0) {
    trendNode = (
      <span className="text-emerald-600">
        ▲ {Math.abs(monthOverMonthChange).toFixed(0)}% vs last month
      </span>
    );
  } else if (monthOverMonthChange < 0) {
    trendNode = (
      <span className="text-red-500">
        ▼ {Math.abs(monthOverMonthChange).toFixed(0)}% vs last month
      </span>
    );
  } else {
    trendNode = <span className="text-slate-400">No change vs last month</span>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SummaryCard label="This Month" value={formatCurrency(thisMonth, currencyCode)} trend={trendNode} />
      <SummaryCard label="Last Month" value={formatCurrency(lastMonth, currencyCode)} />
      <SummaryCard label="All Time" value={formatCurrency(allTime, currencyCode)} />
    </div>
  );
}
