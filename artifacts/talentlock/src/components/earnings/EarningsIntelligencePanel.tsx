import { useGetDashboardEarningsIntelligence } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { EarningsSummaryCards } from "./EarningsSummaryCards";
import { EarningsTrendChart } from "./EarningsTrendChart";
import { RateBenchmarkCard } from "./RateBenchmarkCard";
import { ProjectionCard } from "./ProjectionCard";
import { TopSkillsCard } from "./TopSkillsCard";

export function EarningsIntelligencePanel() {
  const { data, isLoading, isError, refetch } = useGetDashboardEarningsIntelligence();
  const currencyCode = data?.projection.currency ?? "USD";

  if (isError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load earnings intelligence.{" "}
          <Button
            variant="link"
            className="h-auto p-0 text-blue-600"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EarningsSummaryCards
        thisMonth={data?.summary.thisMonth ?? 0}
        lastMonth={data?.summary.lastMonth ?? 0}
        allTime={data?.summary.allTime ?? 0}
        monthOverMonthChange={data?.summary.monthOverMonthChange ?? null}
        currencyCode={currencyCode}
        isLoading={isLoading}
      />
      <EarningsTrendChart
        months={data?.trend.months ?? []}
        freelancerEarnings={data?.trend.freelancerEarnings ?? []}
        platformAverage={data?.trend.platformAverage ?? []}
        fieldOfWork={data?.rateBenchmark?.fieldOfWork ?? ""}
        currencyCode={currencyCode}
        isLoading={isLoading}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RateBenchmarkCard data={data?.rateBenchmark} currencyCode={currencyCode} isLoading={isLoading} />
        <ProjectionCard
          projectedAmount={data?.projection.projectedAmount ?? 0}
          milestoneCount={data?.projection.milestoneCount ?? 0}
          currencyCode={currencyCode}
          isLoading={isLoading}
        />
      </div>
      <TopSkillsCard skills={data?.topSkills ?? []} currencyCode={currencyCode} isLoading={isLoading} />
    </div>
  );
}
