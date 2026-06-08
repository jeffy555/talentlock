import { useState } from "react";
import { Link } from "wouter";
import {
  useGetMe,
  useGetMySubscription,
  useGetTeam,
  useGetTeamAnalytics,
  GetTeamAnalyticsWindow,
  type GetTeamAnalyticsWindow as WindowType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";

function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

function SpendByMemberChart({
  members,
  isLoading,
}: {
  members: { name: string; spend: number }[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const maxSpend = Math.max(...members.map((m) => m.spend), 1);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">Spend by team member</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No approved milestone spend in this window.</p>
        ) : (
          members.map((member) => (
            <div key={member.name} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{member.name}</span>
                <span className="text-slate-600 tabular-nums">{formatMoney(member.spend)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/80 transition-all"
                  style={{ width: `${Math.max(4, (member.spend / maxSpend) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TopFreelancersList({
  freelancers,
  isLoading,
}: {
  freelancers: {
    freelancerId: number;
    name: string;
    fieldOfWork: string;
    totalSpend: number;
    bookingCount: number;
  }[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">Most hired freelancers (team-wide)</CardTitle>
      </CardHeader>
      <CardContent>
        {freelancers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No team bookings in this window.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {freelancers.map((f, index) => (
              <div key={f.freelancerId} className="flex items-start justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-slate-400 w-4">{index + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{f.fieldOfWork}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatMoney(f.totalSpend)}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.bookingCount} booking{f.bookingCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpenJobsList({
  members,
  isLoading,
}: {
  members: { name: string; openJobCount: number }[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-52" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">Open job requirements by member</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No open job requirements across the team.</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.name} className="flex items-center justify-between text-sm py-1">
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.openJobCount} open job{m.openJobCount !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeamAnalytics() {
  const { data: user } = useGetMe();
  const { data: subscription } = useGetMySubscription({ query: { enabled: !!user } as any });
  const isEnterprise = subscription?.plan?.id === "employer_enterprise";

  const { data: teamData, isLoading: teamLoading } = useGetTeam({
    query: { enabled: !!user && isEnterprise, retry: false } as any,
  });

  const [window, setWindow] = useState<WindowType>(GetTeamAnalyticsWindow["90d"]);

  const isAdmin = !!teamData?.isAdmin;

  const { data, isLoading, isError, refetch } = useGetTeamAnalytics(
    { window },
    { query: { enabled: isAdmin } as any },
  );

  if (!user || teamLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (!isEnterprise || !teamData) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-muted-foreground">Team analytics requires an enterprise team account.</p>
        <Button asChild variant="outline">
          <Link href="/team">Back to Team</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="font-serif text-2xl font-bold">Admin access required</h1>
        <p className="text-muted-foreground">Only team admins can view team analytics.</p>
        <Button asChild variant="outline">
          <Link href="/team">Back to Team</Link>
        </Button>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-muted-foreground">Could not load team analytics.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const teamName = data?.teamName ?? teamData.team.name;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
            <Link href="/team">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Team
            </Link>
          </Button>
          <h1 className="font-serif text-3xl font-bold">Team Analytics — {teamName}</h1>
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as WindowType)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GetTeamAnalyticsWindow["30d"]}>30 days</SelectItem>
            <SelectItem value={GetTeamAnalyticsWindow["90d"]}>90 days</SelectItem>
            <SelectItem value={GetTeamAnalyticsWindow["12m"]}>12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-muted-foreground">Total team spend</p>
          {isLoading ? (
            <Skeleton className="h-8 w-32 mt-2" />
          ) : (
            <p className="text-2xl font-semibold text-slate-800 mt-1 tabular-nums">
              {formatMoney(data?.totalSpend ?? 0)}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-muted-foreground">Bookings created</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-2" />
          ) : (
            <p className="text-2xl font-semibold text-slate-800 mt-1 tabular-nums">
              {data?.bookingsCreated ?? 0}
            </p>
          )}
        </div>
      </div>

      <SpendByMemberChart members={data?.spendByMember ?? []} isLoading={isLoading} />
      <TopFreelancersList freelancers={data?.mostHiredFreelancers ?? []} isLoading={isLoading} />
      <OpenJobsList members={data?.openJobsByMember ?? []} isLoading={isLoading} />
    </div>
  );
}
