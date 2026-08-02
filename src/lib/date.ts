const CT = "America/Chicago";

/** Calendar date in America/Chicago (YYYY-MM-DD). */
export function playDateCT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatPlayDateLabel(playDate: string): string {
  const [y, m, d] = playDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(utc)
    .toLowerCase();
}

/** ms until next Midnight CT */
export function msUntilNextMidnightCT(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const y = get("year");
  const m = get("month");
  const d = get("day");
  const h = get("hour") === 24 ? 0 : get("hour");
  const min = get("minute");
  const s = get("second");

  const elapsed =
    ((h * 60 + min) * 60 + s) * 1000 + (now.getMilliseconds() % 1000);
  const dayMs = 24 * 60 * 60 * 1000;
  return dayMs - elapsed;
}

export { CT };
