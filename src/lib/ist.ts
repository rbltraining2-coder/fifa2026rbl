// Centralised India Standard Time (Asia/Kolkata, UTC+5:30) formatters.
// All match_time values are stored in UTC in the database. The UI always
// renders them in IST so every user sees the same Indian kickoff time
// regardless of their browser's local timezone.

export const IST_TZ = "Asia/Kolkata";
export const IST_LABEL = "IST";

/** "Sat, 15 Jun · 10:30 PM" in IST. */
export function formatIstDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: IST_TZ,
  });
}

/** "SAT 10:30 PM" — compact card label. */
export function formatIstShort(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return d
    .toLocaleString("en-IN", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: IST_TZ,
    })
    .toUpperCase();
}

/**
 * Convert a <input type="datetime-local"> value (e.g. "2026-06-15T18:30")
 * — which the browser treats as the user's local timezone — into a UTC
 * ISO string, interpreting the wall-clock as IST. Returns "" on bad input.
 */
export function istLocalInputToUtcIso(local: string): string {
  if (!local) return "";
  // IST is a fixed offset (no DST), so direct construction is exact.
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const fallback = new Date(local);
    return isNaN(fallback.getTime()) ? "" : fallback.toISOString();
  }
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}+05:30`;
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}