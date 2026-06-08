import { useState } from "react";
import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRating, formatReviewCount, getStarArray } from "@/lib/ratingUtils";
import { cn } from "@/lib/utils";

export interface StarRatingProps {
  value: number | null;
  count?: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const sizeClass = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

function StarIcon({ state, className }: { state: "full" | "half" | "empty"; className: string }) {
  if (state === "half") {
    return (
      <span className={cn("relative inline-block", className)}>
        <Star className={cn(className, "text-slate-200")} />
        <Star
          className={cn(className, "text-amber-400 fill-amber-400 absolute inset-0")}
          style={{ clipPath: "inset(0 50% 0 0)" }}
        />
      </span>
    );
  }
  return (
    <Star
      className={cn(
        className,
        state === "full" ? "text-amber-400 fill-amber-400" : "text-slate-200",
      )}
    />
  );
}

export default function StarRating({
  value,
  count = 0,
  onChange,
  readonly,
  size = "md",
  loading,
}: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const interactive = !readonly && !!onChange;
  const iconClass = sizeClass[size];

  if (loading) {
    return <Skeleton className="h-5 w-24" />;
  }

  if ((value === null || value === 0) && count === 0 && (readonly || !onChange)) {
    return <span className="text-sm text-muted-foreground">No reviews yet</span>;
  }

  if (interactive) {
    const display = hover || value || 0;
    return (
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i} stars`}
            className="transition-colors"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(i)}
          >
            <Star
              className={cn(
                iconClass,
                "cursor-pointer transition-colors",
                display >= i ? "text-amber-400 fill-amber-400" : "text-slate-300",
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  const stars = getStarArray(value ?? 0);
  return (
    <div className="flex items-center gap-1">
      {stars.map((state, i) => (
        <StarIcon key={i} state={state} className={iconClass} />
      ))}
      {value != null && count > 0 && (
        <>
          <span className="text-sm font-medium text-slate-700 ml-1">{formatRating(value, count)}</span>
          <span className="text-sm text-muted-foreground">{formatReviewCount(count)}</span>
        </>
      )}
    </div>
  );
}
