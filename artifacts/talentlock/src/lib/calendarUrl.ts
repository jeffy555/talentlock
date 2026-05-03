/**
 * Builds a "Add to Google Calendar" URL that pre-fills an event.
 * No OAuth or API key required — the user clicks the link and saves from their own Google Calendar.
 */
export function buildGoogleCalendarUrl(params: {
  title: string;
  startDate: string;
  endDate: string;
  details?: string;
}): string {
  // Format: YYYYMMDDTHHmmssZ
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set("dates", `${fmt(params.startDate)}/${fmt(params.endDate)}`);
  if (params.details) url.searchParams.set("details", params.details);
  return url.toString();
}
