const IST = "Asia/Kolkata";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: IST,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatDayShort(dateISO: string): { weekday: string; day: string; month: string } {
  const date = new Date(`${dateISO}T12:00:00+05:30`);
  return {
    weekday: date.toLocaleDateString("en-IN", { timeZone: IST, weekday: "short" }),
    day: date.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric" }),
    month: date.toLocaleDateString("en-IN", { timeZone: IST, month: "short" }),
  };
}

export function isMorning(iso: string): boolean {
  const hour = Number(
    new Date(iso).toLocaleString("en-GB", { timeZone: IST, hour: "2-digit", hour12: false })
  );
  return hour < 13;
}

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

export function addDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T12:00:00+05:30`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA", { timeZone: IST });
}
