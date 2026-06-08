import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import type { PublicReview } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import StarRating from "@/components/StarRating";

export interface ReviewCardProps {
  review: PublicReview;
  showReplyInput?: boolean;
  onReplySubmit?: (reviewId: number, reply: string) => Promise<void>;
}

export default function ReviewCard({ review, showReplyInput, onReplySubmit }: ReviewCardProps) {
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const handleReply = async () => {
    if (!onReplySubmit || !replyText.trim()) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      await onReplySubmit(review.id, replyText.trim());
      setReplyText("");
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string; code?: string } })?.body;
      if (body?.code === "REPLY_ALREADY_EXISTS") {
        setReplyError("You have already replied to this review.");
      } else {
        setReplyError(body?.error ?? "Failed to submit reply.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <StarRating value={review.rating} readonly size="sm" count={1} />
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">{review.employerDisplayName}</p>
          <p className="text-xs text-muted-foreground">{format(new Date(review.createdAt), "MMM d, yyyy")}</p>
        </div>
      </div>

      {review.comment && (
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{review.comment}</p>
      )}

      {review.reply != null && (
        <div className="mt-3 border-l-2 border-slate-200 bg-slate-50 pl-3 py-2 rounded-sm">
          <p className="text-xs font-medium text-slate-500 mb-1">Freelancer&apos;s reply:</p>
          <p className="text-sm text-slate-600">{review.reply}</p>
          {review.repliedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Replied {format(new Date(review.repliedAt), "MMM d, yyyy")}
            </p>
          )}
        </div>
      )}

      {showReplyInput && review.reply == null && onReplySubmit && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Textarea
              rows={3}
              maxLength={1000}
              placeholder="Write a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="resize-none pr-16"
            />
            <span className="absolute top-2 right-2 text-xs text-muted-foreground">
              {replyText.length}/1000
            </span>
          </div>
          {replyError && <p className="text-sm text-red-500">{replyError}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleReply} disabled={submitting || !replyText.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Submitting...
                </>
              ) : (
                "Submit Reply"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
