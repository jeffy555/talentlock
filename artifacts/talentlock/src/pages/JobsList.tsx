import { useGetMe, useGetMyEmployerProfile, useListJobRequirements } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { VerifiedEmployerBadge } from "@/components/employer/VerifiedEmployerBadge";
import { PaginationControls } from "@/components/PaginationControls";
import { EngagementListToolbar } from "@/components/lists/EngagementListToolbar";
import { useEngagementListQueryState } from "@/hooks/useEngagementListQueryState";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

const PAGE_SIZE = 10;

const JOB_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "filled", label: "Filled" },
  { value: "closed", label: "Closed" },
];

export default function JobsList() {
  const { data: user } = useGetMe();
  const isEmployer = user?.role === "employer";
  const {
    search, status, page, apiStatus, apiQ,
    onSearchChange, onStatusChange, onPageChange, onClear,
  } = useEngagementListQueryState();

  const { data: myEmployerProfile, isLoading: profileLoading } = useGetMyEmployerProfile({
    query: { enabled: isEmployer } as any,
  });

  const hasFilters = search.trim().length > 0 || (status !== "" && status !== "all");

  // Freelancer browse defaults to open; employer sees own jobs. Status chip overrides.
  const effectiveStatus = apiStatus ?? (isEmployer ? undefined : "open");

  const listParams =
    isEmployer && !myEmployerProfile
      ? undefined
      : {
          ...(isEmployer && myEmployerProfile ? { employerId: myEmployerProfile.id } : {}),
          ...(effectiveStatus ? { status: effectiveStatus as "open" | "filled" | "closed" } : {}),
          page,
          pageSize: PAGE_SIZE,
          q: apiQ,
        };

  const { data, isLoading: jobsLoading } = useListJobRequirements(listParams, {
    query: { enabled: !isEmployer || !!myEmployerProfile?.id } as any,
  });

  const jobs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const isLoading = isEmployer ? profileLoading || jobsLoading : jobsLoading;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Job Requirements</h1>
          <p className="text-muted-foreground mt-1 font-light max-w-xl">
            {isEmployer
              ? "Manage your open roles and track AI-matched candidates."
              : "Browse exclusive, verified engagements looking for premium talent."}
          </p>
        </div>
        {isEmployer && (
          <Button asChild className="shadow-sm font-semibold gap-2">
            <Link href="/jobs/new">
              <Plus className="h-4 w-4 text-gold" />
              Post Requirement
            </Link>
          </Button>
        )}
      </div>

      <EngagementListToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by title or description…"
        status={status}
        statusOptions={JOB_STATUS_OPTIONS}
        onStatusChange={onStatusChange}
        onClear={onClear}
        resultSummary={isLoading ? undefined : `${total} matching`}
      />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-[280px]">
              <CardHeader className="pb-4"><div className="h-6 w-3/4 bg-muted rounded mb-2" /></CardHeader>
              <CardContent className="space-y-4"><div className="h-20 w-full bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Briefcase className="text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="font-serif">
              {hasFilters ? "No jobs match your search or filters" : "No roles found"}
            </EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? "Try a different keyword or clear filters."
                : isEmployer
                  ? "You haven't posted any job requirements yet. Describe your needs to let our AI find the perfect match."
                  : "There are currently no open requirements matching your profile. Check back soon."}
            </EmptyDescription>
          </EmptyHeader>
          {hasFilters ? (
            <EmptyContent>
              <Button variant="outline" onClick={onClear}>Clear filters</Button>
            </EmptyContent>
          ) : isEmployer ? (
            <EmptyContent>
              <Button asChild className="font-semibold shadow-sm">
                <Link href="/jobs/new">Post your first requirement</Link>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job, index) => (
            <Card
              key={job.id}
              className="group flex flex-col hover:shadow-lg transition-all duration-300 border-border bg-card relative overflow-hidden animate-fade-in"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gold/50 opacity-0 group-hover:opacity-100 transition-opacity" />

              <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-3">
                  <Badge
                    variant={job.status === "open" ? "default" : "secondary"}
                    className={job.status === "open" ? "bg-green-50 text-green-700 border-green-200 uppercase tracking-widest text-[10px]" : "uppercase tracking-widest text-[10px]"}
                  >
                    {job.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {format(new Date(job.createdAt), "MMM d")}
                  </span>
                </div>
                <CardTitle className="text-xl font-serif leading-snug line-clamp-2">{job.title}</CardTitle>
                <CardDescription className="text-primary font-medium text-sm mt-2">{job.fieldOfWork}</CardDescription>
                {!isEmployer && (
                  <VerifiedEmployerBadge verificationLevel={job.employerVerificationLevel} size="sm" />
                )}
              </CardHeader>

              <CardContent className="flex-1 space-y-5">
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {job.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {job.requiredSkills.slice(0, 3).map((skill, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-secondary/50 font-medium border-border/50 text-xs px-2 py-0.5 rounded-md">
                      {skill}
                    </Badge>
                  ))}
                  {job.requiredSkills.length > 3 && (
                    <Badge variant="secondary" className="bg-secondary/50 font-medium border-border/50 text-xs px-2 py-0.5 rounded-md text-muted-foreground">
                      +{job.requiredSkills.length - 3}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-foreground pt-3 border-t border-border/50">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Experience</div>
                    <div className="font-semibold">{job.minExperience}+ yrs</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Budget</div>
                    <div className="font-semibold">{job.budget ? `$${job.budget}` : "TBD"}</div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-4 border-t border-border mt-auto bg-muted/10">
                <Button asChild className="w-full justify-between group/btn bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground shadow-none">
                  <Link href={`/jobs/${job.id}`}>
                    <span className="font-semibold">View Details</span>
                    <ArrowRight className="h-4 w-4 opacity-50 group-hover/btn:translate-x-1 transition-all" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={isLoading}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
