import { useListBookings, useGetMe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Building, User } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export default function BookingsList() {
  const { data: me } = useGetMe();
  const { data: bookings, isLoading } = useListBookings();

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground mt-1">All your active and past engagements.</p>
      </div>

      {!bookings || bookings.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center bg-secondary/10">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            {me?.role === "employer" ? "Browse the Talent Vault and book a professional to get started." : "Your employer engagements will appear here once booked."}
          </p>
          {me?.role === "employer" && (
            <Button asChild className="mt-6"><Link href="/freelancers">Browse Talent</Link></Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <Card key={booking.id} className="hover:shadow-sm transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {me?.role === "employer" ? booking.freelancerName : booking.employerName}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Booking #{booking.id}
                    </CardDescription>
                  </div>
                  <Badge className={`capitalize border ${statusColors[booking.status] ?? "bg-secondary"}`}>
                    {booking.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <div>
                      <div className="text-xs">Start</div>
                      <div className="font-medium text-foreground">{format(new Date(booking.startDate), "MMM d, yyyy")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <div>
                      <div className="text-xs">End</div>
                      <div className="font-medium text-foreground">{format(new Date(booking.endDate), "MMM d, yyyy")}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div>
                      <div className="text-xs">Payment</div>
                      <div className="font-medium text-foreground capitalize">{booking.paymentType}</div>
                    </div>
                  </div>
                  {booking.rate && (
                    <div>
                      <div className="text-xs text-muted-foreground">Rate</div>
                      <div className="font-medium">${booking.rate}/{booking.paymentType === "hourly" ? "hr" : booking.paymentType === "daily" ? "day" : "fixed"}</div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/bookings/${booking.id}`}>View Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
