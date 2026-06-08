export function formatRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return "No reviews yet";
  return `${avg.toFixed(1)}`;
}

export function formatReviewCount(count: number): string {
  if (count === 0) return "";
  return `(${count} ${count === 1 ? "review" : "reviews"})`;
}

export function getStarArray(rating: number): ("full" | "half" | "empty")[] {
  return [1, 2, 3, 4, 5].map((i) => {
    if (rating >= i) return "full";
    if (rating >= i - 0.5) return "half";
    return "empty";
  });
}
