import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Stats = {
  users: { total: number; freelancers: number; employers: number };
  bookings: { total: number; active: number; pending: number };
  jobs: { total: number; open: number };
  agreements: number;
  meetings: number;
  interests: number;
  subscriptions: { total: number; byPlan: { plan: string; c: number }[] };
  activity: { loginsLast24h: number };
};

type AuditRow = {
  id: number;
  userId: number | null;
  email: string | null;
  role: string | null;
  event: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type UserRow = {
  id: number;
  clerkId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

type BookingRow = {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
  paymentType: string;
  rate: string | null;
  createdAt: string;
  freelancerName: string | null;
  employerCompany: string | null;
};

type JobRow = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  employerCompany: string | null;
};

type SubRow = {
  id: number;
  userId: number;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${basePath}/api${path}`, {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-3xl font-serif font-bold mt-2 text-primary">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function eventBadge(event: string) {
  if (event.includes("login")) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{event}</Badge>;
  if (event.includes("logout")) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{event}</Badge>;
  return <Badge variant="secondary">{event}</Badge>;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, u, b, j, sb] = await Promise.all([
        api<Stats>("/admin/stats"),
        api<AuditRow[]>("/admin/audit?limit=200"),
        api<UserRow[]>("/admin/users?limit=200"),
        api<BookingRow[]>("/admin/bookings?limit=200"),
        api<JobRow[]>("/admin/jobs?limit=200"),
        api<SubRow[]>("/admin/subscriptions"),
      ]);
      setStats(s);
      setAudit(a);
      setUsers(u);
      setBookings(b);
      setJobs(j);
      setSubs(sb);
    } catch (err: any) {
      if (err?.message === "UNAUTHORIZED") {
        setLocation("/admin/login");
        return;
      }
      toast({ title: "Failed to load", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, setLocation]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function logout() {
    await fetch(`${basePath}/api/admin/logout`, { method: "POST", credentials: "include" });
    setLocation("/admin/login");
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-gold font-serif font-bold">A</span>
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold leading-none">Admin Console</h1>
              <p className="text-xs text-muted-foreground mt-0.5">TalentLock platform overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="font-serif text-xl font-bold mb-4">Overview</h2>
          {!stats ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Users" value={stats.users.total} hint={`${stats.users.freelancers} freelancers · ${stats.users.employers} employers`} />
              <StatCard label="Logins (24h)" value={stats.activity.loginsLast24h} hint="user.login events" />
              <StatCard label="Bookings" value={stats.bookings.total} hint={`${stats.bookings.active} active · ${stats.bookings.pending} pending`} />
              <StatCard label="Open Jobs" value={stats.jobs.open} hint={`${stats.jobs.total} total posted`} />
              <StatCard label="Agreements" value={stats.agreements} />
              <StatCard label="Meetings" value={stats.meetings} />
              <StatCard label="Express Interests" value={stats.interests} />
              <StatCard label="Active Subscriptions" value={stats.subscriptions.total} hint={stats.subscriptions.byPlan.map(p => `${p.plan}: ${p.c}`).join(" · ") || "—"} />
            </div>
          )}
        </section>

        <Tabs defaultValue="audit">
          <TabsList>
            <TabsTrigger value="audit">Activity Log</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="subs">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity (last 200 events)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">When</th>
                        <th className="py-2 pr-4">Event</th>
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No activity yet.</td></tr>
                      )}
                      {audit.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                          <td className="py-2 pr-4">{eventBadge(row.event)}</td>
                          <td className="py-2 pr-4">{row.email ?? "—"}</td>
                          <td className="py-2 pr-4">{row.role ?? "—"}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{row.ipAddress ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">All Users</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">ID</th>
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{u.id}</td>
                          <td className="py-2 pr-4">{u.name}</td>
                          <td className="py-2 pr-4">{u.email}</td>
                          <td className="py-2 pr-4"><Badge variant="secondary">{u.role}</Badge></td>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">All Bookings</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">ID</th>
                        <th className="py-2 pr-4">Freelancer</th>
                        <th className="py-2 pr-4">Employer</th>
                        <th className="py-2 pr-4">Dates</th>
                        <th className="py-2 pr-4">Rate</th>
                        <th className="py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{b.id}</td>
                          <td className="py-2 pr-4">{b.freelancerName ?? "—"}</td>
                          <td className="py-2 pr-4">{b.employerCompany ?? "—"}</td>
                          <td className="py-2 pr-4 text-xs whitespace-nowrap">{new Date(b.startDate).toLocaleDateString()} → {new Date(b.endDate).toLocaleDateString()}</td>
                          <td className="py-2 pr-4">{b.rate ? `$${b.rate} / ${b.paymentType}` : "—"}</td>
                          <td className="py-2 pr-4"><Badge variant="secondary">{b.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">All Job Posts</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">ID</th>
                        <th className="py-2 pr-4">Title</th>
                        <th className="py-2 pr-4">Employer</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Posted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((j) => (
                        <tr key={j.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{j.id}</td>
                          <td className="py-2 pr-4">{j.title}</td>
                          <td className="py-2 pr-4">{j.employerCompany ?? "—"}</td>
                          <td className="py-2 pr-4"><Badge variant="secondary">{j.status}</Badge></td>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDate(j.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subs" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">All Subscriptions</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4">Role</th>
                        <th className="py-2 pr-4">Plan</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Renews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{s.name ?? `#${s.userId}`}</td>
                          <td className="py-2 pr-4">{s.email ?? "—"}</td>
                          <td className="py-2 pr-4">{s.role ?? "—"}</td>
                          <td className="py-2 pr-4"><Badge>{s.plan}</Badge></td>
                          <td className="py-2 pr-4"><Badge variant="secondary">{s.status}</Badge></td>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDate(s.currentPeriodEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
