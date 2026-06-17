import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetFreelancerProfile, useGetMe, useCreateBooking, useCreateMeeting,
  useToggleSaveFreelancer, useCheckFreelancerSaved,
  useListFreelancerPortfolio, useGetMySubscription, useGetJobRequirement,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BadgeCheck, Briefcase, Calendar, Clock, DollarSign, GraduationCap, Lock, Star, ExternalLink, Video, Heart, Image, Info, ShieldCheck } from "lucide-react";
import { formatRate, paymentTypeToRateType, profileDefaultRateType } from "@/lib/rateFormatUtils";
import { EDUCATION_TYPE_LABELS } from "@/components/onboarding/TeachingDetailsSection";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";
import { format } from "date-fns";
import VerificationBadge from "@/components/VerificationBadge";
import StarRating from "@/components/StarRating";
import ReviewList from "@/components/ReviewList";
import { resolveVerificationLevel, isVerifiedLevel } from "@/lib/verification";
import type { FreelancerProfileDetail } from "@workspace/api-client-react";
import MatchExplanationCard from "@/components/MatchExplanationCard";
import RateSuggestionWidget from "@/components/RateSuggestionWidget";
import { AvailabilitySection } from "@/components/availability/AvailabilitySection";
import { resolveFreelancerDetailJobId } from "@/lib/aiMatchJobContext";

/** Convert an ISO date/datetime to a `YYYY-MM-DD` value for `<input type="date">` without timezone drift. */
function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function FreelancerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const jobId = resolveFreelancerDetailJobId(search);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: subscription } = useGetMySubscription({
    query: { enabled: me?.role === "employer" } as any,
  });
  const userPlan = subscription?.plan?.id ?? "employer_starter";
  const { data: freelancer, isLoading } = useGetFreelancerProfile(parseInt(id!), { query: { enabled: !!id } as any });
  const createBooking = useCreateBooking();
  const createMeeting = useCreateMeeting();

  const freelancerId = parseInt(id!);
  const { data: savedData, refetch: refetchSaved } = useCheckFreelancerSaved(freelancerId, { query: { enabled: !!id } } as any);
  const toggleSave = useToggleSaveFreelancer();
  const { data: portfolio } = useListFreelancerPortfolio(freelancerId, { query: { enabled: !!id } } as any);

  const isSaved = savedData?.saved ?? false;

  const [bookingOpen, setBookingOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentType, setPaymentType] = useState("hourly");
  const [proposedRate, setProposedRate] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [confirmedBookingId, setConfirmedBookingId] = useState<number | null>(null);

  const jobIdNum = jobId ? parseInt(jobId, 10) : NaN;
  const { data: jobRequirement } = useGetJobRequirement(jobIdNum, {
    query: { enabled: me?.role === "employer" && Number.isFinite(jobIdNum) } as any,
  });

  const prefilledJobRef = useRef<number | null>(null);
  useEffect(() => {
    if (!jobRequirement) return;
    if (prefilledJobRef.current === (jobRequirement as any).id) return;
    prefilledJobRef.current = (jobRequirement as any).id;
    setStartDate((prev) => prev || toDateInputValue(jobRequirement.startDate));
    setEndDate((prev) => prev || toDateInputValue(jobRequirement.endDate));
    if (jobRequirement.paymentType === "hourly" || jobRequirement.paymentType === "daily") {
      setPaymentType(jobRequirement.paymentType);
    }
  }, [jobRequirement]);

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("09:00");
  const [meetingDuration, setMeetingDuration] = useState("30");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [confirmedMeetingId, setConfirmedMeetingId] = useState<number | null>(null);

  const handleToggleSave = async () => {
    try {
      await toggleSave.mutateAsync({ id: freelancerId });
      refetchSaved();
      queryClient.invalidateQueries({ queryKey: ["/api/freelancers/saved"] });
    } catch {
      toast({ title: "Failed to update shortlist", variant: "destructive" });
    }
  };

  const handleBook = async () => {
    if (!freelancer || !startDate || !endDate) return;
    const rateNum = parseFloat(proposedRate);
    try {
      const booking = await createBooking.mutateAsync({
        data: {
          freelancerId: freelancer.id,
          startDate,
          endDate,
          paymentType: paymentType as "hourly" | "daily" | "fixed",
          rate: isNaN(rateNum) ? undefined : rateNum,
          ...(bookingMessage.trim() ? { message: bookingMessage.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setConfirmedBookingId(booking.id);
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const body = err?.response?.data ?? err?.data;
      if (status === 402 || body?.code === "PLAN_LIMIT") {
        toast({ title: "Plan limit reached", description: (body?.error ?? "Upgrade for more active bookings.") + " Redirecting to pricing…", variant: "destructive" });
        setTimeout(() => setLocation("/pricing"), 1200);
        return;
      }
      const msg = body?.error ?? (err instanceof Error ? err.message : "Could not create the booking.");
      toast({ title: "Booking failed", description: msg, variant: "destructive" });
    }
  };

  const handleScheduleMeeting = async () => {
    if (!freelancer || !meetingTitle || !meetingDate) return;
    try {
      const scheduledAt = new Date(`${meetingDate}T${meetingTime}:00`).toISOString();
      const meeting = await createMeeting.mutateAsync({
        data: {
          freelancerId: freelancer.id,
          title: meetingTitle,
          scheduledAt,
          durationMinutes: parseInt(meetingDuration),
          ...(meetingAgenda ? { agenda: meetingAgenda } : {}),
          ...(meetingLink ? { meetingLink } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setConfirmedMeetingId(meeting.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to schedule meeting.";
      toast({ title: "Failed to schedule meeting", description: msg, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="h-8 w-32 bg-muted rounded animate-pulse"></div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <Card className="animate-pulse"><CardHeader><div className="h-8 w-1/2 bg-muted rounded mb-2"></div></CardHeader><CardContent><div className="h-32 w-full bg-muted rounded"></div></CardContent></Card>
          </div>
          <div className="md:w-72 space-y-6"><Card className="animate-pulse h-48"></Card><Card className="animate-pulse h-32"></Card></div>
        </div>
      </div>
    );
  }
  if (!freelancer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted rounded-2xl flex items-center justify-center mb-6"><Briefcase className="h-8 w-8 text-muted-foreground" /></div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Profile Not Found</h2>
        <p className="text-muted-foreground font-light max-w-sm mb-6">This professional's profile does not exist or has been removed.</p>
        <Button asChild variant="outline"><Link href="/freelancers">Back to Talent Vault</Link></Button>
      </div>
    );
  }

  const isEmployer = me?.role === "employer";
  const avgRating = freelancer.averageRating ?? null;
  const reviewCount = freelancer.reviewCount ?? 0;
  const detail = freelancer as typeof freelancer & FreelancerProfileDetail;
  const verificationLevel = resolveVerificationLevel({
    verificationLevel: detail.verification?.level ?? freelancer.verificationLevel,
    isVerified: freelancer.isVerified,
  });
  const verifiedDocumentCount = detail.verification?.verifiedDocumentCount ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/freelancers"><ArrowLeft className="h-4 w-4 mr-2" />Back to Talent Vault</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary text-xs gap-1.5">
            <Link href={`/f/${freelancer.id}`} target="_blank"><ExternalLink className="h-3.5 w-3.5" />Public Profile</Link>
          </Button>
          {isEmployer && (
            <button
              onClick={handleToggleSave}
              disabled={toggleSave.isPending}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                isSaved
                  ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
                  : "bg-card border-border text-muted-foreground hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${isSaved ? "fill-rose-500 text-rose-500" : ""}`} />
              {isSaved ? "Shortlisted" : "Shortlist"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-start gap-8">
        <div className="flex-1 w-full space-y-8">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">{freelancer.name}</h1>
                  {freelancer.professionCategory === "education" && freelancer.educationProfessionType && (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                      <GraduationCap className="h-3 w-3" />
                      {EDUCATION_TYPE_LABELS[freelancer.educationProfessionType]}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-medium text-primary line-clamp-2">{freelancer.tagline}</h2>
                <div className="mt-2">
                  <StarRating
                    value={avgRating}
                    count={reviewCount}
                    readonly
                    size="md"
                  />
                </div>
              </div>
              <div className="flex-shrink-0 pt-1">
                {!freelancer.isAvailable ? (
                  <div className="inline-flex items-center bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                    <Lock className="w-3.5 h-3.5 mr-2" /> Currently Booked
                  </div>
                ) : (
                  <div className="inline-flex items-center bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-sm shadow-sm">
                    <BadgeCheck className="w-3.5 h-3.5 mr-2" /> Available
                  </div>
                )}
              </div>
            </div>

            {isVerifiedLevel(verificationLevel) && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <VerificationBadge level={verificationLevel} size="md" showTooltip />
                <p className="text-sm text-muted-foreground">
                  {verifiedDocumentCount} document{verifiedDocumentCount !== 1 ? "s" : ""} verified
                </p>
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  Document reviewed by AI — not a legal identity verification.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-3 py-4 border-y border-border/50 text-sm">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />{freelancer.fieldOfWork}
              </div>
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Star className="h-4 w-4 text-muted-foreground flex-shrink-0" />{freelancer.yearsExperience} Years Experience
              </div>
              <div className="flex items-center gap-2 text-foreground font-medium">
                <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {freelancer.paymentPreference === "hourly" && freelancer.hourlyRate != null
                  ? formatRate(Number(freelancer.hourlyRate), profileDefaultRateType(freelancer.professionCategory))
                  : null}
                {freelancer.paymentPreference === "daily" && freelancer.dailyRate != null
                  ? formatRate(Number(freelancer.dailyRate), "per_day")
                  : null}
                {freelancer.paymentPreference === "fixed" && "Fixed Rate"}
              </div>
            </div>
          </div>

          {freelancer.bio && (
            <section className="space-y-4">
              <h3 className="font-serif text-2xl font-semibold text-foreground">About</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{freelancer.bio}</p>
            </section>
          )}

          <AvailabilitySection freelancerId={freelancerId} />

          {jobId && me?.role === "employer" && (
            <MatchExplanationCard
              freelancerId={String(freelancer.id)}
              jobRequirementId={jobId}
              conversationId="direct-view"
              rateType={jobRequirement?.rateType}
            />
          )}

          <section className="space-y-4">
            <h3 className="font-serif text-2xl font-semibold text-foreground">Skills & Expertise</h3>
            <div className="flex flex-wrap gap-2">
              {freelancer.skills.map((skill, idx) => (
                <Badge key={idx} variant="secondary" className="px-3 py-1 bg-secondary/50 hover:bg-secondary font-medium border-border/50 text-sm">{skill}</Badge>
              ))}
            </div>
          </section>

          {/* Portfolio */}
          {portfolio && (portfolio as any[]).length > 0 && (
            <section className="space-y-4">
              <h3 className="font-serif text-2xl font-semibold text-foreground">Portfolio</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {portfolio.map((item: any) => (
                  <Card key={item.id} className="border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    {item.imageUrl && (
                      <div className="aspect-video w-full overflow-hidden bg-muted">
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-foreground leading-tight">{item.title}</h4>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary flex-shrink-0">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {item.description && <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>}
                      {item.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map((t: string, i: number) => <Badge key={i} variant="outline" className="text-xs px-2 py-0">{t}</Badge>)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <ReviewList freelancerId={freelancerId} />
          </section>

          {freelancer.portfolioUrl && (
            <section className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="font-serif text-lg font-semibold text-foreground">Links</h3>
              <a href={freelancer.portfolioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-gold transition-colors p-3 rounded-lg border border-border bg-card hover:shadow-sm">
                <ExternalLink className="h-4 w-4" />
                {freelancer.portfolioUrl.replace(/^https?:\/\//, '')}
              </a>
            </section>
          )}
        </div>

        {isEmployer && (
          <div className="w-full lg:w-80 flex-shrink-0 space-y-6 sticky top-24">
            <Card className="shadow-lg border-primary/20 overflow-hidden">
              <div className="h-1.5 w-full bg-gold"></div>
              <CardHeader className="pb-4 bg-primary/5">
                <CardTitle className="font-serif text-xl">Engage Talent</CardTitle>
                <CardDescription className="text-sm">Secure this professional exclusively for your engagement.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {freelancer.isAvailable ? (
                  <Dialog open={bookingOpen} onOpenChange={(open) => {
                    if (!open && confirmedBookingId) setLocation(`/bookings/${confirmedBookingId}`);
                    setBookingOpen(open);
                    if (!open) setConfirmedBookingId(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-11 text-base shadow font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"><Calendar className="h-5 w-5 mr-2 text-gold" />Book Now</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                      {confirmedBookingId ? (
                        <>
                          <DialogHeader className="text-center sm:text-center pb-4 border-b">
                            <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><ShieldCheck className="h-6 w-6" /></div>
                            <DialogTitle className="text-2xl font-serif">Booking Confirmed</DialogTitle>
                            <DialogDescription className="text-base mt-2">{freelancer.name} is now locked in exclusively.</DialogDescription>
                          </DialogHeader>
                          <div className="py-6 space-y-6">
                            <div className="rounded-xl border bg-secondary/30 p-5 text-sm space-y-3">
                              <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">Freelancer</span><span className="font-bold text-foreground">{freelancer.name}</span></div>
                              <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">From</span><span className="font-bold text-foreground">{format(new Date(startDate), "MMM d, yyyy")}</span></div>
                              <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">To</span><span className="font-bold text-foreground">{format(new Date(endDate), "MMM d, yyyy")}</span></div>
                            </div>
                            <a href={buildGoogleCalendarUrl({ title: `TalentLock: ${freelancer.name}`, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString(), details: `Freelancer engagement booked via TalentLock.\nFreelancer: ${freelancer.name}` })} target="_blank" rel="noreferrer" className="block">
                              <Button variant="outline" className="w-full h-11 gap-2 border-border hover:bg-secondary transition-colors" style={{ color: "#4285F4" }}>
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18zm3 0H15v-1.5h1.5V18z"/></svg>
                                Add to Google Calendar
                              </Button>
                            </a>
                          </div>
                          <DialogFooter className="sm:justify-center border-t pt-4">
                            <Button size="lg" className="w-full sm:w-auto font-semibold" onClick={() => setLocation(`/bookings/${confirmedBookingId}`)}>
                              View Booking &amp; Sign Agreement →
                            </Button>
                          </DialogFooter>
                        </>
                      ) : (
                        <>
                          <DialogHeader className="pb-4 border-b">
                            <DialogTitle className="font-serif text-2xl">Book {freelancer.name}</DialogTitle>
                            <DialogDescription>Set engagement dates and payment terms to lock in this talent exclusively.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-5 py-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2.5">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Start Date</Label>
                                <Input type="date" className="h-11 bg-secondary/20" value={startDate} onChange={e => setStartDate(e.target.value)} />
                              </div>
                              <div className="space-y-2.5">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">End Date</Label>
                                <Input type="date" className="h-11 bg-secondary/20" value={endDate} onChange={e => setEndDate(e.target.value)} />
                              </div>
                            </div>
                            {jobRequirement && (
                              <p className="-mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
                                <Info className="h-3 w-3 flex-shrink-0" />
                                Pre-filled from your job posting "{jobRequirement.title}". Adjust if needed.
                              </p>
                            )}
                            <div className="space-y-2.5">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payment Structure</Label>
                              <Select value={paymentType} onValueChange={(v) => {
                                setPaymentType(v);
                                if (v === "hourly" && freelancer.hourlyRate) setProposedRate(String(freelancer.hourlyRate));
                                else if (v === "daily" && freelancer.dailyRate) setProposedRate(String(freelancer.dailyRate));
                                else setProposedRate("");
                              }}>
                                <SelectTrigger className="h-11 bg-secondary/20"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                                  <SelectItem value="daily">Daily Rate</SelectItem>
                                  <SelectItem value="fixed">Fixed Project</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Proposed Rate</Label>
                                {((paymentType === "hourly" && freelancer.hourlyRate != null) || (paymentType === "daily" && freelancer.dailyRate != null)) && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Listed: {formatRate(
                                      Number(paymentType === "hourly" ? freelancer.hourlyRate : freelancer.dailyRate),
                                      paymentTypeToRateType(paymentType, jobRequirement?.rateType),
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">$</span>
                                <Input
                                  type="number"
                                  min="1"
                                  step="0.01"
                                  placeholder={paymentType === "hourly" && freelancer.hourlyRate ? String(freelancer.hourlyRate) : paymentType === "daily" && freelancer.dailyRate ? String(freelancer.dailyRate) : "0.00"}
                                  value={proposedRate}
                                  onChange={e => setProposedRate(e.target.value)}
                                  className="h-11 pl-7 bg-secondary/20"
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground">The freelancer will see this and can accept or counter-propose before the agreement is signed.</p>
                              {me?.role === "employer" && (
                                <RateSuggestionWidget
                                  freelancerId={String(freelancer.id)}
                                  fieldOfWork={freelancer.fieldOfWork}
                                  jobRequirementId={jobId ?? undefined}
                                  paymentType={paymentType as "hourly" | "daily" | "fixed"}
                                  rateType={jobRequirement?.rateType}
                                  proposedRate={proposedRate}
                                  onUseSuggestion={(rate) => setProposedRate(String(rate))}
                                  userPlan={userPlan}
                                />
                              )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-slate-700">
                                Message to {freelancer.name.split(" ")[0]}{" "}
                                <span className="text-muted-foreground font-normal">(optional)</span>
                              </label>
                              <Textarea
                                placeholder={`e.g. "Hi ${freelancer.name.split(" ")[0]}, I'm building..."`}
                                value={bookingMessage}
                                onChange={(e) => setBookingMessage(e.target.value)}
                                maxLength={500}
                                rows={3}
                                className="resize-none"
                              />
                              <p className={`text-xs text-right ${bookingMessage.length >= 450 ? "text-red-500" : "text-muted-foreground"}`}>
                                {bookingMessage.length}/500
                              </p>
                            </div>
                          </div>
                          <DialogFooter className="border-t pt-4">
                            <Button variant="ghost" onClick={() => setBookingOpen(false)}>Cancel</Button>
                            <Button className="font-semibold shadow-sm" onClick={handleBook} disabled={createBooking.isPending || !startDate || !endDate}>
                              {createBooking.isPending ? "Confirming..." : "Confirm & Lock In"}
                            </Button>
                          </DialogFooter>
                        </>
                      )}
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button disabled className="w-full h-11 text-base font-semibold opacity-70 cursor-not-allowed bg-secondary text-muted-foreground border-border border">
                    <Lock className="h-4 w-4 mr-2" />Currently Unavailable
                  </Button>
                )}
                <p className="text-center text-xs text-muted-foreground mt-4 font-light px-2">Booking generates a binding exclusivity agreement automatically.</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card">
              <CardContent className="p-6">
                <div className="text-center mb-5">
                  <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3"><Video className="h-5 w-5 text-muted-foreground" /></div>
                  <h3 className="font-serif font-semibold text-foreground">Discovery Call</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 font-light">Meet {freelancer.name.split(' ')[0]} before committing to a formal engagement.</p>
                </div>
                <Dialog open={meetingOpen} onOpenChange={(open) => {
                  if (!open && confirmedMeetingId) setLocation(`/meetings/${confirmedMeetingId}`);
                  setMeetingOpen(open);
                  if (!open) { setConfirmedMeetingId(null); setMeetingTitle(""); setMeetingDate(""); setMeetingTime("09:00"); setMeetingDuration("30"); setMeetingAgenda(""); setMeetingLink(""); }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full h-10 shadow-sm border-border hover:bg-secondary hover:text-foreground transition-colors font-medium">Schedule Meeting</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                    {confirmedMeetingId ? (
                      <>
                        <DialogHeader className="text-center pb-4 border-b">
                          <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><Calendar className="h-6 w-6" /></div>
                          <DialogTitle className="font-serif text-2xl">Meeting Scheduled</DialogTitle>
                          <DialogDescription className="mt-2">Your discovery call request has been sent to {freelancer.name}.</DialogDescription>
                        </DialogHeader>
                        <div className="py-6 space-y-6">
                          <div className="rounded-xl border bg-secondary/30 p-5 text-sm space-y-3">
                            <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">With</span><span className="font-bold text-foreground">{freelancer.name}</span></div>
                            <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">Date</span><span className="font-bold text-foreground">{format(new Date(meetingDate), "MMM d, yyyy")} at {meetingTime}</span></div>
                            <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">Duration</span><span className="font-bold text-foreground">{meetingDuration} min</span></div>
                          </div>
                          <a href={buildGoogleCalendarUrl({ title: meetingTitle || `Discovery Call: ${freelancer.name}`, startDate: new Date(`${meetingDate}T${meetingTime}:00`).toISOString(), endDate: new Date(new Date(`${meetingDate}T${meetingTime}:00`).getTime() + parseInt(meetingDuration) * 60000).toISOString(), details: `TalentLock Discovery Meeting with ${freelancer.name}${meetingAgenda ? `\n\nAgenda:\n${meetingAgenda}` : ""}${meetingLink ? `\n\nJoin: ${meetingLink}` : ""}` })} target="_blank" rel="noreferrer" className="block">
                            <Button variant="outline" className="w-full h-11 gap-2 border-border hover:bg-secondary transition-colors" style={{ color: "#4285F4" }}>
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18zm3 0H15v-1.5h1.5V18z"/></svg>
                              Add to Google Calendar
                            </Button>
                          </a>
                        </div>
                        <DialogFooter className="sm:justify-center border-t pt-4">
                          <Button size="lg" className="w-full sm:w-auto font-semibold" onClick={() => setLocation(`/meetings/${confirmedMeetingId}`)}>View Meeting Details →</Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader className="pb-4 border-b">
                          <DialogTitle className="font-serif text-2xl">Schedule Discovery Call</DialogTitle>
                          <DialogDescription>Arrange a meeting with {freelancer.name} to discuss your project.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-5">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meeting Title</Label>
                            <Input placeholder={`Discovery call with ${freelancer.name.split(" ")[0]}`} value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} className="h-11 bg-secondary/20" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date</Label>
                              <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="h-11 bg-secondary/20" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Time</Label>
                              <Input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} className="h-11 bg-secondary/20" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Duration</Label>
                            <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                              <SelectTrigger className="h-11 bg-secondary/20"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">60 minutes</SelectItem>
                                <SelectItem value="90">90 minutes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Agenda <span className="font-normal opacity-60 lowercase">optional</span></Label>
                            <Input placeholder="Topics you'd like to discuss..." value={meetingAgenda} onChange={e => setMeetingAgenda(e.target.value)} className="bg-secondary/20" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Meeting Link <span className="font-normal opacity-60 lowercase">optional</span></Label>
                            <Input type="url" placeholder="https://meet.google.com/..." value={meetingLink} onChange={e => setMeetingLink(e.target.value)} className="bg-secondary/20" />
                          </div>
                        </div>
                        <DialogFooter className="border-t pt-4">
                          <Button variant="ghost" onClick={() => setMeetingOpen(false)}>Cancel</Button>
                          <Button className="font-semibold" onClick={handleScheduleMeeting} disabled={createMeeting.isPending || !meetingTitle || !meetingDate}>
                            {createMeeting.isPending ? "Scheduling..." : "Schedule Meeting"}
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
