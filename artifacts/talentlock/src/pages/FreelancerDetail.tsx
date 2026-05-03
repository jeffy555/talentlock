import { useParams, useLocation } from "wouter";
import { useGetFreelancerProfile, useGetMe, useCreateBooking, useCreateMeeting } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BadgeCheck, Briefcase, Calendar, Clock, DollarSign, Lock, Star, ExternalLink, Video, ShieldCheck, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";
import { format } from "date-fns";

export default function FreelancerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: freelancer, isLoading } = useGetFreelancerProfile(parseInt(id!), { query: { enabled: !!id } as any });
  const createBooking = useCreateBooking();
  const createMeeting = useCreateMeeting();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentType, setPaymentType] = useState("hourly");
  const [confirmedBookingId, setConfirmedBookingId] = useState<number | null>(null);

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("09:00");
  const [meetingDuration, setMeetingDuration] = useState("30");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [confirmedMeetingId, setConfirmedMeetingId] = useState<number | null>(null);

  const handleBook = async () => {
    if (!freelancer || !startDate || !endDate) return;
    try {
      const booking = await createBooking.mutateAsync({
        data: {
          freelancerId: freelancer.id,
          startDate,
          endDate,
          paymentType: paymentType as "hourly" | "daily" | "fixed",
          rate: freelancer.hourlyRate ?? freelancer.dailyRate ?? 0,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setConfirmedBookingId(booking.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not create the booking.";
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
            <Card className="animate-pulse">
              <CardHeader><div className="h-8 w-1/2 bg-muted rounded mb-2"></div><div className="h-4 w-3/4 bg-muted rounded"></div></CardHeader>
              <CardContent><div className="h-32 w-full bg-muted rounded"></div></CardContent>
            </Card>
          </div>
          <div className="md:w-72 space-y-6">
            <Card className="animate-pulse h-48"></Card>
            <Card className="animate-pulse h-32"></Card>
          </div>
        </div>
      </div>
    );
  }
  if (!freelancer) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted rounded-2xl flex items-center justify-center mb-6">
          <Briefcase className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Profile Not Found</h2>
        <p className="text-muted-foreground font-light max-w-sm mb-6">This professional's profile does not exist or has been removed.</p>
        <Button asChild variant="outline"><Link href="/freelancers">Back to Talent Vault</Link></Button>
      </div>
    );
  }

  const isEmployer = me?.role === "employer";

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/freelancers"><ArrowLeft className="h-4 w-4 mr-2" />Back to Talent Vault</Link>
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row items-start gap-8">
        <div className="flex-1 w-full space-y-8">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">{freelancer.name}</h1>
                  {freelancer.isVerified && (
                    <div className="bg-primary/5 border border-primary/10 text-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified
                    </div>
                  )}
                </div>
                <h2 className="text-lg font-medium text-primary line-clamp-2">{freelancer.tagline}</h2>
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

            <div className="flex flex-wrap gap-x-6 gap-y-3 py-4 border-y border-border/50 text-sm">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {freelancer.fieldOfWork}
              </div>
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Star className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {freelancer.yearsExperience} Years Experience
              </div>
              <div className="flex items-center gap-2 text-foreground font-medium">
                <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                {freelancer.paymentPreference === "hourly" && freelancer.hourlyRate && `$${freelancer.hourlyRate}/hr`}
                {freelancer.paymentPreference === "daily" && freelancer.dailyRate && `$${freelancer.dailyRate}/day`}
                {freelancer.paymentPreference === "fixed" && "Fixed Rate"}
              </div>
            </div>
          </div>

          {freelancer.bio && (
            <section className="space-y-4">
              <h3 className="font-serif text-2xl font-semibold text-foreground">About</h3>
              <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
                <p className="whitespace-pre-wrap">{freelancer.bio}</p>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h3 className="font-serif text-2xl font-semibold text-foreground">Skills & Expertise</h3>
            <div className="flex flex-wrap gap-2">
              {freelancer.skills.map((skill, idx) => (
                <Badge key={idx} variant="secondary" className="px-3 py-1 bg-secondary/50 hover:bg-secondary font-medium border-border/50 text-sm">
                  {skill}
                </Badge>
              ))}
            </div>
          </section>

          {freelancer.portfolioUrl && (
            <section className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="font-serif text-lg font-semibold text-foreground">Links</h3>
              <a 
                href={freelancer.portfolioUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-gold transition-colors p-3 rounded-lg border border-border bg-card hover:shadow-sm"
              >
                <ExternalLink className="h-4 w-4" />
                {freelancer.portfolioUrl.replace(/^https?:\/\//, '')}
              </a>
            </section>
          )}
        </div>

        {isEmployer && (
          <div className="w-full lg:w-80 flex-shrink-0 space-y-6 sticky top-24">
            {/* Engage Card */}
            <Card className="shadow-lg border-primary/20 overflow-hidden">
              <div className="h-1.5 w-full bg-gold"></div>
              <CardHeader className="pb-4 bg-primary/5">
                <CardTitle className="font-serif text-xl">Engage Talent</CardTitle>
                <CardDescription className="text-sm">Secure this professional exclusively for your engagement.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {freelancer.isAvailable ? (
                  <Dialog open={bookingOpen} onOpenChange={(open) => {
                    if (!open && confirmedBookingId) {
                      setLocation(`/bookings/${confirmedBookingId}`);
                    }
                    setBookingOpen(open);
                    if (!open) setConfirmedBookingId(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-11 text-base shadow font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"><Calendar className="h-5 w-5 mr-2 text-gold" />Book Now</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      {confirmedBookingId ? (
                        /* ── Success state ── */
                        <>
                          <DialogHeader className="text-center sm:text-center pb-4 border-b">
                            <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                              <ShieldCheck className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-2xl font-serif">Booking Confirmed</DialogTitle>
                            <DialogDescription className="text-base mt-2">
                              {freelancer.name} is now locked in exclusively.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-6 space-y-6">
                            <div className="rounded-xl border bg-secondary/30 p-5 text-sm space-y-3">
                              <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">Freelancer</span><span className="font-bold text-foreground">{freelancer.name}</span></div>
                              <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">From</span><span className="font-bold text-foreground">{format(new Date(startDate), "MMM d, yyyy")}</span></div>
                              <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">To</span><span className="font-bold text-foreground">{format(new Date(endDate), "MMM d, yyyy")}</span></div>
                            </div>
                            <a
                              href={buildGoogleCalendarUrl({
                                title: `TalentLock: ${freelancer.name}`,
                                startDate: new Date(startDate).toISOString(),
                                endDate: new Date(endDate).toISOString(),
                                details: `Freelancer engagement booked via TalentLock.\nFreelancer: ${freelancer.name}\nField: ${freelancer.fieldOfWork}\nPayment: ${paymentType}`,
                              })}
                              target="_blank"
                              rel="noreferrer"
                              className="block"
                            >
                              <Button variant="outline" className="w-full h-11 gap-2 border-border hover:bg-secondary transition-colors" style={{ color: "#4285F4" }}>
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                  <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18zm3 0H15v-1.5h1.5V18z"/>
                                </svg>
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
                        /* ── Booking form ── */
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
                            <div className="space-y-2.5">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Payment Structure</Label>
                              <Select value={paymentType} onValueChange={setPaymentType}>
                                <SelectTrigger className="h-11 bg-secondary/20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                                  <SelectItem value="daily">Daily Rate</SelectItem>
                                  <SelectItem value="fixed">Fixed Project</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 flex items-center justify-between">
                              <p className="font-medium text-primary text-sm">Estimated Rate</p>
                              <p className="font-bold text-lg text-foreground font-serif">
                                {paymentType === "hourly" && freelancer.hourlyRate ? `$${freelancer.hourlyRate}/hr` : paymentType === "daily" && freelancer.dailyRate ? `$${freelancer.dailyRate}/day` : "Fixed (Negotiable)"}
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
                
                <p className="text-center text-xs text-muted-foreground mt-4 font-light px-2">
                  Booking generates a binding exclusivity agreement automatically.
                </p>
              </CardContent>
            </Card>

            {/* Discovery Meeting Card */}
            <Card className="shadow-sm border-border bg-card">
              <CardContent className="p-6">
                <div className="text-center mb-5">
                  <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center mx-auto mb-3">
                    <Video className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-serif font-semibold text-foreground">Discovery Call</h3>
                  <p className="text-xs text-muted-foreground mt-1.5 font-light">Meet {freelancer.name.split(' ')[0]} before committing to a formal engagement.</p>
                </div>
                
                <Dialog open={meetingOpen} onOpenChange={(open) => {
                  if (!open && confirmedMeetingId) {
                    setLocation(`/meetings/${confirmedMeetingId}`);
                  }
                  setMeetingOpen(open);
                  if (!open) { setConfirmedMeetingId(null); setMeetingTitle(""); setMeetingDate(""); setMeetingTime("09:00"); setMeetingDuration("30"); setMeetingAgenda(""); setMeetingLink(""); }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full h-10 shadow-sm border-border hover:bg-secondary hover:text-foreground transition-colors font-medium">
                      Schedule Meeting
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    {confirmedMeetingId ? (
                      <>
                        <DialogHeader className="text-center pb-4 border-b">
                          <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                            <Calendar className="h-6 w-6" />
                          </div>
                          <DialogTitle className="font-serif text-2xl">Meeting Scheduled</DialogTitle>
                          <DialogDescription className="mt-2">
                            Your discovery call request has been sent to {freelancer.name}.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-6 space-y-6">
                          <div className="rounded-xl border bg-secondary/30 p-5 text-sm space-y-3">
                            <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">With</span><span className="font-bold text-foreground">{freelancer.name}</span></div>
                            <div className="flex justify-between items-center border-b border-border/50 pb-2"><span className="text-muted-foreground font-medium">Date</span><span className="font-bold text-foreground">{format(new Date(meetingDate), "MMM d, yyyy")} at {meetingTime}</span></div>
                            <div className="flex justify-between items-center"><span className="text-muted-foreground font-medium">Duration</span><span className="font-bold text-foreground">{meetingDuration} min</span></div>
                          </div>
                          <a
                            href={buildGoogleCalendarUrl({
                              title: meetingTitle || `Discovery Call: ${freelancer.name}`,
                              startDate: new Date(`${meetingDate}T${meetingTime}:00`).toISOString(),
                              endDate: new Date(new Date(`${meetingDate}T${meetingTime}:00`).getTime() + parseInt(meetingDuration) * 60000).toISOString(),
                              details: `TalentLock Discovery Meeting with ${freelancer.name}${meetingAgenda ? `\n\nAgenda:\n${meetingAgenda}` : ""}${meetingLink ? `\n\nJoin: ${meetingLink}` : ""}`,
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            <Button variant="outline" className="w-full h-11 gap-2 border-border hover:bg-secondary transition-colors" style={{ color: "#4285F4" }}>
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                                <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18zm3 0H15v-1.5h1.5V18z"/>
                              </svg>
                              Add to Google Calendar
                            </Button>
                          </a>
                        </div>
                        <DialogFooter className="sm:justify-center border-t pt-4">
                          <Button size="lg" className="w-full sm:w-auto font-semibold" onClick={() => setLocation(`/meetings/${confirmedMeetingId}`)}>
                            View Meeting Details →
                          </Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader className="pb-4 border-b">
                          <DialogTitle className="font-serif text-2xl">Schedule Call</DialogTitle>
                          <DialogDescription>Request a discovery meeting with {freelancer.name}.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-6">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meeting Title</Label>
                            <Input className="bg-secondary/20" placeholder="e.g. Project Discovery" value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Date</Label>
                              <Input className="bg-secondary/20" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Time</Label>
                              <Input className="bg-secondary/20" type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Duration</Label>
                            <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                              <SelectTrigger className="bg-secondary/20"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Agenda <span className="font-normal opacity-70 lowercase">optional</span></Label>
                            <Input className="bg-secondary/20" placeholder="Topics to cover..." value={meetingAgenda} onChange={e => setMeetingAgenda(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex justify-between">Meeting Link <span className="font-normal opacity-70 lowercase">optional</span></Label>
                            <Input className="bg-secondary/20" placeholder="https://meet.google.com/..." value={meetingLink} onChange={e => setMeetingLink(e.target.value)} />
                          </div>
                        </div>
                        <DialogFooter className="border-t pt-4">
                          <Button variant="ghost" onClick={() => setMeetingOpen(false)}>Cancel</Button>
                          <Button className="font-semibold shadow-sm" onClick={handleScheduleMeeting} disabled={createMeeting.isPending || !meetingTitle || !meetingDate}>
                            {createMeeting.isPending ? "Scheduling..." : "Request Meeting"}
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
