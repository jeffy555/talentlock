import { useGetMe, useListJobRequirements } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Calendar, DollarSign, Plus, ArrowRight, Building2 } from "lucide-react";
import { format } from "date-fns";

export default function JobsList() {
  const { data: user } = useGetMe();
  const isEmployer = user?.role === "employer";
  
  const params = isEmployer ? { employerId: user?.id } : { status: "open" };
  const { data: jobs, isLoading } = useListJobRequirements(params);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
            <div className="h-5 w-72 bg-muted rounded animate-pulse"></div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-[280px]">
              <CardHeader className="pb-4"><div className="h-6 w-3/4 bg-muted rounded mb-2"></div></CardHeader>
              <CardContent className="space-y-4"><div className="h-20 w-full bg-muted rounded"></div></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
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

      {!jobs || jobs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-24 text-center bg-card shadow-sm border-border border-dashed">
          <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Briefcase className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-serif font-bold text-foreground">No roles found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm font-light mb-8">
            {isEmployer 
              ? "You haven't posted any job requirements yet. Describe your needs to let our AI find the perfect match." 
              : "There are currently no open requirements matching your profile. Check back soon."}
          </p>
          {isEmployer && (
            <Button asChild className="font-semibold shadow-sm">
              <Link href="/jobs/new">Post your first requirement</Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job, index) => (
            <Card 
              key={job.id} 
              className="group flex flex-col hover:shadow-lg transition-all duration-300 border-border bg-card relative overflow-hidden animate-fade-in"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gold/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
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
    </div>
  );
}
