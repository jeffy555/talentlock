import { useParams, useLocation } from "wouter";
import { useGetMeeting, useUpdateMeeting, useGetMe, useGetMySubscription } from "@workspace/api-client-react";
import { MeetingBriefCard } from "@/components/meetings/MeetingBriefCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Calendar, Clock, Users, Video, CheckCircle2,
  XCircle, ExternalLink, ArrowRight, BookOpen,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadIcsFile } from "@/lib/calendarUrl";

const statusColors: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: meeting, isLoading, refetch } = useGetMeeting(parseInt(id!), {
    query: { enabled: !!id } as any,
  });
  const updateMeeting = useUpdateMeeting();

  const isEmployer = me?.role === "employer";
  const { data: subscription } = useGetMySubscription({
    query: { enabled: isEmployer } as any,
  });
  const userPlan = subscription?.plan?.id ?? "employer_starter";

  const handleStatus = async (status: string) => {
    try {
      await updateMeeting.mutateAsync({ id: parseInt(id!), data: { status } });
      toast({ title: `Meeting ${status}`, description: `The meeting has been marked as ${status}.` });
      refetch();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        <Card className="animate-pulse">
          <CardHeader><div className="h-7 w-2/3 bg-muted rounded" /></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-5">
              <div className="h-12 bg-muted rounded" />
              <div className="h-12 bg-muted rounded" />
            </div>
            <div className="h-20 bg-muted rounded" />
            <div className="h-10 w-1/3 bg-muted rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!meeting) return <div className="text-center py-20 text-muted-foreground">Meeting not found.</div>;

  const isCancelled = meeting.status === "cancelled";
  const isCompleted = meeting.status === "completed";
  const meetingDate = new Date(meeting.scheduledAt);
  const meetingEndDate = new Date(meetingDate.getTime() + meeting.durationMinutes * 60 * 1000);

  const freelancerEmail = (meeting as any).freelancerEmail as string | null | undefined;
  const employerEmail = (meeting as any).employerEmail as string | null | undefined;
  const guests = [freelancerEmail, employerEmail].filter((e): e is string => !!e);

  const calendarDetails = `TalentLock Discovery Meeting\n${isEmployer ? `Freelancer: ${meeting.freelancerName}` : `Employer: ${meeting.employerName}`}${meeting.agenda ? `\n\nAgenda:\n${meeting.agenda}` : ""}${meeting.meetingLink ? `\n\nJoin: ${meeting.meetingLink}` : ""}`;
  const calendarParams = {
    title: meeting.title,
    startDate: meeting.scheduledAt,
    endDate: meetingEndDate.toISOString(),
    details: calendarDetails,
    location: meeting.meetingLink ?? undefined,
    guests,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/meetings"><ArrowLeft className="h-4 w-4 mr-2" />Back to Meetings</Link>
        </Button>
      </div>

      {/* "Proceed to book" banner after completed meeting */}
      {isCompleted && isEmployer && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div>
            <p className="font-semibold">Meeting completed — ready to move forward?</p>
            <p className="mt-0.5 text-green-700">
              You can now book {meeting.freelancerName} and generate a legal agreement.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link href={`/freelancers/${meeting.freelancerId}`}>
              Book Now <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{meeting.title}</CardTitle>
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {isEmployer ? meeting.freelancerName : meeting.employerName}
              </p>
            </div>
            <Badge className={`border capitalize ${statusColors[meeting.status] ?? "bg-secondary"}`}>
              {meeting.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Meeting info grid */}
          <div className="grid grid-cols-2 gap-5 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">Date &amp; Time</div>
              <div className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(meetingDate, "MMMM d, yyyy")}
              </div>
              <div className="text-muted-foreground pl-6">{format(meetingDate, "h:mm a")}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Duration</div>
              <div className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {meeting.durationMinutes} minutes
              </div>
            </div>
            {meeting.meetingLink && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Meeting Link</div>
                <a
                  href={meeting.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium flex items-center gap-2 text-primary hover:underline"
                >
                  <Video className="h-4 w-4" />
                  {meeting.meetingLink}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </div>
            )}
            {meeting.agenda && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs mb-1">Agenda</div>
                <div className="font-medium flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="whitespace-pre-line">{meeting.agenda}</span>
                </div>
              </div>
            )}
          </div>

          {/* AI Meeting Brief — employer-only, confirmed meetings */}
          {isEmployer && meeting.status === "confirmed" && (
            <MeetingBriefCard
              brief={meeting.briefContent}
              briefGeneratedAt={meeting.briefGeneratedAt}
              meetingId={meeting.id}
              userPlan={userPlan}
              refetchMeeting={async () => {
                const r = await refetch();
                return { data: r.data };
              }}
            />
          )}

          {/* Calendar export — quick access to all major calendar apps */}
          {!isCancelled && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Add to your calendar
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={buildGoogleCalendarUrl(calendarParams)} target="_blank" rel="noreferrer">
                    <Calendar className="h-3.5 w-3.5" />Google
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={buildOutlookCalendarUrl(calendarParams)} target="_blank" rel="noreferrer">
                    <Calendar className="h-3.5 w-3.5" />Outlook
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadIcsFile(`talentlock-meeting-${meeting.id}`, calendarParams)}
                >
                  <Calendar className="h-3.5 w-3.5" />Apple / .ics
                </Button>
              </div>
            </div>
          )}

          {/* Status actions */}
          <div className="border-t pt-4 flex flex-wrap gap-3 items-center">
            {/* Prominent Join Video Call CTA */}
            {meeting.meetingLink && !isCancelled && !isCompleted && (
              <Button asChild className="gap-2 shadow-sm">
                <a href={meeting.meetingLink} target="_blank" rel="noreferrer">
                  <Video className="h-4 w-4" />Join Video Call
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
            )}

            {meeting.status === "pending" && isEmployer && (
              <Button variant="outline" onClick={() => handleStatus("confirmed")} disabled={updateMeeting.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />Confirm Meeting
              </Button>
            )}
            {(meeting.status === "pending" || meeting.status === "confirmed") && isEmployer && (
              <Button variant="outline" onClick={() => handleStatus("completed")} disabled={updateMeeting.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />Mark Completed
              </Button>
            )}
            {!isCancelled && !isCompleted && (
              <Button variant="destructive" onClick={() => handleStatus("cancelled")} disabled={updateMeeting.isPending}>
                <XCircle className="h-4 w-4 mr-2" />Cancel Meeting
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
