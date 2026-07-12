import { useState } from "react";
import { useListBookings, useGetMe } from "@workspace/api-client-react";
import { PaginationControls } from "@/components/PaginationControls";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, DollarSign, ArrowRight, ShieldCheck, Search } from "lucide-react";
import { format } from "date-fns";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { StatusBadge, type StatusKind } from "@/components/StatusBadge";

function bookingStatusKind(status: string): StatusKind {
  if (status === "active") return "active";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "negotiating") return "negotiating";
  return "pending";
}

export default function BookingsList() {
  const [page, setPage] = useState(1);
  const { data: me } = useGetMe();
  const { data, isLoading } = useListBookings({ page, pageSize: 20 });
  const bookings = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const onPageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
          <div className="h-5 w-72 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-[140px]">
              <CardHeader className="pb-2"><div className="h-6 w-1/4 bg-muted rounded"></div></CardHeader>
              <CardContent><div className="h-16 w-full bg-muted rounded"></div></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const isEmployer = me?.role === "employer";

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Bookings</h1>
        <p className="text-muted-foreground mt-2 font-light max-w-xl">
          Manage your exclusive engagements. Bookings create an agreement draft; exclusivity locks once both parties have signed.
        </p>
      </div>

      {bookings.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Calendar className="text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="font-serif">No bookings yet</EmptyTitle>
            <EmptyDescription>
              Exclusive engagements you request or receive will appear here.
            </EmptyDescription>
          </EmptyHeader>
          {isEmployer && (
            <EmptyContent>
              <Button asChild className="font-semibold shadow-sm gap-2 h-11 px-8">
                <Link href="/freelancers">
                  <Search className="h-4 w-4" /> Browse Talent
                </Link>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking, index) => {
            const kind = bookingStatusKind(booking.status);
            const rail =
              kind === "active" ? "bg-primary"
              : kind === "completed" ? "bg-emerald-500"
              : kind === "cancelled" ? "bg-destructive"
              : "bg-amber-400";

            return (
              <Card 
                key={booking.id} 
                className="group hover:shadow-md transition-all duration-300 border-border bg-card relative overflow-hidden animate-fade-in"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${rail} opacity-70`}></div>
                
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center">
                    {/* Left side: Header info */}
                    <div className="flex-1 p-6 space-y-4 md:border-r md:border-border/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                            Booking #{booking.id}
                          </p>
                          <h3 className="font-serif text-2xl font-bold text-foreground leading-tight">
                            {isEmployer ? booking.freelancerName : booking.employerName}
                          </h3>
                        </div>
                        <StatusBadge status={kind} className="uppercase tracking-widest text-[10px] shadow-sm">
                          {booking.status}
                        </StatusBadge>
                      </div>
                      
                      {booking.status === "active" && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 px-2.5 py-1 rounded-md border border-primary/20">
                          <ShieldCheck className="h-3.5 w-3.5" /> Exclusivity Locked
                        </div>
                      )}
                    </div>
                    
                    {/* Right side: Details & Action */}
                    <div className="flex-1 p-6 bg-muted/5 flex flex-col justify-between">
                      <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Timeline</div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {format(new Date(booking.startDate), "MMM d")} - {format(new Date(booking.endDate), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Terms</div>
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="capitalize">{booking.paymentType}</span>
                            {booking.rate && <span className="text-muted-foreground font-normal"> · ${booking.rate}</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end mt-auto">
                        <Button variant="outline" className="shadow-sm border-border hover:bg-secondary w-full md:w-auto" asChild>
                          <Link href={`/bookings/${booking.id}`}>
                            View Details <ArrowRight className="h-3.5 w-3.5 ml-2" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={isLoading}
      />
    </div>
  );
}
