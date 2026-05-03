import { useParams, useLocation } from "wouter";
import { useGetBooking, useUpdateBooking, useCreateAgreement, useGetMe, useListAgreements } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, CheckCircle2, FileText, XCircle, Sparkles, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { buildGoogleCalendarUrl } from "@/lib/calendarUrl";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
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
      toast({ title: "Agreement generated", description: "AI has drafted a legal agreement for this booking. Review and sign it now." });
      refetchAgreements();
      setLocation(`/agreements/${agreement.id}`);
    } catch {
      toast({ title: "Failed to generate agreement", description: "Please try again.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!booking) return <div className="text-center py-20 text-muted-foreground">Booking not found.</div>;

  const isEmployer = me?.role === "employer";
  const isCancelled = booking.status === "cancelled";
  const hasAgreement = bookingAgreements.length > 0;
  const canGenerateAgreement = isEmployer && !isCancelled && !hasAgreement;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/bookings"><ArrowLeft className="h-4 w-4 mr-2" />Back to Bookings</Link>
        </Button>
      </div>

      {/* Next step banner — only show if no agreement yet and not cancelled */}
      {isEmployer && !hasAgreement && !isCancelled && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Next step: Generate a legal agreement</p>
            <p className="mt-0.5 text-yellow-700">Your booking is locked in. Generate an AI-drafted agreement below, then both parties sign to activate the engagement.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">Booking #{booking.id}</CardTitle>
              <CardDescription className="mt-1">
                {isEmployer ? `Freelancer: ${booking.freelancerName}` : `Employer: ${booking.employerName}`}
              </CardDescription>
            </div>
            <Badge className={`capitalize border ${statusColors[booking.status] ?? "bg-secondary"}`}>
              {booking.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">Start Date</div>
              <div className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(new Date(booking.startDate), "MMMM d, yyyy")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">End Date</div>
              <div className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(new Date(booking.endDate), "MMMM d, yyyy")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Payment Type</div>
              <div className="font-medium capitalize">{booking.paymentType}</div>
            </div>
            {booking.rate && (
              <div>
                <div className="text-muted-foreground text-xs mb-1">Rate</div>
                <div className="font-medium">
                  ${booking.rate}/{booking.paymentType === "hourly" ? "hr" : booking.paymentType === "daily" ? "day" : "fixed"}
                </div>
              </div>
            )}
            {booking.notes && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Notes</div>
                <div className="font-medium">{booking.notes}</div>
              </div>
            )}
          </div>

          {/* Agreement section */}
          <div className="border-t pt-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4" />Legal Agreement
            </h3>

            {hasAgreement ? (
              <div className="space-y-2">
                {bookingAgreements.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border">
                    <div>
                      <div className="text-sm font-medium">Agreement #{a.id}</div>
                      <div className="text-xs text-muted-foreground capitalize mt-0.5">
                        {a.status?.replace(/_/g, " ")}
                        {a.freelancerSignedAt && a.employerSignedAt && " · Fully signed"}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/agreements/${a.id}`}>
                        {!a.freelancerSignedAt || !a.employerSignedAt ? "Review & Sign" : "View Agreement"}
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-secondary/20 p-5 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  {isCancelled
                    ? "This booking was cancelled. No agreement can be generated."
                    : "No agreement yet. Generate one to formalise this engagement."}
                </p>
                {canGenerateAgreement && (
                  <Button onClick={handleGenerateAgreement} disabled={createAgreement.isPending} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    {createAgreement.isPending ? "Generating Agreement..." : "Generate AI Agreement"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t pt-4 flex flex-wrap gap-3 items-center">
            {/* Add to Google Calendar — always visible for non-cancelled bookings */}
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
                <Button variant="outline" className="gap-2" style={{ borderColor: "#4285F4", color: "#4285F4" }}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15C3 20.325 3.675 21 4.5 21h15c.825 0 1.5-.675 1.5-1.5v-15C21 3.675 20.325 3 19.5 3zm0 16.5h-15V9h15v10.5zM7.5 12H6v-1.5h1.5V12zm3 0H9v-1.5h1.5V12zm3 0H12v-1.5h1.5V12zm3 0H15v-1.5h1.5V12zM7.5 15H6v-1.5h1.5V15zm3 0H9v-1.5h1.5V15zm3 0H12v-1.5h1.5V15zm3 0H15v-1.5h1.5V15zM7.5 18H6v-1.5h1.5V18zm3 0H9v-1.5h1.5V18zm3 0H12v-1.5h1.5V18z"/>
                  </svg>
                  Add to Google Calendar
                  <ExternalLink className="h-3 w-3 ml-0.5 opacity-60" />
                </Button>
              </a>
            )}
            {isEmployer && booking.status === "active" && (
              <Button variant="outline" onClick={() => handleStatusUpdate("completed")}>
                <CheckCircle2 className="h-4 w-4 mr-2" />Mark Complete
              </Button>
            )}
            {booking.status === "pending" && (
              <Button variant="destructive" onClick={() => handleStatusUpdate("cancelled")}>
                <XCircle className="h-4 w-4 mr-2" />Cancel Booking
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
