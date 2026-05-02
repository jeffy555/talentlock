import { useGetMe, useListJobRequirements } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Calendar, DollarSign, Plus } from "lucide-react";
import { format } from "date-fns";

export default function JobsList() {
  const { data: user } = useGetMe();
  const isEmployer = user?.role === "employer";
  
  // If employer, maybe they want to see their own jobs. For now list all open jobs or their jobs.
  const params = isEmployer ? { employerId: user?.id } : { status: "open" };
  const { data: jobs, isLoading } = useListJobRequirements(params);

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="animate-pulse flex flex-col items-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-muted-foreground">Loading job requirements...</p></div></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Requirements</h1>
          <p className="text-muted-foreground mt-1">
            {isEmployer ? "Manage your open roles and requirements." : "Browse exclusive open engagements."}
          </p>
        </div>
        {isEmployer && (
          <Button asChild>
            <Link href="/jobs/new">
              <Plus className="mr-2 h-4 w-4" />
              Post Requirement
            </Link>
          </Button>
        )}
      </div>

      {!jobs || jobs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center bg-secondary/20">
          <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No jobs found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mb-6">
            {isEmployer ? "You haven't posted any job requirements yet." : "There are currently no open requirements."}
          </p>
          {isEmployer && (
            <Button asChild variant="outline">
              <Link href="/jobs/new">Post your first requirement</Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Card key={job.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={job.status === "open" ? "default" : "secondary"}>
                    {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(job.createdAt), "MMM d, yyyy")}
                  </span>
                </div>
                <CardTitle className="line-clamp-2">{job.title}</CardTitle>
                <CardDescription className="text-primary font-medium">{job.fieldOfWork}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {job.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {job.requiredSkills.slice(0, 3).map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="bg-secondary/50">{skill}</Badge>
                  ))}
                  {job.requiredSkills.length > 3 && (
                    <Badge variant="outline" className="bg-secondary/50">+{job.requiredSkills.length - 3}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{job.minExperience} yrs exp</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span>{job.budget ? `$${job.budget}` : "Unspecified"}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border mt-auto">
                <Button asChild className="w-full" variant="secondary">
                  <Link href={`/jobs/${job.id}`}>View Details</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
