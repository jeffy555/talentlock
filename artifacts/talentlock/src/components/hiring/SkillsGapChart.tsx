import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { HiringAnalyticsSkillsGap } from "@workspace/api-client-react";

interface SkillsGapChartProps {
  demand: HiringAnalyticsSkillsGap["demand"];
  supply: HiringAnalyticsSkillsGap["supply"];
  gaps: string[];
  isLoading?: boolean;
}

export function SkillsGapChart({
  demand,
  supply,
  gaps,
  isLoading,
}: SkillsGapChartProps) {
  const supplyMap = useMemo(
    () => new Map(supply.map((s) => [s.skill, s.count])),
    [supply],
  );
  const demandMap = useMemo(
    () => new Map(demand.map((d) => [d.skill, d.count])),
    [demand],
  );

  const rows = useMemo(() => {
    const skillSet = new Set([
      ...demand.map((d) => d.skill),
      ...supply.map((s) => s.skill),
    ]);
    return [...skillSet]
      .map((skill) => ({
        skill,
        demandCount: demandMap.get(skill) ?? 0,
        supplyCount: supplyMap.get(skill) ?? 0,
      }))
      .sort((a, b) => b.demandCount - a.demandCount || b.supplyCount - a.supplyCount)
      .slice(0, 8);
  }, [demand, supply, demandMap, supplyMap]);

  const maxDemand = Math.max(...rows.map((r) => r.demandCount), 1);
  const maxSupply = Math.max(...rows.map((r) => r.supplyCount), 1);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  const hasDemand = demand.length > 0;
  const hasSupply = supply.length > 0;
  const hasAny = hasDemand || hasSupply;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Skills: Demand vs Supply</h3>
        <p className="text-sm text-muted-foreground text-center py-6">No skill data available yet.</p>
      </div>
    );
  }

  if (!hasDemand && hasSupply) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Skills You Hire</h3>
        <div className="space-y-2">
          {supply.slice(0, 8).map((item) => {
            const barWidth = maxSupply > 0 ? (item.count / maxSupply) * 100 : 0;
            return (
              <div key={item.skill} className="grid grid-cols-[6rem_1fr] gap-2 items-center">
                <span className="text-sm text-slate-700 truncate">{item.skill}</span>
                <div className="h-2 bg-slate-100 rounded-full">
                  <div
                    className="h-2 bg-emerald-400 rounded-full"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground bg-slate-50 rounded p-2 mt-4">
          ℹ Job skills data not available — gap analysis requires skills to be specified on job
          requirements.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Skills: Demand vs Supply</h3>
      <div className="grid grid-cols-[6rem_1fr_1fr] gap-2 text-xs text-muted-foreground mb-2">
        <span />
        <span className="text-center">You post for</span>
        <span className="text-center">You hire</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const isGap = gaps.includes(row.skill);
          const demandWidth = maxDemand > 0 ? (row.demandCount / maxDemand) * 100 : 0;
          const supplyWidth = maxSupply > 0 ? (row.supplyCount / maxSupply) * 100 : 0;
          return (
            <div
              key={row.skill}
              className={`grid grid-cols-[6rem_1fr_1fr] gap-2 items-center py-1 rounded px-1 ${
                isGap ? "bg-red-50" : ""
              }`}
            >
              <div className="flex items-center min-w-0">
                <span className="text-sm text-slate-700 truncate">{row.skill}</span>
                {isGap && (
                  <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 ml-1 shrink-0">
                    Gap
                  </span>
                )}
              </div>
              <div className="h-2 bg-slate-100 rounded-full">
                <div
                  className="h-2 bg-indigo-400 rounded-full"
                  style={{ width: `${demandWidth}%` }}
                />
              </div>
              <div className="h-2 bg-slate-100 rounded-full">
                {row.supplyCount > 0 ? (
                  <div
                    className="h-2 bg-emerald-400 rounded-full"
                    style={{ width: `${supplyWidth}%` }}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground pl-1">— (none hired)</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {gaps.length > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded p-2 mt-3">
          {gaps.length} skill gap{gaps.length !== 1 ? "s" : ""} identified: {gaps.join(", ")}
        </p>
      )}
    </div>
  );
}
