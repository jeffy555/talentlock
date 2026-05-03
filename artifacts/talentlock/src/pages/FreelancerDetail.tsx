import { useParams, useLocation } from "wouter";
import { useGetFreelancerProfile, useGetMe, useCreateBooking, useCreateMeeting } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BadgeCheck, Briefcase, Calendar, Clock, DollarSign, Lock, Star, ExternalLink, Video } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";

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
    } catch {
      toast({ title: "Booking failed", description: "Could not create the booking. Make sure you have an employer profile.", variant: "destructive" });
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
    } catch {
      toast({ title: "Failed to schedule meeting", description: "Make sure you have an employer profile.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!freelancer) return <div className="text-center py-20 text-muted-foreground">Freelancer not found.</div>;

  const isEmployer = me?.role === "employer";

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild><Link href="/freelancers"><ArrowLeft className="h-4 w-4 mr-2" />Back to Talent Vault</Link></Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-3xl">{freelancer.name}</CardTitle>
                    {freelancer.isVerified && <BadgeCheck className="h-6 w-6 text-primary" />}
                  </div>
                  <CardDescription className="text-base text-primary font-medium mt-1">{freelancer.tagline}</CardDescription>
                </div>
                {!freelancer.isAvailable && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Booked
                  </Badge>
                )}
                {freelancer.isAvailable && <Badge variant="default" className="bg-green-600 text-white">Available</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <div><div className="text-muted-foreground text-xs">Field</div><div className="font-medium">{freelancer.fieldOfWork}</div></div>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-muted-foreground" />
                  <div><div className="text-muted-foreground text-xs">Experience</div><div className="font-medium">{freelancer.yearsExperience} Years</div></div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-muted-foreground text-xs">Rate</div>
                    <div className="font-medium">
                      {freelancer.paymentPreference === "hourly" && freelancer.hourlyRate && `$${freelancer.hourlyRate}/hr`}
                      {freelancer.paymentPreference === "daily" && freelancer.dailyRate && `$${freelancer.dailyRate}/day`}
                      {freelancer.paymentPreference === "fixed" && "Fixed Rate"}
                    </div>
                  </div>
                </div>
              </div>

              {freelancer.bio && (
                <div>
                  <h3 className="font-semibold mb-2">About</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{freelancer.bio}</p>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-3">Skills & Expertise</h3>
                <div className="flex flex-wrap gap-2">
                  {freelancer.skills.map((skill, idx) => (
                    <Badge key={idx} variant="outline" className="bg-secondary/50">{skill}</Badge>
                  ))}
                </div>
              </div>

              {freelancer.portfolioUrl && (
                <div>
                  <h3 className="font-semibold mb-2">Portfolio</h3>
                  <a href={freelancer.portfolioUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">{freelancer.portfolioUrl}</a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {isEmployer && (
          <div className="md:w-64 space-y-4">
            {/* Schedule Meeting card */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Discovery Meeting</CardTitle></CardHeader>
              <CardContent>
                <Dialog open={meetingOpen} onOpenChange={(open) => {
                  if (!open && confirmedMeetingId) {
                    setLocation(`/meetings/${confirmedMeetingId}`);
                  }
                  setMeetingOpen(open);
                  if (!open) { setConfirmedMeetingId(null); setMeetingTitle(""); setMeetingDate(""); setMeetingTime("09:00"); setMeetingDuration("30"); setMeetingAgenda(""); setMeetingLink(""); }
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full"><Video className="h-4 w-4 mr-2" />Schedule Meeting</Button>
                  </DialogTrigger>
                  <DialogContent>
                    {confirmedMeetingId ? (
                      <>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <span className="text-green-600">✓</span> Meeting Scheduled!
                          </DialogTitle>
                          <DialogDescription>
                            Your discovery call with {freelancer.name} has been requested.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                          <div className="rounded-lg border bg-secondary/30 p-4 text-sm space-y-1">
                            <div className="flex justify-between"><span className="text-muted-foreground">With</span><span className="font-medium">{freelancer.name}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{meetingDate} at {meetingTime}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{meetingDuration} min</span></div>
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
                            <Button variant="outline" className="w-full gap-2" style={{ borderColor: "#4285F4", color: "#4285F4" }}>
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18z"/>
                              </svg>
                              Add to Google Calendar
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </Button>
                          </a>
                        </div>
                        <DialogFooter>
                          <Button onClick={() => setLocation(`/meetings/${confirmedMeetingId}`)}>
                            View Meeting Details →
                          </Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader>
                          <DialogTitle>Schedule a Meeting with {freelancer.name}</DialogTitle>
                          <DialogDescription>Set up a discovery call before committing to a formal engagement.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Meeting Title</Label>
                            <Input placeholder="e.g. Initial Discovery Call" value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Date</Label>
                              <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Time</Label>
                              <Input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Duration</Label>
                            <Select value={meetingDuration} onValueChange={setMeetingDuration}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="45">45 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="90">1.5 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Agenda <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Input placeholder="Topics you'd like to cover…" value={meetingAgenda} onChange={e => setMeetingAgenda(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Meeting Link <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Input placeholder="https://meet.google.com/…" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setMeetingOpen(false)}>Cancel</Button>
                          <Button onClick={handleScheduleMeeting} disabled={createMeeting.isPending || !meetingTitle || !meetingDate}>
                            {createMeeting.isPending ? "Scheduling…" : "Schedule Meeting"}
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Engage This Talent</CardTitle></CardHeader>
              <CardContent>
                {freelancer.isAvailable ? (
                  <Dialog open={bookingOpen} onOpenChange={(open) => {
                    if (!open && confirmedBookingId) {
                      setLocation(`/bookings/${confirmedBookingId}`);
                    }
                    setBookingOpen(open);
                    if (!open) setConfirmedBookingId(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button className="w-full"><Calendar className="h-4 w-4 mr-2" />Book Now</Button>
                    </DialogTrigger>
                    <DialogContent>
                      {confirmedBookingId ? (
                        /* ── Success state ── */
                        <>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <span className="text-green-600">✓</span> Booking Confirmed!
                            </DialogTitle>
                            <DialogDescription>
                              {freelancer.name} is now locked in exclusively for your engagement.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <div className="rounded-lg border bg-secondary/30 p-4 text-sm space-y-1">
                              <div className="flex justify-between"><span className="text-muted-foreground">Freelancer</span><span className="font-medium">{freelancer.name}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">From</span><span className="font-medium">{startDate}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{endDate}</span></div>
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
                              <Button variant="outline" className="w-full gap-2" style={{ borderColor: "#4285F4", color: "#4285F4" }}>
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                  <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18z"/>
                                </svg>
                                Add to Google Calendar
                                <ExternalLink className="h-3 w-3 opacity-60" />
                              </Button>
                            </a>
                          </div>
                          <DialogFooter>
                            <Button onClick={() => setLocation(`/bookings/${confirmedBookingId}`)}>
                              View Booking &amp; Generate Agreement →
                            </Button>
                          </DialogFooter>
                        </>
                      ) : (
                        /* ── Booking form ── */
                        <>
                          <DialogHeader>
                            <DialogTitle>Book {freelancer.name}</DialogTitle>
                            <DialogDescription>Set engagement dates and payment terms to lock in this talent exclusively.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Start Date</Label>
                              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>End Date</Label>
                              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Payment Type</Label>
                              <Select value={paymentType} onValueChange={setPaymentType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hourly">Hourly</SelectItem>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="fixed">Fixed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="rounded-md bg-secondary/50 p-3 text-sm">
                              <p className="font-medium">Rate</p>
                              <p className="text-muted-foreground">
                                {paymentType === "hourly" && freelancer.hourlyRate ? `$${freelancer.hourlyRate}/hr` : paymentType === "daily" && freelancer.dailyRate ? `$${freelancer.dailyRate}/day` : "Fixed (to be agreed)"}
                              </p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setBookingOpen(false)}>Cancel</Button>
                            <Button onClick={handleBook} disabled={createBooking.isPending || !startDate || !endDate}>
                              {createBooking.isPending ? "Booking..." : "Confirm Booking"}
                            </Button>
                          </DialogFooter>
                        </>
                      )}
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button disabled className="w-full"><Lock className="h-4 w-4 mr-2" />Currently Booked</Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
