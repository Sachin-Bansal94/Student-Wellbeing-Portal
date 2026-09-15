function toIcsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export type IcsEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendeeEmail: string;
  cancelled?: boolean;
};

export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IIT ISM Wellbeing//Appointment Booking//EN",
    "CALSCALE:GREGORIAN",
    event.cancelled ? "METHOD:CANCEL" : "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsStamp(new Date())}`,
    `DTSTART:${toIcsStamp(event.startsAt)}`,
    `DTEND:${toIcsStamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    `ORGANIZER:mailto:${event.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${event.attendeeEmail}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    event.cancelled ? "SEQUENCE:1" : "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Counselling appointment in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
