import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { subDays } from "date-fns";
import {
  useGetMe,
  useGetDashboardStats,
  useGetDashboardActivity,
  useGetMyAnalytics,
  useListBookings,
  useGetMyFreelancerProfile,
  getBooking,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Briefcase, Calendar, CheckCircle2, Clock, FileText, User, TrendingUp, Star } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TokenUsageWidget } from "@/components/TokenUsageWidget";
import { TokenUsageBanner } from "@/components/TokenUsageBanner";
import { EarningsIntelligencePanel } from "@/components/earnings/EarningsIntelligencePanel";
import { SpendAnalyticsPanel } from "@/components/spend/SpendAnalyticsPanel";
import { HiringAnalyticsPanel } from "@/components/hiring/HiringAnalyticsPanel";
import { ProfileStrengthChecklist } from "@/components/onboarding/ProfileStrengthChecklist";
import { WatchlistSummaryCard } from "@/components/watchlist/WatchlistSummaryCard";

function StatCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-24 bg-muted rounded"></div>
        <div className="h-4 w-4 bg-muted rounded"></div>
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 bg-muted rounded mb-2"></div>
        <div className="h-3 w-32 bg-muted rounded"></div>
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex items-center space-x-4 mb-8">
      <div className="h-9 w-9 rounded-full bg-muted"></div>
      <div className="space-y-2 flex-1">
        <div className="h-4 w-full bg-muted rounded"></div>
        <div className="h-3 w-32 bg-muted rounded"></div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, valueKey, prefix }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        <p className="text-muted-foreground">Bookings: <span className="font-bold text-foreground">{payload.find((p: any) => p.dataKey === "bookings")?.value ?? 0}</span></p>
        {payload.find((p: any) => p.dataKey === valueKey) && (
          <p className="text-muted-foreground capitalize">{valueKey}: <span className="font-bold text-foreground">{prefix}{payload.find((p: any) => p.dataKey === valueKey)?.value?.toFixed(0) ?? 0}</span></p>
        )}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data: user } = useGetMe();
  const { data: stats, isLoading: isLoadingStats } = useGetDashboardStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetDashboardActivity();
  const { data: analytics } = useGetMyAnalytics();

  const isEmployer = user?.role === "employer";
  const { data: freelancerProfile } = useGetMyFreelancerProfile({
    query: { enabled: user?.role === "freelancer" } as never,
  });
  const { data: completedBookings } = useListBookings(
    { status: "completed" },
    { query: { enabled: isEmployer } as never },
  );

  const recentCompletedIds = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    return (completedBookings?.data ?? [])
      .filter((b) => new Date(b.endDate) >= cutoff)
      .slice(0, 5)
      .map((b) => b.id);
  }, [completedBookings]);

  const bookingDetailQueries = useQueries({
    queries: recentCompletedIds.map((id) => ({
      queryKey: [`/api/bookings/${id}`],
      queryFn: () => getBooking(id),
      enabled: isEmployer,
    })),
  });

  const reviewPrompts = useMemo(
    () =>
      bookingDetailQueries
        .map((q) => q.data)
        .filter((b) => b && b.review == null)
        .slice(0, 3),
    [bookingDetailQueries],
  );

  const monthly = analytics?.monthly ?? [];
  const totals = analytics?.totals as Record<string, number | null | undefined> | undefined;
  const valueKey = isEmployer ? "spend" : "earnings";

  if (isLoadingStats || isLoadingActivity) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div><div className="h-9 w-48 bg-muted rounded mb-2"></div><div className="h-5 w-64 bg-muted rounded"></div></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 p-6"><ActivitySkeleton /><ActivitySkeleton /><ActivitySkeleton /></Card>
          <Card className="col-span-3 p-6"><ActivitySkeleton /><ActivitySkeleton /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {isEmployer && <TokenUsageBanner />}

      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 font-light">Welcome back, {user?.name}. Here is your overview.</p>
      </div>

      {!isEmployer && freelancerProfile && (
        <ProfileStrengthChecklist
          score={freelancerProfile.completenessScore ?? 0}
          profile={{
            bio: freelancerProfile.bio,
            skills: freelancerProfile.skills,
            hourlyRate: freelancerProfile.hourlyRate,
            dailyRate: freelancerProfile.dailyRate,
            paymentPreference: freelancerProfile.paymentPreference,
            fieldOfWork: freelancerProfile.fieldOfWork,
            isAvailable: freelancerProfile.isAvailable,
          }}
          avatarUrl={user?.avatarUrl}
        />
      )}

      <section className="space-y-3" aria-label="Key metrics">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{stats?.activeBookings || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently ongoing engagements</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Bookings</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{stats?.completedBookings || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully finished</p>
          </CardContent>
        </Card>

        {isEmployer ? (
          <>
            <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
                <Activity className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">${stats?.totalSpent?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Open Requirements</CardTitle>
                <Briefcase className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{stats?.openJobRequirements || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Jobs awaiting talent</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
                <Activity className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">${stats?.totalEarnings?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {totals?.averageRating ? "Avg Rating" : "Pending Agreements"}
                </CardTitle>
                {totals?.averageRating ? <Star className="h-4 w-4 text-gold" /> : <FileText className="h-4 w-4 text-gold" />}
              </CardHeader>
              <CardContent>
                {totals?.averageRating ? (
                  <>
                    <div className="text-3xl font-serif font-bold text-foreground">{Number(totals.averageRating).toFixed(1)}</div>
                    <p className="text-xs text-muted-foreground mt-1">From {totals.totalReviews ?? 0} review{totals.totalReviews !== 1 ? "s" : ""}</p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-serif font-bold text-foreground">{stats?.pendingAgreements || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting your signature</p>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {isEmployer && <TokenUsageWidget variant="compact" />}
        </div>
      </section>

      {isEmployer && (
        <div className="max-w-md">
          <WatchlistSummaryCard />
        </div>
      )}

      {/* Analytics Chart */}
      {monthly.length > 0 && (
        <Card className="shadow-sm border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-gold" />
              <div>
                <CardTitle className="font-serif">Activity Over Time</CardTitle>
                <CardDescription>Monthly bookings and {isEmployer ? "spend" : "earnings"} over the past 6 months.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip valueKey={valueKey} prefix="$" />} />
                <Bar yAxisId="left" dataKey="bookings" fill="hsl(var(--primary))" radius={[3,3,0,0]} maxBarSize={32} name="Bookings" />
                <Bar yAxisId="right" dataKey={valueKey} fill="hsl(var(--gold))" radius={[3,3,0,0]} maxBarSize={32} name={isEmployer ? "Spend" : "Earnings"} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary inline-block"></span> Bookings</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[hsl(var(--gold))] inline-block"></span> {isEmployer ? "Spend ($)" : "Earnings ($)"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {!isEmployer && (
        <section className="space-y-3 pt-2">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Earnings Intelligence
          </h2>
          <div className="rounded-xl border border-border/80 bg-card/50 p-1">
            <EarningsIntelligencePanel />
          </div>
        </section>
      )}

      {isEmployer && (
        <section className="space-y-3 pt-2">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Spend Analytics
          </h2>
          <div className="rounded-xl border border-border/80 bg-card/50 p-1">
            <SpendAnalyticsPanel />
          </div>
        </section>
      )}

      {isEmployer && (
        <section className="space-y-3 pt-2">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Hiring Analytics
          </h2>
          <div className="rounded-xl border border-border/80 bg-card/50 p-1">
            <HiringAnalyticsPanel />
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="font-serif">Recent Activity</CardTitle>
            <CardDescription>Your latest actions and updates across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {isEmployer && reviewPrompts.length > 0 && (
              <div className="space-y-3 mb-8">
                {reviewPrompts.map((booking) => booking && (
                  <div
                    key={booking.id}
                    className="rounded-md border border-amber-200 bg-amber-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-amber-900">
                        ⭐ Leave a review for {booking.freelancerName ?? "your freelancer"}
                      </p>
                      <p className="text-xs text-amber-800/80 mt-0.5">
                        Booking completed {format(new Date(booking.endDate), "MMM d")}
                      </p>
                    </div>
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="text-sm font-medium text-amber-900 hover:underline whitespace-nowrap"
                    >
                      Write Review →
                    </Link>
                  </div>
                ))}
              </div>
            )}
            {activity && activity.length > 0 ? (
              <div className="space-y-8">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start group">
                    <div className="bg-gold/10 p-2.5 rounded-full mr-4 border border-gold/20 transition-colors group-hover:bg-gold/20">
                      {item.type === "booking_created" && <Calendar className="h-4 w-4 text-gold" />}
                      {item.type === "agreement_signed" && <FileText className="h-4 w-4 text-gold" />}
                      {item.type === "job_posted" && <Briefcase className="h-4 w-4 text-gold" />}
                      {item.type === "booking_completed" && <CheckCircle2 className="h-4 w-4 text-gold" />}
                      {!["booking_created", "agreement_signed", "job_posted", "booking_completed"].includes(item.type) && <Clock className="h-4 w-4 text-gold" />}
                    </div>
                    <div className="flex-1 space-y-1 mt-1">
                      <p className="text-sm font-medium leading-none text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground font-light">{format(new Date(item.timestamp), "MMM d, yyyy h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Activity className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium text-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground mt-1">Actions you take will appear here.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="font-serif">Platform Status</CardTitle>
            <CardDescription>Current network metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              <div className="flex items-center">
                <div className="bg-secondary/50 p-2.5 rounded-xl mr-4 border border-border">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Available Freelancers</p>
                  <p className="text-xs text-muted-foreground font-light">Highly vetted professionals</p>
                </div>
                <div className="font-serif font-bold text-lg text-foreground">{stats?.availableFreelancers || 0}</div>
              </div>
              <div className="flex items-center">
                <div className="bg-secondary/50 p-2.5 rounded-xl mr-4 border border-border">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Open Roles</p>
                  <p className="text-xs text-muted-foreground font-light">Exclusive engagements</p>
                </div>
                <div className="font-serif font-bold text-lg text-foreground">{stats?.openJobRequirements || 0}</div>
              </div>
              {isEmployer && totals?.uniqueFreelancers != null && (
                <div className="flex items-center">
                  <div className="bg-secondary/50 p-2.5 rounded-xl mr-4 border border-border">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">Freelancers Hired</p>
                    <p className="text-xs text-muted-foreground font-light">Unique professionals</p>
                  </div>
                  <div className="font-serif font-bold text-lg text-foreground">{totals.uniqueFreelancers}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
