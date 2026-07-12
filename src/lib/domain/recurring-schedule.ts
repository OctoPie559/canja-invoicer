import { ValidationError } from "./errors";

/**
 * Recurring-schedule domain (brief §107, slice 7). Pure date math + the
 * status machine; no I/O. A schedule fires when `now >= nextRunAt`, then
 * advances to the next occurrence; it ends when the end date is reached.
 */

export const RECURRING_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export type RecurringStatus = "active" | "paused" | "ended";

const MONTHS: Record<Exclude<RecurringFrequency, "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Add whole months, clamping the day to the target month's last day
 * (31 Jan + 1 month → 28/29 Feb, never rolling into March). UTC. */
function addMonths(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const day = base.getUTCDate();
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  // day 0 of the *next* month = last day of the target month
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDay),
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
    ),
  );
}

/** The next occurrence strictly after `from`, per frequency × interval. */
export function computeNextRun(
  from: Date,
  frequency: RecurringFrequency,
  intervalCount: number,
): Date {
  if (!Number.isInteger(intervalCount) || intervalCount < 1) {
    throw new ValidationError("Interval must be a whole number ≥ 1");
  }
  if (frequency === "weekly") {
    return new Date(from.getTime() + intervalCount * 7 * 86_400_000);
  }
  return addMonths(from, MONTHS[frequency] * intervalCount);
}

/**
 * Is this schedule due to generate at `now`? Active, its next run has
 * arrived, and it has not passed its end date.
 */
export function isDue(
  schedule: {
    status: RecurringStatus;
    nextRunAt: Date | null;
    endDate: string | null;
  },
  now: Date,
): boolean {
  if (schedule.status !== "active" || !schedule.nextRunAt) return false;
  if (schedule.nextRunAt > now) return false;
  if (schedule.endDate && schedule.nextRunAt.toISOString().slice(0, 10) > schedule.endDate) {
    return false;
  }
  return true;
}

/** After generating, has the schedule reached the end of its life? */
export function reachedEnd(
  nextRunAt: Date,
  endDate: string | null,
): boolean {
  if (!endDate) return false;
  return nextRunAt.toISOString().slice(0, 10) > endDate;
}

const TRANSITIONS: Record<RecurringStatus, readonly RecurringStatus[]> = {
  active: ["paused", "ended"],
  paused: ["active", "ended"],
  ended: [],
};

export function canRecurringTransition(
  from: RecurringStatus,
  to: RecurringStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertRecurringTransition(
  from: RecurringStatus,
  to: RecurringStatus,
): void {
  if (!canRecurringTransition(from, to)) {
    throw new ValidationError(`A schedule cannot go from ${from} to ${to}`);
  }
}

const FREQUENCY_NOUNS: Record<RecurringFrequency, string> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

/** Human phrasing for a frequency × interval, e.g. "Every 2 weeks". */
export function describeFrequency(
  frequency: string,
  intervalCount: number,
): string {
  const noun = FREQUENCY_NOUNS[frequency as RecurringFrequency] ?? frequency;
  return intervalCount === 1
    ? `Every ${noun}`
    : `Every ${intervalCount} ${noun}s`;
}
