import { Link } from "wouter";
import { Heart } from "lucide-react";
import {
  useGetMe,
  useGetMySubscription,
  useGetTeam,
  useListSavedFreelancers,
  useListTeamShortlist,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNextAvailable } from "@/lib/availabilityUtils";
import { formatRate, profileDefaultRateType } from "@/lib/rateFormatUtils";

export function WatchlistSummaryCard() {
  const { data: user } = useGetMe();
  const { data: subscription } = useGetMySubscription({
    query: { enabled: user?.role === "employer" } as never,
  });
  const isEnterprise = subscription?.plan?.id === "employer_enterprise";
  const { data: teamData } = useGetTeam({
    query: { enabled: !!user && isEnterprise, retry: false } as never,
  });
  const isTeamMember = isEnterprise && !!teamData;

  const { data: saved, isLoading: savedLoading } = useListSavedFreelancers({
    query: { enabled: user?.role === "employer" && !isTeamMember } as never,
  });
  const { data: teamShortlist, isLoading: teamLoading } = useListTeamShortlist({
    query: { enabled: isTeamMember } as never,
  });

  if (user?.role !== "employer") return null;

  const isLoading = isTeamMember ? teamLoading : savedLoading;

  if (isLoading) {
    return (
      <Card className="animate-pulse border-border">
        <CardHeader className="pb-2">
          <div className="h-5 w-40 bg-muted rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const items = isTeamMember
    ? (teamShortlist ?? []).map((item) => ({
        id: item.freelancer.id,
        name: item.freelancer.name,
        subtitle: item.freelancer.isAvailable
          ? formatNextAvailable(item.freelancer.nextAvailableDate)
          : formatRate(
              Number(item.freelancer.hourlyRate ?? item.freelancer.dailyRate ?? 0),
              profileDefaultRateType(item.freelancer.professionCategory),
            ),
      }))
    : (saved ?? []).map((item) => ({
        id: item.freelancer.id,
        name: item.freelancer.name,
        subtitle: item.freelancer.isAvailable
          ? formatNextAvailable(item.freelancer.nextAvailableDate)
          : formatRate(
              Number(item.freelancer.hourlyRate ?? item.freelancer.dailyRate ?? 0),
              profileDefaultRateType(item.freelancer.professionCategory),
            ),
      }));

  if (items.length === 0) return null;

  const title = isTeamMember ? "Team Shortlist" : "Your Watchlist";
  const ctaHref = isTeamMember ? "/freelancers?view=team-shortlist" : "/freelancers?view=watchlist";
  const ctaLabel = isTeamMember ? "View team shortlist →" : "View watchlist →";

  return (
    <Card className="border-border shadow-sm bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Heart className="h-4 w-4 text-rose-500" />
          {title}
        </CardTitle>
        <span className="text-sm font-medium text-muted-foreground">({items.length})</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <Link href={`/freelancers/${item.id}`} className="font-medium text-foreground hover:text-primary truncate">
              {item.name}
            </Link>
            <span className="text-xs text-muted-foreground shrink-0">{item.subtitle}</span>
          </div>
        ))}
        <Link href={ctaHref} className="inline-block text-sm text-primary hover:underline pt-1">
          {ctaLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
