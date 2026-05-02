import { useRoute, Link, useLocation } from "wouter";
import { useGetJobRequirement, useGetMe, useDeleteJobRequirement } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, DollarSign, Building, Clock, MapPin, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user } = useGetMe();
  const { data: job, isLoading } = useGetJobRequirement(id, { query: { enabled: !!id } as any });
  const deleteJob = useDeleteJobRequirement();

  const isOwner = user?.role === "employer" && job?.employerId === user?.id;

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="animate-pulse flex flex-col items-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-muted-foreground">Loading job details...</p></div></div>;
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold mb-2">Requirement Not Found</h2>
        <p className="text-muted-foreground mb-6">The job you are looking for does not exist or was removed.</p>
        <Button asChild>
          <Link href="/jobs">Back to Jobs</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync({ id });
      toast({ title: "Requirement Deleted", description: "The job requirement has been removed." });
      setLocation("/jobs");
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete requirement.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href="/jobs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
              <Badge variant={job.status === "open" ? "default" : "secondary"}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </Badge>
            </div>
            <p className="text-primary font-medium mt-1">{job.fieldOfWork}</p>
          </div>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the job requirement.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="whitespace-pre-wrap">{job.description}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {job.requiredSkills.map((skill, idx) => (
                  <Badge key={idx} variant="secondary" className="px-3 py-1 text-sm">{skill}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Engagement Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Experience</p>
                  <p className="text-sm text-muted-foreground">{job.minExperience}+ years</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Budget & Type</p>
                  <p className="text-sm text-muted-foreground capitalize">{job.paymentType} {job.budget ? `— $${job.budget}` : ""}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Timeline</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(job.startDate), "MMM d, yyyy")} to {format(new Date(job.endDate), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
            </CardContent>
            {user?.role === "freelancer" && job.status === "open" && (
              <CardFooter className="pt-4 border-t border-border">
                <Button className="w-full">Express Interest</Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
