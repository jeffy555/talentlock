import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/earningsFormat";
import type { EarningsIntelligenceTopSkill } from "@workspace/api-client-react";

interface TopSkillsCardProps {
  skills: EarningsIntelligenceTopSkill[];
  isLoading?: boolean;
}

export function TopSkillsCard({ skills, isLoading }: TopSkillsCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Top Earning Skills</h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          No skill-attributed earnings yet.
          <br />
          Complete bookings to see your top earning skills.
        </p>
      </div>
    );
  }

  const maxEarned = Math.max(...skills.map((s) => s.totalEarned));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Top Earning Skills</h3>
      <div className="space-y-1">
        {skills.map((skill, index) => {
          const barWidth = maxEarned > 0 ? (skill.totalEarned / maxEarned) * 100 : 0;
          return (
            <div
              key={skill.skill}
              className="grid grid-cols-[1.5rem_1fr_auto_6rem] gap-2 items-center py-1.5"
            >
              <span className="text-sm text-muted-foreground">{index + 1}</span>
              <span className="text-sm font-medium text-slate-800 truncate">{skill.skill}</span>
              <span className="text-sm text-slate-600 tabular-nums">
                {formatCurrency(skill.totalEarned)}
              </span>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-indigo-100 rounded-full"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
