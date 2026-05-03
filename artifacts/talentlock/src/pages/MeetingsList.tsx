import { useListMeetings, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, Users, Video, ArrowRight, PlusCircle } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export default function MeetingsList() {
  const { data: me } = useGetMe();
  const { data: meetings, isLoading } = useListMeetings();

  const isEmployer = me?.role === "employer";

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sorted = [...(meetings ?? [])].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Discovery Meetings</h1>
          <p className="text-muted-foreground mt-1">
            {isEmployer
              ? "Schedule calls with freelancers before committing to a booking."
              : "Upcoming and past discovery calls with employers."}
          </p>
        </div>
        {isEmployer && (
          <Button asChild>
            <Link href="/freelancers">
              <PlusCircle className="h-4 w-4 mr-2" />Schedule Meeting
            </Link>
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
            <p className="text-muted-foreground">No meetings yet.</p>
            {isEmployer && (
              <p className="text-sm text-muted-foreground mt-1">
                Browse the{" "}
                <Link href="/freelancers" className="text-primary underline-offset-4 hover:underline">
                  Talent Vault
                </Link>{" "}
                and click <strong>Schedule Meeting</strong> on any profile.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((meeting) => (
            <Card key={meeting.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base truncate">{meeting.title}</h3>
                      <Badge className={`border capitalize text-xs flex-shrink-0 ${statusColors[meeting.status] ?? "bg-secondary"}`}>
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
                          <Video className="h-3.5 w-3.5" />
                          <a
                            href={meeting.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Join link
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
    </div>
  );
}
