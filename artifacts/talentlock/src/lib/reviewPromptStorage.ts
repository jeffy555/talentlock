export function reviewPromptDismissKey(bookingId: number): string {
  return `tl_review_prompt_dismissed_${bookingId}`;
}

export function isReviewPromptDismissed(bookingId: number): boolean {
  try {
    return sessionStorage.getItem(reviewPromptDismissKey(bookingId)) === "true";
  } catch {
    return false;
  }
}

export function dismissReviewPrompt(bookingId: number): void {
  try {
    sessionStorage.setItem(reviewPromptDismissKey(bookingId), "true");
  } catch {
    // sessionStorage unavailable
  }
}
