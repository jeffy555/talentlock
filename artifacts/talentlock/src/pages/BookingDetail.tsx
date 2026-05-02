import { useParams, useLocation } from "wouter";
import { useGetBooking, useUpdateBooking, useCreateAgreement, useGetMe, useListAgreements } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, CheckCircle2, FileText, XCircle } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

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
  const { data: agreements } = useListAgreements({ status: undefined }, { query: { enabled: !!booking } as any });
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
      toast({ title: "Agreement generated", description: "AI has generated a legal agreement for this booking." });
      setLocation(`/agreements/${agreement.id}`);
    } catch {
      toast({ title: "Failed to generate agreement", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!booking) return <div className="text-center py-20 text-muted-foreground">Booking not found.</div>;

  const isEmployer = me?.role === "employer";
  const canGenerateAgreement = isEmployer && booking.status !== "cancelled" && bookingAgreements.length === 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild><Link href="/bookings"><ArrowLeft className="h-4 w-4 mr-2" />Back to Bookings</Link></Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">Booking #{booking.id}</CardTitle>
              <CardDescription className="mt-1">
                {isEmployer ? `With ${booking.freelancerName}` : `With ${booking.employerName}`}
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
              <div className="font-medium flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{format(new Date(booking.startDate), "MMMM d, yyyy")}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">End Date</div>
              <div className="font-medium flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{format(new Date(booking.endDate), "MMMM d, yyyy")}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Payment Type</div>
              <div className="font-medium capitalize">{booking.paymentType}</div>
            </div>
            {booking.rate && (
              <div>
                <div className="text-muted-foreground text-xs mb-1">Rate</div>
                <div className="font-medium">${booking.rate}/{booking.paymentType === "hourly" ? "hr" : booking.paymentType === "daily" ? "day" : "fixed"}</div>
              </div>
            )}
            {booking.notes && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Notes</div>
                <div className="font-medium">{booking.notes}</div>
              </div>
            )}
          </div>

          {bookingAgreements.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4" />Agreements</h3>
              {bookingAgreements.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/30">
                  <div>
                    <div className="text-sm font-medium">Legal Agreement #{a.id}</div>
                    <div className="text-xs text-muted-foreground capitalize">{a.status?.replace(/_/g, " ")}</div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/agreements/${a.id}`}>View & Sign</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 flex flex-wrap gap-3">
            {canGenerateAgreement && (
              <Button onClick={handleGenerateAgreement} disabled={createAgreement.isPending}>
                <FileText className="h-4 w-4 mr-2" />
                {createAgreement.isPending ? "Generating Agreement..." : "Generate AI Agreement"}
              </Button>
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
