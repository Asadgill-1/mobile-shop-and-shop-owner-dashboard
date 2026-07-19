// SHARED with owner-dashboard-mobile — edit both (PLAN §3.4)
// Port of app/reports/service.py parse_period: Asia/Dubai [start, end) windows.
// The business is UAE-only; Dubai is UTC+4 with no DST, so a fixed offset is exact.
// created_at is timestamptz — comparing against these instants maps the Dubai day correctly.

const OFFSET_MS = 4 * 60 * 60 * 1000;

export type PeriodKey = "today" | "yesterday" | "weekly" | "monthly" | string;

export interface Period {
  start: Date;
  end: Date; // exclusive
  label: string;
  key: string;
}

/** The current date in Dubai, as {y, m (0-based), d}. */
function dubaiToday(now = new Date()): { y: number; m: number; d: number } {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/** Dubai midnight of (y, m, d) as a UTC instant. */
function day(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - OFFSET_MS);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(y: number, m: number, d: number): string {
  return `${MONTHS[m]} ${String(d).padStart(2, "0")}, ${y}`;
}

/** today | yesterday | weekly (last 7 Dubai days) | monthly (1st → today) | YYYY-MM-DD. */
export function parsePeriod(arg?: string | null, now = new Date()): Period {
  const key = (arg || "today").trim().toLowerCase();
  const { y, m, d } = dubaiToday(now);

  if (key === "" || key === "today") {
    return { start: day(y, m, d), end: day(y, m, d + 1), label: `Today (${fmt(y, m, d)})`, key: "today" };
  }
  if (key === "yesterday") {
    const s = day(y, m, d - 1);
    const yd = new Date(s.getTime() + OFFSET_MS);
    return {
      start: s, end: day(y, m, d), key: "yesterday",
      label: `Yesterday (${fmt(yd.getUTCFullYear(), yd.getUTCMonth(), yd.getUTCDate())})`,
    };
  }
  if (key === "weekly") {
    const s = day(y, m, d - 6);
    const sd = new Date(s.getTime() + OFFSET_MS);
    return {
      start: s, end: day(y, m, d + 1), key: "weekly",
      label: `Last 7 days (${MONTHS[sd.getUTCMonth()]} ${sd.getUTCDate()} – ${MONTHS[m]} ${d})`,
    };
  }
  if (key === "monthly") {
    return {
      start: day(y, m, 1), end: day(y, m, d + 1), key: "monthly",
      label: `This month (${["January","February","March","April","May","June","July","August","September","October","November","December"][m]} ${y})`,
    };
  }
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (parsed) {
    const [py, pm, pd] = [Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])];
    return { start: day(py, pm, pd), end: day(py, pm, pd + 1), label: fmt(py, pm, pd), key };
  }
  // Unknown arg → today (a URL param is not a trusted input; never crash a page on it).
  return parsePeriod("today", now);
}

/** ISO date (YYYY-MM-DD) of "today" in Dubai — for counter_sales.sold_on comparisons. */
export function dubaiDateISO(now = new Date()): string {
  const { y, m, d } = dubaiToday(now);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Format a timestamptz for display in Dubai time. */
export function fmtDubai(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "—";
  const s = new Date(t.getTime() + OFFSET_MS);
  const date = `${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}`;
  if (!withTime) return date;
  const hh = String(s.getUTCHours()).padStart(2, "0");
  const mm = String(s.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm}`;
}
