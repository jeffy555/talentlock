import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendTrendChartProps {
  months: string[];
  spend: number[];
  isLoading?: boolean;
}

export function SpendTrendChart({ months, spend, isLoading }: SpendTrendChartProps) {
  const chartData = useMemo(
    () => months.map((month, i) => ({ month, spend: spend[i] ?? 0 })),
    [months, spend],
  );

  const hasSpend = spend.some((v) => v > 0);

  if (isLoading) {
    return <Skeleton className="h-[280px] w-full rounded-lg" />;
  }

  if (!hasSpend) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Spend Trend</h3>
        <div className="text-sm text-muted-foreground text-center py-6">
          <span className="text-2xl block mb-2" aria-hidden>
            💰
          </span>
          <p>No spend data yet.</p>
          <p className="text-xs mt-1">Create your first booking to see your spend trend.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Spend Trend</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "Spend"]}
            cursor={{ fill: "#f8fafc" }}
          />
          <Bar dataKey="spend" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
