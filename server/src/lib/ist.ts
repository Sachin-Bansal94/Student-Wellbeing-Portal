export const IST_OFFSET_MINUTES = 330;
const MS_PER_MINUTE = 60_000;

export function istToUtc(dateISO: string, time: string): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

function shiftToIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function istDateISO(date: Date): string {
  return shiftToIst(date).toISOString().slice(0, 10);
}

export function istWeekday(dateISO: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function todayIstISO(): string {
  return istDateISO(new Date());
}

export function minutesFromTime(time: string): number {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatIstDateTime(date: Date): string {
  const ist = shiftToIst(date);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hour24 = ist.getUTCHours();
  const minute = String(ist.getUTCMinutes()).padStart(2, "0");
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${weekdays[ist.getUTCDay()]}, ${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()} at ${hour12}:${minute} ${suffix} IST`;
}

export function formatIstTimeRange(start: Date, end: Date): string {
  const a = shiftToIst(start);
  const b = shiftToIst(end);
  const fmt = (d: Date) => {
    const hour24 = d.getUTCHours();
    const minute = String(d.getUTCMinutes()).padStart(2, "0");
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${minute} ${suffix}`;
  };
  return `${fmt(a)} - ${fmt(b)}`;
}
