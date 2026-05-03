import { useParams, useLocation } from "wouter";
import { useGetBooking, useUpdateBooking, useCreateAgreement, useGetMe, useListAgreements } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, CheckCircle2, FileText, XCircle, Sparkles, ExternalLink, ShieldCheck, Clock, DollarSign, Lock } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";

const statusColors: Record<string, { bg: string, text: string, border: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  active: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  completed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: booking, isLoading, refetch } = useGetBooking(parseInt(id!), { query: { enabled: !!id } as any });
  const { data: agreements, refetch: refetchAgreements } = useListAgreements({ status: undefined }, { query: { enabled: !!booking } as any });
  const updateBooking = useUpdateBooking();
  const createAgreement = useCreateAgreement();

  const bookingAgreements = agreements?.filter(a => a.bookingId === parseInt(id!)) ?? [];

  const handleStatusUpdate = async (status: "completed" | "cancelled") => {
    try {
      await updateBooking.mutateAsync({ id: parseInt(id!), data: { status } });
      toast({ title: `Booking ${status}`, description: `The booking has been marked as ${status}.` });
      refetch();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleGenerateAgreement = async () => {
    try {
      const agreement = await createAgreement.mutateAsync({ data: { bookingId: parseInt(id!) } });
      toast({ title: "Agreement generated", description: "AI has drafted a legal agreement. Review and sign to activate the engagement." });
      refetchAgreements();
      setLocation(`/agreements/${agreement.id}`);
    } catch {
      toast({ title: "Failed to generate agreement", description: "Please try again.", variant: "destructive" });
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
        <Button asChild className="font-semibold shadow-sm">
          <Link href="/bookings">Back to Bookings</Link>
        </Button>
      </div>
    );
  }

  const isEmployer = me?.role === "employer";
  const isCancelled = booking.status === "cancelled";
  const hasAgreement = bookingAgreements.length > 0;
  const canGenerateAgreement = isEmployer && !isCancelled && !hasAgreement;
  const colors = statusColors[booking.status] || { bg: "bg-secondary", text: "text-muted-foreground", border: "border-border" };

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
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Booking #{booking.id}
            </span>
          </div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">
            {isEmployer ? booking.freelancerName : booking.employerName}
          </h1>
          <p className="text-lg text-primary font-medium flex items-center gap-2">
            {booking.status === 'active' ? (
              <><ShieldCheck className="h-5 w-5" /> Exclusivity Locked</>
            ) : booking.status === 'cancelled' ? (
              <><XCircle className="h-5 w-5" /> Engagement Cancelled</>
            ) : (
              <><Lock className="h-5 w-5" /> Pending Exclusivity</>
            )}
          </p>
        </div>
        
        <div className="flex gap-3 flex-wrap md:flex-col md:items-end md:gap-2">
          {/* Actions */}
          {!isCancelled && (
            <a
              href={buildGoogleCalendarUrl({
                title: `TalentLock: ${isEmployer ? booking.freelancerName : booking.employerName}`,
                startDate: booking.startDate,
                endDate: booking.endDate,
                details: `TalentLock Booking #${booking.id}\n${isEmployer ? `Freelancer: ${booking.freelancerName}` : `Employer: ${booking.employerName}`}\nPayment: ${booking.paymentType}${booking.rate ? ` · $${booking.rate}` : ""}\n\nManage at: ${window.location.href}`,
              })}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm border-border hover:bg-secondary font-medium w-full" style={{ color: "#4285F4" }}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18z"/>
                </svg>
                Calendar
              </Button>
            </a>
          )}
          {isEmployer && booking.status === "active" && (
            <Button variant="outline" size="sm" className="h-9 font-medium shadow-sm border-green-200 text-green-700 hover:bg-green-50 w-full" onClick={() => handleStatusUpdate("completed")}>
              <CheckCircle2 className="h-4 w-4 mr-2" />Mark Complete
            </Button>
          )}
          {booking.status === "pending" && (
            <Button variant="outline" size="sm" className="h-9 font-medium shadow-sm border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive w-full" onClick={() => handleStatusUpdate("cancelled")}>
              <XCircle className="h-4 w-4 mr-2" />Cancel Booking
            </Button>
          )}
        </div>
      </div>

      {isEmployer && !hasAgreement && !isCancelled && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-6 flex items-start gap-4">
          <div className="h-10 w-10 bg-gold/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-primary mb-1">Generate Legal Agreement</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-2xl">
              Your booking terms are set. TalentLock AI can now generate a binding legal agreement encompassing exclusivity, scope, and payment terms ready for signature.
            </p>
            <Button onClick={handleGenerateAgreement} disabled={createAgreement.isPending} className="font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90">
              {createAgreement.isPending ? "Drafting Agreement..." : "Generate AI Agreement"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
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
                    {isCancelled
                      ? "This booking was cancelled. No contracts can be generated."
                      : "A formal agreement must be signed by both parties to activate this engagement."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
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
                      {format(new Date(booking.startDate), "MMM d, yyyy")}<br/>
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
    </div>
  );
}
