import { useGetMe, useGetDashboardStats, useGetDashboardActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Briefcase, Calendar, CheckCircle2, Clock, FileText, User } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: user } = useGetMe();
  const { data: stats, isLoading: isLoadingStats } = useGetDashboardStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetDashboardActivity();

  if (isLoadingStats || isLoadingActivity) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="animate-pulse flex flex-col items-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-muted-foreground">Loading dashboard...</p></div></div>;
  }

  const isEmployer = user?.role === "employer";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user?.name}. Here is your overview.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeBookings || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently ongoing engagements</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Bookings</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedBookings || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully finished</p>
          </CardContent>
        </Card>

        {isEmployer ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats?.totalSpent?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Requirements</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.openJobRequirements || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Jobs awaiting talent</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${stats?.totalEarnings?.toLocaleString() || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all completed bookings</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Agreements</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.pendingAgreements || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting your signature</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions and updates across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity && activity.length > 0 ? (
              <div className="space-y-8">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <div className="bg-secondary p-2 rounded-full mr-4">
                      {item.type === "booking_created" && <Calendar className="h-4 w-4 text-primary" />}
                      {item.type === "agreement_signed" && <FileText className="h-4 w-4 text-primary" />}
                      {item.type === "job_posted" && <Briefcase className="h-4 w-4 text-primary" />}
                      {item.type === "booking_completed" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      {(!["booking_created", "agreement_signed", "job_posted", "booking_completed"].includes(item.type)) && <Clock className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(item.timestamp), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>No recent activity found.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Platform Status</CardTitle>
            <CardDescription>Current network metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              <div className="flex items-center">
                <div className="bg-secondary p-2 rounded-full mr-4">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Available Freelancers</p>
                  <p className="text-sm text-muted-foreground">Highly vetted professionals</p>
                </div>
                <div className="font-medium">{stats?.availableFreelancers || 0}</div>
              </div>
              <div className="flex items-center">
                <div className="bg-secondary p-2 rounded-full mr-4">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-none">Open Roles</p>
                  <p className="text-sm text-muted-foreground">Exclusive engagements</p>
                </div>
                <div className="font-medium">{stats?.openJobRequirements || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
