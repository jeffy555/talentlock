import { Link } from "wouter";
import { useGetEmployerCandidateNotes } from "@workspace/api-client-react";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const dispositionLabel: Record<string, string> = {
  proceed_to_booking: "Proceed to booking",
  rejected: "Do not hire",
};

export function HiringNotesCard({ freelancerId }: { freelancerId: number }) {
  const { data, isLoading, isError, error } = useGetEmployerCandidateNotes(freelancerId, {
    query: {
      enabled: freelancerId > 0,
      retry: false,
    } as any,
  });

  const notFound = isError && (error as { status?: number })?.status === 404;

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Hiring notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (notFound || !data) {
    return (
      <Card className="border-border border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" /> Hiring notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No interview outcomes recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Hiring notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-medium">Latest decision:</span>{" "}
          {dispositionLabel[data.disposition] ?? data.disposition}
          {data.latestMeetingId != null && (
            <>
              {" · "}
              <span className="text-muted-foreground">
                from Meeting #{data.latestMeetingId} ·{" "}
                {format(new Date(data.updatedAt), "d MMM yyyy")}
              </span>
            </>
          )}
        </p>
        <p className="whitespace-pre-wrap text-muted-foreground line-clamp-6">{data.feedbackText}</p>
        {data.latestMeetingId != null && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/meetings/${data.latestMeetingId}`}>View meeting</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
