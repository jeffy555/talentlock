import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import StarRating from "@/components/StarRating";

export interface ReviewPromptProps {
  bookingId: number;
  freelancerName: string;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
  onDismiss: () => void;
  isSubmitting: boolean;
}

export default function ReviewPrompt({
  freelancerName,
  onSubmit,
  onDismiss,
  isSubmitting,
}: ReviewPromptProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (rating === 0) {
      setValidationError("Please select a star rating before submitting.");
      return;
    }
    setValidationError(null);
    await onSubmit(rating, comment);
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        ⭐ How was your experience with {freelancerName}?
      </p>

      <div className="mt-3">
        <StarRating value={rating} onChange={setRating} size="lg" />
        {validationError && (
          <p className="text-sm text-red-500 mt-1">{validationError}</p>
        )}
      </div>

      <div className="mt-3 relative">
        <Textarea
          rows={3}
          maxLength={1000}
          placeholder="Share more about your experience (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="resize-none bg-white pr-16"
        />
        <span className="absolute top-2 right-2 text-xs text-muted-foreground">
          {comment.length}/1000
        </span>
      </div>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={isSubmitting}>
          Skip for now
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
              Submitting...
            </>
          ) : (
            "Submit Review"
          )}
        </Button>
      </div>
    </div>
  );
}
