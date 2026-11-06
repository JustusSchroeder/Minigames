import type { GameDate } from "@meridian/shared";

const MONTH_DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeap(year)) return 29;
  return MONTH_DAYS[month] ?? 30;
}

export function addHours(date: GameDate, hours: number): GameDate {
  if (!Number.isInteger(hours) || hours < 0) {
    throw new Error("hours must be a non-negative integer");
  }
  let year = date.year;
  let month = date.month;
  let day = date.day;
  let hour = date.hour + hours;
  while (hour >= 24) {
    hour -= 24;
    day += 1;
    const limit = daysInMonth(year, month);
    if (day > limit) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return { year, month, day, hour };
}

export function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour;
}
