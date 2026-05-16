/**
 * Calendar utilities for TalentLock Discovery Meetings.
 * No OAuth required — these build deep links / .ics files that work with the
 * user's existing calendar app (Google, Outlook, Apple, Yahoo, etc.).
 */

type CalendarParams = {
  title: string;
  startDate: string;
  endDate: string;
  details?: string;
  location?: string;
  /** Email addresses to pre-load as attendees/guests */
  guests?: string[];
};

const fmtUtc = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

/**
 * Builds a "Add to Google Calendar" URL that pre-fills an event,
 * including both parties as guests so no manual adding is needed.
 */
export function buildGoogleCalendarUrl(params: CalendarParams): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set("dates", `${fmtUtc(params.startDate)}/${fmtUtc(params.endDate)}`);
  if (params.details) url.searchParams.set("details", params.details);
  if (params.location) url.searchParams.set("location", params.location);
  // Pre-load guest emails — Google Calendar renders these as invited attendees
  for (const email of params.guests ?? []) {
    url.searchParams.append("add", email);
  }
  return url.toString();
}

/**
 * Builds an Outlook.com (web) calendar deeplink. Works for personal Outlook /
 * Hotmail / Live accounts. Office 365 users can also import the .ics file.
 */
export function buildOutlookCalendarUrl(params: CalendarParams): string {
  const url = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  url.searchParams.set("subject", params.title);
  url.searchParams.set("startdt", new Date(params.startDate).toISOString());
  url.searchParams.set("enddt", new Date(params.endDate).toISOString());
  if (params.details) url.searchParams.set("body", params.details);
  if (params.location) url.searchParams.set("location", params.location);
  // Outlook web compose supports pre-filling required attendees
  if (params.guests?.length) {
    url.searchParams.set("to", params.guests.join(";"));
  }
  return url.toString();
}

/**
 * Builds an RFC 5545 .ics file body with ATTENDEE lines so that opening
 * it in Apple Calendar / Outlook desktop shows a proper meeting invite.
 */
export function buildIcsContent(params: CalendarParams): string {
  const uid = `talentlock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@talentlock`;
  const stamp = fmtUtc(new Date().toISOString());
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

  const hasGuests = (params.guests?.length ?? 0) > 0;
  const attendeeLines = (params.guests ?? []).map(
    (email) =>
      `ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${email}`
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TalentLock//Discovery Meetings//EN",
    "CALSCALE:GREGORIAN",
    // METHOD:REQUEST triggers a proper meeting invite in calendar clients
    hasGuests ? "METHOD:REQUEST" : "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${fmtUtc(params.startDate)}`,
    `DTEND:${fmtUtc(params.endDate)}`,
    `SUMMARY:${escape(params.title)}`,
    params.details ? `DESCRIPTION:${escape(params.details)}` : "",
    params.location ? `LOCATION:${escape(params.location)}` : "",
    ...attendeeLines,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/**
 * Triggers a download of an .ics file in the browser. The user's OS will
 * usually open it directly in Apple Calendar / Outlook on click.
 */
export function downloadIcsFile(filename: string, params: CalendarParams): void {
  const ics = buildIcsContent(params);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
