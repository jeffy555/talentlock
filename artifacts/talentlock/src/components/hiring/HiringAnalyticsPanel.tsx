import { useState } from "react";
import {
  useGetDashboardHiringAnalytics,
  GetDashboardHiringAnalyticsWindow,
  type GetDashboardHiringAnalyticsWindow as WindowType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HiringFunnel } from "./HiringFunnel";
import { SkillsGapChart } from "./SkillsGapChart";
import { RetentionCard } from "./RetentionCard";
import { LifecycleDuration } from "./LifecycleDuration";
import { OutcomesDonut } from "./OutcomesDonut";

export function HiringAnalyticsPanel() {
  const [window, setWindow] = useState<WindowType>(
    GetDashboardHiringAnalyticsWindow["90d"],
  );

  const { data, isLoading, isError, refetch } = useGetDashboardHiringAnalytics({
    window,
  });

  if (isError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load hiring analytics.{" "}
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
      <div className="flex justify-end items-center gap-2">
        <span className="text-sm text-muted-foreground">Analytics window:</span>
        <Select
          value={window}
          onValueChange={(value) => setWindow(value as WindowType)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GetDashboardHiringAnalyticsWindow["30d"]}>
              Last 30 days
            </SelectItem>
            <SelectItem value={GetDashboardHiringAnalyticsWindow["90d"]}>
              Last 90 days
            </SelectItem>
            <SelectItem value={GetDashboardHiringAnalyticsWindow["12m"]}>
              Last 12 months
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <HiringFunnel funnel={data?.funnel} isLoading={isLoading} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkillsGapChart
          demand={data?.skillsGap.demand ?? []}
          supply={data?.skillsGap.supply ?? []}
          gaps={data?.skillsGap.gaps ?? []}
          isLoading={isLoading}
        />
        <RetentionCard retention={data?.retention} isLoading={isLoading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LifecycleDuration lifecycle={data?.lifecycle} isLoading={isLoading} />
        <OutcomesDonut outcomes={data?.outcomes} isLoading={isLoading} />
      </div>
    </div>
  );
}
