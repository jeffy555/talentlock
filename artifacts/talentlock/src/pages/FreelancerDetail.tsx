import { useParams, useLocation } from "wouter";
import { useGetFreelancerProfile, useGetMe, useCreateBooking } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BadgeCheck, Briefcase, Calendar, Clock, DollarSign, Lock, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function FreelancerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: freelancer, isLoading } = useGetFreelancerProfile(parseInt(id!), { query: { enabled: !!id } as any });
  const createBooking = useCreateBooking();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentType, setPaymentType] = useState("hourly");

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
      // Invalidate bookings list so it reflects the new booking immediately
      await queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking created!", description: "Freelancer locked in. Now generate a legal agreement to activate the engagement." });
      setBookingOpen(false);
      setLocation(`/bookings/${booking.id}`);
    } catch {
      toast({ title: "Booking failed", description: "Could not create the booking. Make sure you have an employer profile.", variant: "destructive" });
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
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Engage This Talent</CardTitle></CardHeader>
              <CardContent>
                {freelancer.isAvailable ? (
                  <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full"><Calendar className="h-4 w-4 mr-2" />Book Now</Button>
                    </DialogTrigger>
                    <DialogContent>
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
