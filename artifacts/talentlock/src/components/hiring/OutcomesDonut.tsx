import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { HiringAnalyticsOutcomes } from "@workspace/api-client-react";

const SLICE_COLORS = {
  completed: "#6366f1",
  cancelled: "#ef4444",
  inProgress: "#f59e0b",
  other: "#94a3b8",
};

interface OutcomesDonutProps {
  outcomes: HiringAnalyticsOutcomes | undefined;
  isLoading?: boolean;
}

export function OutcomesDonut({ outcomes, isLoading }: OutcomesDonutProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Skeleton className="h-48 w-48 rounded-full" />
          <div className="flex-1 space-y-2 w-full">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!outcomes || outcomes.total === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">
          Booking Outcomes <span className="text-slate-400 font-normal">· All time</span>
        </h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          No bookings yet.
          <br />
          Outcome data will appear after your first booking.
        </p>
      </div>
    );
  }

  const legendItems = [
    {
      key: "completed",
      label: "Completed",
      pct: outcomes.completedPct,
      count: outcomes.completed,
      color: "bg-indigo-500",
      fill: SLICE_COLORS.completed,
    },
    {
      key: "cancelled",
      label: "Cancelled",
      pct: outcomes.cancelledPct,
      count: outcomes.cancelled,
      color: "bg-red-500",
      fill: SLICE_COLORS.cancelled,
    },
    {
      key: "inProgress",
      label: "In Progress",
      pct: outcomes.inProgressPct,
      count: outcomes.inProgress,
      color: "bg-amber-500",
      fill: SLICE_COLORS.inProgress,
    },
    {
      key: "other",
      label: "Other",
      pct: outcomes.otherPct,
      count: outcomes.other,
      color: "bg-slate-400",
      fill: SLICE_COLORS.other,
    },
  ];

  const pieData = legendItems
    .filter((item) => item.count > 0)
    .map((item) => ({ name: item.label, value: item.count, fill: item.fill }));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">
        Booking Outcomes <span className="text-slate-400 font-normal">· All time</span>
      </h3>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="h-48 w-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 flex-1 w-full">
          {legendItems.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${item.color}`} />
                <span className="text-slate-700">{item.label}</span>
              </div>
              <span className="text-slate-500">
                {item.pct}% ({item.count})
              </span>
            </div>
          ))}
        </div>
      </div>
      {outcomes.cancelledPct > 30 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-3">
          ⚠ High cancellation rate. Review your bookings for patterns.
        </p>
      )}
    </div>
  );
}
