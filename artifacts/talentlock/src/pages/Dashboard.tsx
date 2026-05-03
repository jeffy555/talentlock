import { useGetMe, useGetDashboardStats, useGetDashboardActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Briefcase, Calendar, CheckCircle2, Clock, FileText, User } from "lucide-react";
import { format } from "date-fns";

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

export default function Dashboard() {
  const { data: user } = useGetMe();
  const { data: stats, isLoading: isLoadingStats } = useGetDashboardStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetDashboardActivity();

  const isEmployer = user?.role === "employer";

  if (isLoadingStats || isLoadingActivity) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <div className="h-9 w-48 bg-muted rounded mb-2"></div>
          <div className="h-5 w-64 bg-muted rounded"></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 p-6">
            <ActivitySkeleton />
            <ActivitySkeleton />
            <ActivitySkeleton />
          </Card>
          <Card className="col-span-3 p-6">
            <ActivitySkeleton />
            <ActivitySkeleton />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 font-light">
          Welcome back, {user?.name}. Here is your overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{stats?.activeBookings || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently ongoing engagements</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
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
            <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
                <Activity className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">${stats?.totalSpent?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
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
            <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
                <Activity className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">${stats?.totalEarnings?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-sm border-border hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Agreements</CardTitle>
                <FileText className="h-4 w-4 text-gold" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{stats?.pendingAgreements || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting your signature</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="font-serif">Recent Activity</CardTitle>
            <CardDescription>Your latest actions and updates across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity && activity.length > 0 ? (
              <div className="space-y-8">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start group">
                    <div className="bg-gold/10 p-2.5 rounded-full mr-4 border border-gold/20 transition-colors group-hover:bg-gold/20">
                      {item.type === "booking_created" && <Calendar className="h-4 w-4 text-gold" />}
                      {item.type === "agreement_signed" && <FileText className="h-4 w-4 text-gold" />}
                      {item.type === "job_posted" && <Briefcase className="h-4 w-4 text-gold" />}
                      {item.type === "booking_completed" && <CheckCircle2 className="h-4 w-4 text-gold" />}
                      {(!["booking_created", "agreement_signed", "job_posted", "booking_completed"].includes(item.type)) && <Clock className="h-4 w-4 text-gold" />}
                    </div>
                    <div className="flex-1 space-y-1 mt-1">
                      <p className="text-sm font-medium leading-none text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground font-light">
                        {format(new Date(item.timestamp), "MMM d, yyyy h:mm a")}
                      </p>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
