import { useParams, useLocation } from "wouter";
import {
  useGetBooking, useUpdateBooking, useCreateAgreement, useGetMe, useListAgreements,
  useListMilestones, useCreateMilestone, useUpdateMilestone,
  useCreateReview, useNegotiateBooking, useGetTokenUsageMe,
  useGetMySubscription, useGetFreelancerProfile, useGetJobRequirement,
  type AgreementIndustry,
} from "@workspace/api-client-react";
import { formatRate, paymentTypeToRateType } from "@/lib/rateFormatUtils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, CheckCircle2, FileText, XCircle, Sparkles, ShieldCheck, Clock, DollarSign, Flag, Plus, Check, ArrowLeftRight, RefreshCw } from "lucide-react";
import ReviewPrompt from "@/components/ReviewPrompt";
import ReviewCard from "@/components/ReviewCard";
import { DebriefCard } from "@/components/bookings/DebriefCard";
import ProposalGeneratorDrawer, { AcceptedProposalBlock } from "@/components/ProposalGeneratorDrawer";
import { BookingMessageThread } from "@/components/messages/BookingMessageThread";
import RateSuggestionWidget from "@/components/RateSuggestionWidget";
import { dismissReviewPrompt, isReviewPromptDismissed } from "@/lib/reviewPromptStorage";
import { Link } from "wouter";
import { format } from "date-fns";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";
import { useState, useEffect } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useQueryClient } from "@tanstack/react-query";
import { VerifiedEmployerBadge } from "@/components/employer/VerifiedEmployerBadge";

const statusColors: Record<string, { bg: string, text: string, border: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  active: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  completed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

const milestoneColors: Record<string, { bg: string, text: string, border: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  completed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  approved: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
};

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const { data: tokenUsage } = useGetTokenUsageMe({
    query: { enabled: me?.role === "employer" } as any,
  });
  const { data: subscription } = useGetMySubscription({
    query: { enabled: me?.role === "employer" } as any,
  });
  const userPlan = subscription?.plan?.id ?? "employer_starter";
  const isEnterprise = userPlan === "employer_enterprise";

  const [industry, setIndustry] = useState<AgreementIndustry>("general");
  const [customClauses, setCustomClauses] = useState<string[]>([]);

  const clauseErrors = customClauses.map(c =>
    c.trim().length < 20 ? "Clause must be at least 20 characters"
    : c.length > 500 ? "Clause must be 500 characters or fewer"
    : null,
  );
  const hasClauseErrors = clauseErrors.some(e => e !== null);
  const { data: booking, isLoading, refetch } = useGetBooking(parseInt(id!), { query: { enabled: !!id } } as any);
  const jobReqId = booking?.jobRequirementId != null ? Number(booking.jobRequirementId) : NaN;
  const { data: jobRequirement } = useGetJobRequirement(jobReqId, {
    query: { enabled: Number.isFinite(jobReqId) } as any,
  });
  const bookingRateType = paymentTypeToRateType(booking?.paymentType ?? "hourly", jobRequirement?.rateType);
  const { data: agreements, refetch: refetchAgreements } = useListAgreements({ status: undefined }, { query: { enabled: !!booking } } as any);
  const updateBooking = useUpdateBooking();
  const createAgreement = useCreateAgreement();

  const bookingId = parseInt(id!);
  const { data: milestones, refetch: refetchMilestones } = useListMilestones(bookingId, { query: { enabled: !!booking } } as any);
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const createReview = useCreateReview();
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [isProposalDrawerOpen, setIsProposalDrawerOpen] = useState(false);
  const [acceptedProposal, setAcceptedProposal] = useState<string | null>(null);
  const isMdUp = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setReviewDismissed(isReviewPromptDismissed(bookingId));
  }, [bookingId]);

  useEffect(() => {
    if (!isMdUp) setIsProposalDrawerOpen(false);
  }, [isMdUp]);

  const negotiateBooking = useNegotiateBooking();
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterRate, setCounterRate] = useState("");
  const { data: counterFreelancer } = useGetFreelancerProfile(booking?.freelancerId ?? 0, {
    query: { enabled: !!booking?.freelancerId && counterOpen } as any,
  });

  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msDesc, setMsDesc] = useState("");
  const [msAmount, setMsAmount] = useState("");
  const [msDueDate, setMsDueDate] = useState("");

  const bookingAgreements = agreements?.data?.filter(a => a.bookingId === bookingId) ?? [];

  const monthlyTokenLimit = tokenUsage?.monthlyTokenLimit ?? null;
  const tokensUsed = tokenUsage?.tokensUsed ?? 0;
  const isAtLimit = !!monthlyTokenLimit && tokensUsed >= monthlyTokenLimit;
  const resetLabel = tokenUsage?.resetDate
    ? new Date(tokenUsage.resetDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleTokenLimitError = (error: any) => {
    const body = error?.body ?? error?.data ?? error?.response?.data;
    if (error?.status === 402 && body?.code === "TOKEN_LIMIT") {
      setLocation("/pricing");
      return true;
    }
    return false;
  };

  const handleAcceptRate = async () => {
    try {
      await negotiateBooking.mutateAsync({ id: bookingId, data: { action: "accept" } });
      toast({ title: "Rate accepted!", description: "You've agreed on the rate. You can now generate the agreement." });
      refetch();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.response?.data?.error ?? "Could not accept rate.", variant: "destructive" });
    }
  };

  const handleCounterRate = async () => {
    const rate = parseFloat(counterRate);
    if (isNaN(rate) || rate <= 0) { toast({ title: "Enter a valid rate", variant: "destructive" }); return; }
    try {
      await negotiateBooking.mutateAsync({ id: bookingId, data: { action: "counter", counterRate: rate } });
      toast({ title: "Counter-proposal sent", description: `You've proposed $${rate}. Awaiting the other party's response.` });
      setCounterOpen(false);
      setCounterRate("");
      refetch();
    } catch (err: any) {
      toast({ title: "Failed", description: err?.response?.data?.error ?? "Could not send counter.", variant: "destructive" });
    }
  };

  const handleStatusUpdate = async (status: "completed" | "cancelled") => {
    try {
      await updateBooking.mutateAsync({ id: bookingId, data: { status } });
      toast({ title: `Booking ${status}`, description: `The booking has been marked as ${status}.` });
      refetch();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleGenerateAgreement = async () => {
    try {
      const agreement = await createAgreement.mutateAsync({
        data: {
          bookingId,
          industry,
          ...(isEnterprise && customClauses.length > 0 ? { customClauses } : {}),
        },
      });
      toast({ title: "Agreement generated", description: "AI has drafted a legal agreement. Review and sign to activate the engagement." });
      refetchAgreements();
      setLocation(`/agreements/${agreement.id}`);
    } catch (error: any) {
      if (handleTokenLimitError(error)) return;
      toast({ title: "Failed to generate agreement", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleAddMilestone = async () => {
    if (!msTitle.trim()) return;
    try {
      await createMilestone.mutateAsync({
        id: bookingId,
        data: {
          title: msTitle,
          ...(msDesc ? { description: msDesc } : {}),
          ...(msAmount ? { amount: parseFloat(msAmount) } : {}),
          ...(msDueDate ? { dueDate: new Date(msDueDate).toISOString() } : {}),
        },
      });
      toast({ title: "Milestone added" });
      refetchMilestones();
      setMilestoneOpen(false);
      setMsTitle(""); setMsDesc(""); setMsAmount(""); setMsDueDate("");
    } catch {
      toast({ title: "Failed to add milestone", variant: "destructive" });
    }
  };

  const handleMilestoneStatusUpdate = async (msId: number, status: "completed" | "approved") => {
    try {
      await updateMilestone.mutateAsync({ id: msId, data: { status } });
      toast({ title: `Milestone ${status}` });
      refetchMilestones();
    } catch {
      toast({ title: "Failed to update milestone", variant: "destructive" });
    }
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    try {
      await createReview.mutateAsync({
        data: {
          bookingId,
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      toast({ title: "Review submitted. Thank you for your feedback!" });
      await refetch();
      qc.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
    } catch {
      toast({ title: "Failed to submit review", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="h-8 w-32 bg-muted rounded animate-pulse"></div>
        <div className="h-24 w-full bg-muted rounded animate-pulse"></div>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6"><div className="h-64 w-full bg-muted rounded animate-pulse"></div></div>
          <div className="space-y-6"><div className="h-48 w-full bg-muted rounded animate-pulse"></div></div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-dashed border-border">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Booking Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-sm font-light">The booking record you are looking for does not exist.</p>
        <Button asChild className="font-semibold shadow-sm"><Link href="/bookings">Back to Bookings</Link></Button>
      </div>
    );
  }

  const isEmployer = me?.role === "employer";
  const isFreelancer = me?.role === "freelancer";
  const isCancelled = booking.status === "cancelled";
  const isCompleted = booking.status === "completed";
  const hasAgreement = bookingAgreements.length > 0;
  const isNegotiating = (booking as any).negotiationStatus === "negotiating";
  const proposedRate = (booking as any).proposedRate as number | null;
  const lastProposedBy = (booking as any).lastProposedBy as string | null;
  const myRole = isEmployer ? "employer" : "freelancer";
  const isMyTurn = lastProposedBy !== myRole && (isEmployer || isFreelancer);
  const colors = statusColors[booking.status] || { bg: "bg-secondary", text: "text-muted-foreground", border: "border-border" };
  const showReviewPrompt =
    isEmployer &&
    isCompleted &&
    booking.review == null &&
    !reviewDismissed;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/bookings"><ArrowLeft className="h-4 w-4 mr-2" />Back to Bookings</Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border/50">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge className={`uppercase tracking-widest text-[10px] border shadow-sm ${colors.bg} ${colors.text} ${colors.border}`}>
              {booking.status}
            </Badge>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Booking #{booking.id}</span>
          </div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">
            {isEmployer ? booking.freelancerName : booking.employerName}
          </h1>
          {!isEmployer && <VerifiedEmployerBadge verificationLevel={booking.employerVerificationLevel} size="md" />}
          <p className="text-lg text-primary font-medium flex items-center gap-2">
            {booking.status === 'active' ? (
              <><ShieldCheck className="h-5 w-5" /> Exclusivity Locked</>
            ) : booking.status === 'cancelled' ? (
              <><XCircle className="h-5 w-5" /> Engagement Cancelled</>
            ) : booking.status === 'completed' ? (
              <><CheckCircle2 className="h-5 w-5" /> Engagement Complete</>
            ) : (
              <><Clock className="h-5 w-5" /> Exclusivity Pending</>
            )}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap md:flex-col md:items-end md:gap-2">
          {!isCancelled && (
            <a
              href={buildGoogleCalendarUrl({
                title: `TalentLock: ${isEmployer ? booking.freelancerName : booking.employerName}`,
                startDate: booking.startDate,
                endDate: booking.endDate,
                details: `TalentLock Booking #${booking.id}\nPayment: ${booking.paymentType}${booking.rate ? ` · $${booking.rate}` : ""}\n\n${window.location.href}`,
              })}
              target="_blank" rel="noreferrer"
            >
              <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-border hover:bg-secondary font-medium w-full" style={{ color: "#4285F4" }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18z"/></svg>
                Calendar
              </Button>
            </a>
          )}
          {isEmployer && booking.status === "active" && (
            <Button variant="outline" size="sm" className="h-9 font-medium shadow-sm border-green-200 text-green-700 hover:bg-green-50 w-full" onClick={() => handleStatusUpdate("completed")}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Mark Complete
            </Button>
          )}
          {isFreelancer && booking.status === "pending" && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 font-medium shadow-sm w-full"
              onClick={() => setIsProposalDrawerOpen(true)}
            >
              <Sparkles className="h-4 w-4 mr-1 text-gold" />
              Write proposal
            </Button>
          )}
          {booking.status === "pending" && (
            <Button variant="outline" size="sm" className="h-9 font-medium shadow-sm border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive w-full" onClick={() => handleStatusUpdate("cancelled")}>
              <XCircle className="h-4 w-4 mr-2" />Cancel Booking
            </Button>
          )}
          {booking.review != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
              <Check className="h-3 w-3 text-green-600" /> Reviewed
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <Tabs defaultValue="messages">
          <TabsList>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>
          <TabsContent value="messages" className="mt-3">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <BookingMessageThread bookingId={booking.id} />
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Rate Negotiation Panel */}
      {!isCancelled && isNegotiating && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-6 flex items-start gap-4">
          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <ArrowLeftRight className="h-5 w-5 text-blue-700" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="font-bold text-blue-900 text-lg">Rate Negotiation in Progress</h3>
                <p className="text-sm text-blue-700 mt-0.5">
                  {lastProposedBy === "employer" ? "Employer" : "Freelancer"} proposes:{" "}
                  <span className="font-bold text-blue-900 text-base">
                    {proposedRate != null ? formatRate(proposedRate, bookingRateType) : "—"}
                  </span>
                </p>
              </div>
              {isMyTurn ? (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm" onClick={handleAcceptRate}
                    disabled={negotiateBooking.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold shadow-sm gap-1.5 h-9"
                  >
                    <Check className="h-4 w-4" />Accept Rate
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setCounterRate(String(proposedRate ?? "")); setCounterOpen(true); }}
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 font-semibold h-9 gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />Counter
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-blue-700 font-medium bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200">
                  <Clock className="h-4 w-4" />Awaiting their response…
                </div>
              )}
            </div>
            <p className="text-xs text-blue-700/70">The agreement can only be generated once both parties agree on the rate.</p>
          </div>
        </div>
      )}

      {/* Rate Agreed Banner */}
      {!isCancelled && !isNegotiating && booking.rate && !hasAgreement && (
        <div className="rounded-xl border border-green-200 bg-green-50/60 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Rate agreed: <span className="font-bold">{formatRate(Number(booking.rate), bookingRateType)}</span>. You can now generate the legal agreement.
          </p>
        </div>
      )}

      {isEmployer && !hasAgreement && !isCancelled && !isNegotiating && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-6 flex items-start gap-4">
          <div className="h-10 w-10 bg-gold/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-primary mb-1">Generate Legal Agreement</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-2xl">
              Rate agreed. TalentLock AI can now generate a binding legal agreement encompassing exclusivity, scope, and payment terms ready for signature.
            </p>

            <div className="space-y-4 mb-4 max-w-xl">
              <div>
                <Label className="text-sm font-medium">Agreement Template</Label>
                <Select value={industry} onValueChange={(v) => setIndustry(v as AgreementIndustry)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="software_development">Software Development</SelectItem>
                    <SelectItem value="design_creative">Design &amp; Creative</SelectItem>
                    <SelectItem value="marketing_content">Marketing &amp; Content</SelectItem>
                    <SelectItem value="consulting_strategy">Consulting &amp; Strategy</SelectItem>
                    <SelectItem value="data_analytics">Data &amp; Analytics</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Includes industry-specific standard clauses in the agreement.
                </p>
              </div>

              {isEnterprise && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Custom Clauses{" "}
                      <span className="text-xs text-muted-foreground font-normal">(optional — up to 5)</span>
                    </Label>
                    {customClauses.length > 0 && (
                      <span className="text-xs text-muted-foreground">({customClauses.length} of 5)</span>
                    )}
                  </div>
                  {customClauses.map((clause, idx) => (
                    <div key={idx} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600">Clause {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${clause.length > 480 ? "text-red-500" : "text-muted-foreground"}`}>
                            {clause.length}/500
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCustomClauses(prev => prev.filter((_, i) => i !== idx))}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={clause}
                        onChange={(e) => {
                          const next = [...customClauses];
                          next[idx] = e.target.value;
                          setCustomClauses(next);
                        }}
                        rows={3}
                      />
                      {clauseErrors[idx] && (
                        <p className="text-xs text-red-500">{clauseErrors[idx]}</p>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={customClauses.length >= 5}
                    onClick={() => setCustomClauses(prev => [...prev, ""])}
                  >
                    + Add Custom Clause
                  </Button>
                </div>
              )}
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">
                    <Button
                      onClick={handleGenerateAgreement}
                      disabled={createAgreement.isPending || isAtLimit || hasClauseErrors}
                      className="font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {createAgreement.isPending ? "Drafting Agreement..." : "Generate AI Agreement"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {hasClauseErrors && (
                  <TooltipContent>Fix clause errors before generating</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {isAtLimit && resetLabel && (
              <p className="text-sm text-muted-foreground mt-3">
                AI Agreement Generation is paused — your monthly token limit has been reached.
                Tokens reset on {resetLabel}.{" "}
                <Link href="/pricing" className="text-primary underline-offset-4 hover:underline">
                  Upgrade your plan →
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Counter-proposal Dialog */}
      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="font-serif text-xl">Counter-Propose Rate</DialogTitle>
            <DialogDescription>Enter your proposed rate. The other party will be notified.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Proposed Rate</Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">$</span>
                <Input
                  type="number" min="1" step="0.01" autoFocus
                  value={counterRate} onChange={e => setCounterRate(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCounterRate()}
                  className="pl-7 h-11 text-lg font-semibold"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-muted-foreground">Payment type: <span className="font-medium capitalize">{booking.paymentType}</span></p>
            </div>
            {isEmployer && isNegotiating && counterFreelancer && (
              <RateSuggestionWidget
                freelancerId={String(booking.freelancerId)}
                fieldOfWork={counterFreelancer.fieldOfWork}
                jobRequirementId={booking.jobRequirementId != null ? String(booking.jobRequirementId) : undefined}
                bookingId={String(booking.id)}
                paymentType={booking.paymentType as "hourly" | "daily" | "fixed"}
                rateType={jobRequirement?.rateType}
                proposedRate={counterRate}
                onUseSuggestion={(rate) => setCounterRate(String(rate))}
                userPlan={userPlan}
              />
            )}
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setCounterOpen(false)}>Cancel</Button>
            <Button onClick={handleCounterRate} disabled={negotiateBooking.isPending || !counterRate} className="font-semibold">
              {negotiateBooking.isPending ? "Sending…" : "Send Counter-Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {/* Milestones */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flag className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="font-serif text-xl">Milestones</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Track deliverables and progress</CardDescription>
                  </div>
                </div>
                {!isCancelled && (
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setMilestoneOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />Add
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {milestones && milestones.length > 0 ? (
                <div className="space-y-3">
                  {milestones.map((ms) => {
                    const c = milestoneColors[ms.status] || { bg: "bg-secondary", text: "text-muted-foreground", border: "border-border" };
                    return (
                      <div key={ms.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-secondary/20 gap-3 hover:border-primary/20 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-foreground truncate">{ms.title}</span>
                            <Badge className={`text-[10px] uppercase tracking-widest border ${c.bg} ${c.text} ${c.border} shrink-0`}>{ms.status}</Badge>
                          </div>
                          {ms.description && <p className="text-xs text-muted-foreground">{ms.description}</p>}
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                            {ms.amount != null && <span className="font-medium text-foreground">${Number(ms.amount).toLocaleString()}</span>}
                            {ms.dueDate && <span>Due {format(new Date(ms.dueDate), "MMM d, yyyy")}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {ms.status === "pending" && !isEmployer && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleMilestoneStatusUpdate(ms.id, "completed")}>
                              <Check className="h-3 w-3" />Complete
                            </Button>
                          )}
                          {ms.status === "completed" && isEmployer && (
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-green-200 text-green-700 hover:bg-green-50"
                              onClick={() => handleMilestoneStatusUpdate(ms.id, "approved")}>
                              <CheckCircle2 className="h-3 w-3" />Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-10 text-center flex flex-col items-center">
                  <Flag className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No milestones yet</p>
                  <p className="text-xs text-muted-foreground">Add milestones to track deliverables and payments.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {isCompleted && (
            <DebriefCard
              bookingId={booking.id}
              hasDebrief={booking.hasDebrief ?? false}
              debriefGeneratedAt={booking.debriefGeneratedAt ?? null}
              userRole={isEmployer ? "employer" : "freelancer"}
              employerPlanId={isEmployer ? userPlan : undefined}
              refetchBooking={async () => {
                const r = await refetch();
                return { data: r.data };
              }}
            />
          )}

          {showReviewPrompt && (
            <ReviewPrompt
              bookingId={bookingId}
              freelancerName={booking.freelancerName ?? "this freelancer"}
              onSubmit={handleSubmitReview}
              onDismiss={() => {
                dismissReviewPrompt(bookingId);
                setReviewDismissed(true);
              }}
              isSubmitting={createReview.isPending}
            />
          )}

          {isEmployer && booking.review != null && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Your Review</h3>
              <ReviewCard review={booking.review} />
            </div>
          )}

          {/* Legal Agreements */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="font-serif text-xl">Legal Contracts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {hasAgreement ? (
                <div className="space-y-4">
                  {bookingAgreements.map(a => (
                    <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-xl border border-border bg-secondary/20 gap-4 hover:border-primary/30 transition-colors">
                      <div>
                        <div className="text-sm font-bold text-foreground mb-1">Agreement #{a.id}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-border/50 bg-background">
                            {a.status?.replace(/_/g, " ")}
                          </Badge>
                          {a.freelancerSignedAt && a.employerSignedAt && (
                            <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Fully signed
                            </span>
                          )}
                        </div>
                      </div>
                      <Button className="shadow-sm font-semibold sm:w-auto w-full" variant={(!a.freelancerSignedAt || !a.employerSignedAt) ? "default" : "secondary"} asChild>
                        <Link href={`/agreements/${a.id}`}>
                          {!a.freelancerSignedAt || !a.employerSignedAt ? "Review & Sign" : "View Contract"}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center flex flex-col items-center">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">No Agreements Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {isCancelled ? "This booking was cancelled. No contracts can be generated." : "A formal agreement must be signed by both parties to activate this engagement."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {(booking as { message?: string | null }).message && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Message from employer:</p>
              <p className="text-sm text-slate-700 italic">&ldquo;{(booking as { message?: string | null }).message}&rdquo;</p>
            </div>
          )}

          {acceptedProposal && (
            <AcceptedProposalBlock proposal={acceptedProposal} />
          )}

          {booking.notes && (
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
                <CardTitle className="font-serif text-xl">Engagement Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{booking.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm border-border bg-card overflow-hidden sticky top-24">
            <div className="h-1.5 w-full bg-primary"></div>
            <CardHeader className="pb-4 bg-primary/5">
              <CardTitle className="font-serif text-xl">Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col gap-5">
                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-secondary/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Timeline</p>
                    <p className="font-semibold text-foreground text-sm">
                      {format(new Date(booking.startDate), "MMM d, yyyy")}<br />
                      <span className="text-muted-foreground font-normal text-xs block mt-0.5">to {format(new Date(booking.endDate), "MMM d, yyyy")}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-secondary/50 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Compensation</p>
                    <p className="font-semibold text-foreground capitalize">
                      {booking.paymentType}
                      {booking.rate && <span className="text-muted-foreground font-normal text-sm ml-1">· ${booking.rate}</span>}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Milestone Dialog */}
      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="font-serif text-xl">Add Milestone</DialogTitle>
            <DialogDescription>Track a deliverable or payment checkpoint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Title *</Label>
              <Input placeholder="e.g. Design mockups delivered" value={msTitle} onChange={e => setMsTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Description <span className="font-normal opacity-60 lowercase">optional</span></Label>
              <Textarea placeholder="Describe the deliverable..." value={msDesc} onChange={e => setMsDesc(e.target.value)} className="resize-none h-20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Amount ($) <span className="font-normal opacity-60 lowercase">optional</span></Label>
                <Input type="number" placeholder="0.00" value={msAmount} onChange={e => setMsAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Due Date <span className="font-normal opacity-60 lowercase">optional</span></Label>
                <Input type="date" value={msDueDate} onChange={e => setMsDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button variant="ghost" onClick={() => setMilestoneOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMilestone} disabled={createMilestone.isPending || !msTitle.trim()}>
              {createMilestone.isPending ? "Adding..." : "Add Milestone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {booking && (
        <ProposalGeneratorDrawer
          bookingId={String(booking.id)}
          isOpen={isProposalDrawerOpen}
          onClose={() => setIsProposalDrawerOpen(false)}
          onAccept={(proposal) => setAcceptedProposal(proposal)}
        />
      )}

    </div>
  );
}
