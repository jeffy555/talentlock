import { useState } from "react";
import { useListMeetings, useGetMe } from "@workspace/api-client-react";
import { PaginationControls } from "@/components/PaginationControls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Calendar, Clock, Users, Video, ArrowRight, PlusCircle, Search } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

const statusColors: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  confirmed: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default function MeetingsList() {
  const [page, setPage] = useState(1);
  const { data: me } = useGetMe();
  const { data, isLoading } = useListMeetings({ page, pageSize: 20 });
  const meetings = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const onPageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isEmployer = me?.role === "employer";

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
          <div className="h-5 w-96 bg-muted rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card">
              <CardHeader className="pb-2"><div className="h-6 w-1/3 bg-muted rounded" /></CardHeader>
              <CardContent><div className="h-12 w-full bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...meetings].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Discovery Meetings</h1>
          <p className="text-muted-foreground mt-2 font-light max-w-xl">
            {isEmployer
              ? "Schedule calls with freelancers before committing to a booking. Each meeting includes an auto-generated video link and one-click calendar export."
              : "Upcoming and past discovery calls with employers."}
          </p>
        </div>
        {isEmployer && (
          <Button asChild className="shadow-sm font-semibold gap-2">
            <Link href="/freelancers">
              <PlusCircle className="h-4 w-4 text-gold" />Schedule Meeting
            </Link>
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Calendar className="text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="font-serif">No meetings scheduled</EmptyTitle>
            <EmptyDescription>
              Discovery meetings with talent will show up here.
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
        <div className="space-y-3">
          {sorted.map((meeting, index) => (
            <Card
              key={meeting.id}
              className="group hover:shadow-md transition-all duration-300 border-border bg-card animate-fade-in"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3 className="font-serif font-bold text-base truncate text-foreground">{meeting.title}</h3>
                      <Badge className={`border capitalize text-[10px] uppercase tracking-widest flex-shrink-0 ${statusColors[meeting.status] ?? "bg-secondary"}`}>
                        {meeting.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {isEmployer ? meeting.freelancerName : meeting.employerName}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(meeting.scheduledAt), "MMM d, yyyy · h:mm a")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {meeting.durationMinutes} min
                      </span>
                      {meeting.meetingLink && (
                        <span className="flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5 text-primary" />
                          <a
                            href={meeting.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Join video
                          </a>
                        </span>
                      )}
                    </div>

                    {meeting.agenda && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-1 italic">
                        {meeting.agenda}
                      </p>
                    )}
                  </div>

                  <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                    <Link href={`/meetings/${meeting.id}`}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
