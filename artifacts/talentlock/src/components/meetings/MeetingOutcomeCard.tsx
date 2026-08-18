import { useEffect, useId, useRef, useState } from "react";
import { Link } from "wouter";
import {
  usePostMeetingFeedback,
  useGetTeam,
  type Meeting,
  type PostMeetingFeedbackBodyDisposition,
} from "@workspace/api-client-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type RoundType = "next_round" | "final";
type FinalDisposition = "proceed_to_booking" | "rejected";

function getApiError(err: unknown): { status?: number; code?: string; message?: string } {
  if (!err || typeof err !== "object") return {};
  const e = err as { status?: number; data?: { code?: string; error?: string }; message?: string };
  return {
    status: e.status,
    code: e.data?.code,
    message: e.data?.error ?? e.message,
  };
}

export function MeetingOutcomeCard({
  meeting,
  isEmployer,
  onSubmitted,
}: {
  meeting: Meeting;
  isEmployer: boolean;
  onSubmitted: () => void | Promise<unknown>;
}) {
  const { toast } = useToast();
  const submitFeedback = usePostMeetingFeedback();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groupId = useId();

  const { data: team } = useGetTeam({
    query: { enabled: isEmployer && !meeting.hasInterviewFeedback, retry: false } as any,
  });
  const activeMembers = (team?.members ?? []).filter((m) => m.status === "active");
  const useTeamPicker = activeMembers.length > 0;

  const [roundType, setRoundType] = useState<RoundType | "">("");
  const [finalDisposition, setFinalDisposition] = useState<FinalDisposition | "">("");
  const [feedbackText, setFeedbackText] = useState("");
  const [teamMemberId, setTeamMemberId] = useState<string>("");
  const [panelEmail, setPanelEmail] = useState("");
  const [panelName, setPanelName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const hasFeedback = meeting.hasInterviewFeedback;
  const otherName = isEmployer
    ? (meeting.freelancerName ?? "the freelancer")
    : (meeting.employerName ?? "the employer");

  useEffect(() => {
    if (hasFeedback) headingRef.current?.focus();
  }, [hasFeedback, meeting.disposition]);

  // Freelancers never see outcome UI
  if (!isEmployer) return null;
  if (meeting.status !== "completed") return null;

  if (!hasFeedback) {
    const trimmed = feedbackText.trim();
    const disposition: PostMeetingFeedbackBodyDisposition | null =
      roundType === "next_round"
        ? "next_round"
        : roundType === "final" && finalDisposition
          ? finalDisposition
          : null;

    const canSubmit =
      disposition != null &&
      trimmed.length >= 20 &&
      !submitFeedback.isPending &&
      (disposition !== "next_round" ||
        (useTeamPicker ? teamMemberId !== "" : panelEmail.trim().includes("@")));

    const handleSubmit = async () => {
      setFieldError(null);
      setTokenError(null);
      if (!disposition) {
        setFieldError("Choose Next round or Final decision.");
        return;
      }
      if (trimmed.length < 20) {
        setFieldError("Internal notes must be at least 20 characters.");
        return;
      }
      if (disposition === "next_round") {
        if (useTeamPicker && !teamMemberId) {
          setFieldError("Select the next interviewer from your team.");
          return;
        }
        if (!useTeamPicker && !panelEmail.trim().includes("@")) {
          setFieldError("Enter a valid panel email for the next round.");
          return;
        }
      }
      try {
        await submitFeedback.mutateAsync({
          id: meeting.id,
          data: {
            disposition,
            feedbackText: trimmed,
            ...(disposition === "next_round" && useTeamPicker
              ? { nextRoundTeamMemberId: parseInt(teamMemberId, 10) }
              : {}),
            ...(disposition === "next_round" && !useTeamPicker
              ? {
                  nextRoundPanelEmail: panelEmail.trim(),
                  ...(panelName.trim() ? { nextRoundPanelName: panelName.trim() } : {}),
                }
              : {}),
          },
        });
        toast({ title: "Hiring decision submitted" });
        await onSubmitted();
      } catch (err: unknown) {
        const { status, code, message } = getApiError(err);
        if (status === 409) {
          toast({ title: "Outcome already submitted" });
          await onSubmitted();
          return;
        }
        if (status === 402 && code === "TOKEN_LIMIT") {
          setTokenError(
            message ??
              "Monthly AI token limit reached. Handoff summary could not be generated — upgrade or wait for reset.",
          );
          return;
        }
        toast({
          title: "Could not submit decision",
          description: message ?? "Please try again.",
          variant: "destructive",
        });
      }
    };

    return (
      <div className="rounded-xl border-2 border-primary/30 bg-amber-50 px-4 py-4 space-y-4">
        <div>
          <h2 className="font-semibold text-base text-foreground">Hiring decision</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Internal interview notes — not shared with the candidate. Required before booking from this meeting.
          </p>
        </div>

        <div role="radiogroup" aria-labelledby={`${groupId}-round`} className="flex flex-wrap gap-3">
          <span id={`${groupId}-round`} className="sr-only">Round type</span>
          {(
            [
              { value: "next_round" as const, label: "Next round" },
              { value: "final" as const, label: "Final decision" },
            ]
          ).map((option) => {
            const selected = roundType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setRoundType(option.value);
                  if (option.value === "next_round") setFinalDisposition("");
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors bg-background",
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-foreground hover:bg-muted/50",
                )}
              >
                <CheckCircle2 className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-30")} />
                {option.label}
              </button>
            );
          })}
        </div>

        {roundType === "final" && (
          <div role="radiogroup" aria-label="Final decision" className="flex flex-wrap gap-3">
            {(
              [
                { value: "proceed_to_booking" as const, label: "Proceed to booking" },
                { value: "rejected" as const, label: "Do not hire" },
              ]
            ).map((option) => {
              const selected = finalDisposition === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFinalDisposition(option.value)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors bg-background",
                    selected
                      ? option.value === "proceed_to_booking"
                        ? "border-green-300 bg-green-50 text-green-900"
                        : "border-slate-300 bg-slate-100 text-slate-900"
                      : "border-border text-foreground hover:bg-muted/50",
                  )}
                >
                  <CheckCircle2 className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-30")} />
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`${groupId}-feedback`}>Internal notes</Label>
          <Textarea
            id={`${groupId}-feedback`}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Strengths, concerns, topics for the next interviewer…"
            rows={4}
            maxLength={2000}
            className="resize-y bg-background"
          />
          <p className="text-xs text-muted-foreground">
            {trimmed.length < 20
              ? `min 20 characters (${trimmed.length}/20)`
              : `${trimmed.length}/2000`}
          </p>
        </div>

        {roundType === "next_round" && useTeamPicker && (
          <div className="space-y-2">
            <Label>Next interviewer</Label>
            <Select value={teamMemberId} onValueChange={setTeamMemberId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select team member…" />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.displayName || m.displayEmail || m.invitedEmail}
                    {m.role ? ` · ${m.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {roundType === "next_round" && !useTeamPicker && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${groupId}-email`}>Next-round panel email</Label>
              <Input
                id={`${groupId}-email`}
                type="email"
                value={panelEmail}
                onChange={(e) => setPanelEmail(e.target.value)}
                placeholder="interviewer@company.com"
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${groupId}-name`}>Panel name (optional)</Label>
              <Input
                id={`${groupId}-name`}
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                placeholder="Alex Chen"
                className="bg-background"
              />
            </div>
          </div>
        )}

        {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
        {tokenError && (
          <p className="text-sm text-destructive border border-destructive/30 rounded-md bg-destructive/5 px-3 py-2">
            {tokenError}
          </p>
        )}

        <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {submitFeedback.isPending
            ? roundType === "next_round"
              ? "Generating handoff summary…"
              : "Submitting…"
            : "Submit decision"}
        </Button>
      </div>
    );
  }

  const disposition = meeting.disposition;

  if (disposition === "proceed_to_booking") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900 space-y-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-base outline-none">
          Proceed to booking
        </h2>
        <p className="text-green-800">
          Decision saved to hiring notes. You can book {otherName} when ready.
        </p>
        {meeting.feedbackText && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-green-700 mb-1">Internal notes</p>
            <p className="whitespace-pre-wrap text-green-900/90">{meeting.feedbackText}</p>
          </div>
        )}
        <Button size="sm" asChild className="mt-1">
          <Link href={`/freelancers/${meeting.freelancerId}?fromMeeting=${meeting.id}`}>
            Book {otherName} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>
    );
  }

  if (disposition === "next_round") {
    const panel =
      meeting.nextRoundPanelName ||
      meeting.nextRoundPanelEmail ||
      (meeting.nextRoundTeamMemberId != null ? "your team member" : "the next interviewer");
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-950 space-y-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-base outline-none">
          Next round
        </h2>
        <p>
          Handoff summary sent to {panel}. The candidate cannot see these notes.
        </p>
        {meeting.feedbackSummary && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-teal-700 mb-1">Handoff summary</p>
            <p className="whitespace-pre-wrap">{meeting.feedbackSummary}</p>
          </div>
        )}
        {meeting.feedbackText && (
          <details className="text-sm">
            <summary className="cursor-pointer text-teal-800 font-medium">Full internal notes</summary>
            <p className="mt-2 whitespace-pre-wrap text-teal-950/90">{meeting.feedbackText}</p>
          </details>
        )}
      </div>
    );
  }

  if (disposition === "rejected") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 space-y-3">
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold text-base outline-none">
          Do not hire
        </h2>
        <p className="text-slate-600">
          Decision saved to hiring notes. Notes stay internal — not sent to the candidate.
        </p>
        {meeting.feedbackText && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">Internal notes</p>
            <p className="whitespace-pre-wrap">{meeting.feedbackText}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
