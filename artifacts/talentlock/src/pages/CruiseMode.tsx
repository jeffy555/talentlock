import { useState, useMemo } from "react";
import { Redirect, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetCruiseMode,
  useGetCruiseModeStats,
  useListCruiseModeActivity,
  useUpsertCruiseMode,
  getGetCruiseModeQueryKey,
  type CruiseModeRules,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Rocket } from "lucide-react";
import { CruiseModeStatusBar } from "@/components/cruise-mode/CruiseModeStatusBar";
import { CruiseModeRuleBuilder } from "@/components/cruise-mode/CruiseModeRuleBuilder";
import { CruiseModeActivityFeed } from "@/components/cruise-mode/CruiseModeActivityFeed";
import { formatHours } from "@/lib/cruiseModeDisplayUtils";

function CruiseModeStatsPanel({
  stats,
  isLoading,
}: {
  stats?: {
    evaluatedToday: number;
    sentToday: number;
    skippedToday: number;
    dryRunToday: number;
    hoursUsedToday: number;
    dailyLimitHours: number;
    hoursRemainingToday: number;
    hoursResetAt: string;
  };
  isLoading: boolean;
}) {
  if (isLoading || !stats) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading stats…</p>;
  }

  const dailyPct = Math.min(100, (stats.hoursUsedToday / Math.max(0.01, stats.dailyLimitHours)) * 100);

  const statCards = [
    { label: "Evaluated", value: stats.evaluatedToday },
    { label: "Sent", value: stats.sentToday },
    { label: "Skipped", value: stats.skippedToday },
    { label: "Dry run", value: stats.dryRunToday },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Today&apos;s Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-slate-800">{value}</div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-slate-800">Daily time budget</span>
            <span className="text-muted-foreground">
              {formatHours(stats.hoursUsedToday)} / {formatHours(stats.dailyLimitHours)}
            </span>
          </div>
          <Progress value={dailyPct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {formatHours(stats.hoursRemainingToday)} remaining · resets at midnight UTC
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CruiseMode() {
  const queryClient = useQueryClient();
  const search = useSearch();
  const initialTab = useMemo(() => {
    const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
    if (tab === "activity" || tab === "stats") return tab;
    return "setup";
  }, [search]);
  const [tab, setTab] = useState(initialTab);

  const { data: me, isLoading: meLoading } = useGetMe();
  const isFreelancer = me?.role === "freelancer";

  const { data: config, isLoading: configLoading } = useGetCruiseMode({
    query: { enabled: isFreelancer } as any,
  });
  const { data: stats, isLoading: statsLoading } = useGetCruiseModeStats({
    query: { enabled: isFreelancer } as any,
  });
  const { data: activityMeta } = useListCruiseModeActivity(
    { page: 1, pageSize: 1 },
    { query: { enabled: isFreelancer } as any },
  );

  const upsert = useUpsertCruiseMode();

  if (meLoading) {
    return <div className="text-center text-muted-foreground py-12">Loading…</div>;
  }

  if (me && !isFreelancer) {
    return <Redirect to="/dashboard" />;
  }

  const activityCount = activityMeta?.total ?? 0;

  const handleSaveRules = async (rules: CruiseModeRules, rawRulesText?: string | null) => {
    await upsert.mutateAsync({ data: { rules, rawRulesText: rawRulesText ?? null } });
    await queryClient.invalidateQueries({ queryKey: getGetCruiseModeQueryKey() });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-serif">
            <Rocket className="h-6 w-6 text-violet-600" />
            Cruise Mode
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your AI assistant finds and responds to matching jobs while you&apos;re away.
          </p>
        </div>
        <CruiseModeStatusBar
          config={config}
          stats={stats}
          hasConfig={!!config}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="activity">
            Activity{activityCount > 0 ? ` (${activityCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-6">
          {configLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : (
            <CruiseModeRuleBuilder
              key={config?.id ?? "new"}
              initialRules={config?.rules}
              initialRawText={config?.rawRulesText}
              onSave={handleSaveRules}
              isSaving={upsert.isPending}
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <CruiseModeActivityFeed />
        </TabsContent>

        <TabsContent value="stats" className="mt-6">
          <CruiseModeStatsPanel stats={stats} isLoading={statsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
