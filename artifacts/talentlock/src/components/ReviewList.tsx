import { useState } from "react";
import { useListFreelancerReviews, useReplyToReview } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ReviewCard from "@/components/ReviewCard";
import { useQueryClient } from "@tanstack/react-query";

export interface ReviewListProps {
  freelancerId: number;
  showReplyInput?: boolean;
}

export default function ReviewList({ freelancerId, showReplyInput }: ReviewListProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const qc = useQueryClient();
  const replyMutation = useReplyToReview();

  const { data, isLoading, isError, refetch, isFetching } = useListFreelancerReviews(
    freelancerId,
    { page, pageSize },
    { query: { enabled: freelancerId > 0 } as never },
  );

  const handleReply = async (reviewId: number, reply: string) => {
    await replyMutation.mutateAsync({ id: reviewId, data: { reply } });
    await qc.invalidateQueries({ queryKey: [`/api/reviews/freelancer/${freelancerId}`] });
    await refetch();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Could not load reviews.{" "}
        <button type="button" className="underline hover:text-foreground" onClick={() => refetch()}>
          Retry
        </button>
      </p>
    );
  }

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  if (total === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        <p>No reviews yet.</p>
        <p className="mt-1">Be the first to work with this freelancer and leave a review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-800">
        Reviews{" "}
        <span className="text-muted-foreground font-normal text-sm">({total})</span>
      </h3>

      <div className="space-y-3">
        {items.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            showReplyInput={showReplyInput}
            onReplySubmit={showReplyInput ? handleReply : undefined}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
