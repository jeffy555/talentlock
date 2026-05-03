import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetJobRequirement,
  useGetMe,
  useGetMyEmployerProfile,
  useDeleteJobRequirement,
  useExpressJobInterest,
  useGetMyJobInterest,
  useListJobInterests,
  getGetMyJobInterestQueryKey,
  getListJobInterestsQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calendar, DollarSign, Clock, Trash2, ShieldCheck, Zap, Check, Users, MessageSquare } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useGetMe();
  const { data: job, isLoading } = useGetJobRequirement(id, { query: { enabled: !!id } as any });
  const deleteJob = useDeleteJobRequirement();

  const isFreelancer = user?.role === "freelancer";
  const { data: myEmployerProfile } = useGetMyEmployerProfile({
    query: { enabled: user?.role === "employer" } as any,
  });
  const isOwner = user?.role === "employer" && !!myEmployerProfile && job?.employerId === myEmployerProfile.id;

  const { data: myInterest } = useGetMyJobInterest(id, {
    query: { enabled: !!id && isFreelancer } as any,
  });
  const { data: interests } = useListJobInterests(id, {
    query: { enabled: !!id && !!isOwner } as any,
  });

  const expressInterest = useExpressJobInterest();
  const [interestOpen, setInterestOpen] = useState(false);
  const [interestMessage, setInterestMessage] = useState("");

  const handleExpressInterest = async () => {
    try {
      await expressInterest.mutateAsync({
        id,
        data: { message: interestMessage.trim() || null },
      });
      toast({
        title: "Interest sent",
        description: "The employer has been notified of your interest.",
      });
      setInterestOpen(false);
      setInterestMessage("");
      queryClient.invalidateQueries({ queryKey: getGetMyJobInterestQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListJobInterestsQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const description =
        status === 409
          ? "You've already expressed interest in this role."
          : err?.response?.data?.error ?? "Could not send interest. Please try again.";
      toast({ title: "Couldn't send interest", description, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="h-8 w-32 bg-muted rounded animate-pulse"></div>
        <div className="h-20 w-3/4 bg-muted rounded animate-pulse"></div>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6"><div className="h-64 w-full bg-muted rounded animate-pulse"></div></div>
          <div className="space-y-6"><div className="h-48 w-full bg-muted rounded animate-pulse"></div></div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-dashed border-border">
          <Trash2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Requirement Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-sm font-light">The job you are looking for does not exist or has been removed.</p>
        <Button asChild className="font-semibold shadow-sm">
          <Link href="/jobs">Back to Job Board</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync({ id });
      toast({ title: "Requirement Removed", description: "The job requirement has been permanently deleted." });
      setLocation("/jobs");
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete requirement.", variant: "destructive" });
    }
  };

  const alreadyExpressed = !!myInterest?.expressed;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/jobs"><ArrowLeft className="h-4 w-4 mr-2" />Back to Jobs</Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border/50">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <Badge
              className={job.status === "open" ? "bg-green-50 text-green-700 border-green-200 uppercase tracking-widest text-[10px]" : "uppercase tracking-widest text-[10px] border-border"}
              variant={job.status === "open" ? "default" : "secondary"}
            >
              {job.status}
            </Badge>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Posted {format(new Date(job.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">{job.title}</h1>
          <p className="text-lg text-primary font-medium">{job.fieldOfWork}</p>
        </div>

        {isOwner && (
          <div className="flex-shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive shadow-sm">
                  <Trash2 className="mr-2 h-4 w-4" /> Remove Role
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="sm:max-w-[425px]">
                <AlertDialogHeader className="pb-4 border-b">
                  <AlertDialogTitle className="font-serif text-2xl text-destructive">Remove Requirement</AlertDialogTitle>
                  <AlertDialogDescription className="pt-2">
                    This action cannot be undone. This will permanently delete the job requirement and remove it from the talent pool matching.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="pt-4">
                  <AlertDialogCancel className="font-semibold">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold shadow-sm">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-foreground">Role Description</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed bg-card p-6 md:p-8 rounded-xl border border-border shadow-sm">
              <p className="whitespace-pre-wrap">{job.description}</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-foreground">Required Expertise</h2>
            <div className="bg-card p-6 md:p-8 rounded-xl border border-border shadow-sm flex flex-wrap gap-2">
              {job.requiredSkills.map((skill, idx) => (
                <Badge key={idx} variant="secondary" className="px-3.5 py-1.5 bg-secondary/50 text-secondary-foreground hover:bg-secondary font-medium border-border/50 text-sm">
                  {skill}
                </Badge>
              ))}
            </div>
          </section>

          {isOwner && job.status === "open" && (
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-6 flex items-start gap-4">
              <div className="h-10 w-10 bg-gold/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-gold" />
              </div>
              <div>
                <h3 className="font-bold text-primary mb-1">AI Talent Matching Active</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  TalentLock AI is continuously scanning our verified network to find the best professionals for this role.
                </p>
                <Button asChild variant="outline" className="border-gold/30 text-primary hover:bg-gold/10 font-semibold">
                  <Link href="/ai-match">View AI Matches</Link>
                </Button>
              </div>
            </div>
          )}

          {isOwner && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Interested Talent
                </h2>
                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/20 font-semibold">
                  {interests?.length ?? 0} {interests?.length === 1 ? "candidate" : "candidates"}
                </Badge>
              </div>
              {!interests || interests.length === 0 ? (
                <div className="bg-card p-8 rounded-xl border border-dashed border-border text-center">
                  <div className="h-12 w-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No freelancers have expressed interest yet. The AI matcher is still surfacing this role to qualified talent.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {interests.map((interest) => (
                    <div
                      key={interest.id}
                      className="bg-card p-5 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row gap-4 sm:items-start"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/freelancers/${interest.freelancerId}`}
                            className="font-semibold text-foreground hover:text-primary"
                          >
                            {interest.freelancerName ?? "Freelancer"}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            • {format(new Date(interest.createdAt), "MMM d")}
                          </span>
                        </div>
                        {interest.freelancerTagline && (
                          <p className="text-sm text-muted-foreground mb-2">{interest.freelancerTagline}</p>
                        )}
                        {interest.message && (
                          <div className="mt-2 flex gap-2 text-sm bg-muted/30 rounded-lg p-3 border-l-2 border-gold/40">
                            <MessageSquare className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
                            <p className="text-muted-foreground italic leading-relaxed">{interest.message}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex gap-2">
                        <Button asChild variant="outline" size="sm" className="font-semibold">
                          <Link href={`/freelancers/${interest.freelancerId}`}>View Profile</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-lg border-border bg-card sticky top-24 overflow-hidden">
            <div className="h-1.5 w-full bg-primary"></div>
            <CardHeader className="pb-4 bg-primary/5">
              <CardTitle className="font-serif text-xl">Engagement Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col gap-5">
                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-secondary/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Seniority</p>
                    <p className="font-semibold text-foreground">{job.minExperience}+ Years Experience</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-secondary/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Compensation</p>
                    <p className="font-semibold text-foreground capitalize">{job.paymentType} {job.budget ? `— $${job.budget}` : ""}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-secondary/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Timeline</p>
                    <p className="font-semibold text-foreground text-sm">
                      {format(new Date(job.startDate), "MMM d, yyyy")}<br/>
                      <span className="text-muted-foreground font-normal text-xs block mt-0.5">to {format(new Date(job.endDate), "MMM d, yyyy")}</span>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>

            {isFreelancer && job.status === "open" && (
              <CardFooter className="pt-4 border-t border-border/50 bg-muted/10">
                {alreadyExpressed ? (
                  <Button
                    disabled
                    className="w-full h-11 shadow-sm font-semibold bg-green-50 text-green-700 hover:bg-green-50 border border-green-200"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Interest Sent
                  </Button>
                ) : (
                  <Dialog open={interestOpen} onOpenChange={setInterestOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="w-full h-11 shadow font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                        data-testid="button-express-interest"
                      >
                        Express Interest
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                      <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Express Interest</DialogTitle>
                        <DialogDescription className="pt-1">
                          Send a quick note to the employer. They'll be notified that you're interested in this role.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                          Message (optional)
                        </label>
                        <Textarea
                          value={interestMessage}
                          onChange={(e) => setInterestMessage(e.target.value)}
                          placeholder="Briefly mention why you're a great fit, your availability, or any questions about the role…"
                          rows={5}
                          maxLength={1000}
                          data-testid="textarea-interest-message"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                          {interestMessage.length}/1000
                        </p>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setInterestOpen(false)} className="font-semibold">
                          Cancel
                        </Button>
                        <Button
                          onClick={handleExpressInterest}
                          disabled={expressInterest.isPending}
                          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow"
                          data-testid="button-confirm-interest"
                        >
                          {expressInterest.isPending ? "Sending…" : "Send Interest"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
