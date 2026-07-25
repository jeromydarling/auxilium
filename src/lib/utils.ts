import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ISO-8601 UTC — the only timestamp format written to D1. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Whole days between two ISO timestamps. Negative when `to` precedes `from`. */
export function daysBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

/** "3 days ago" / "in 2 days" / "today". Kind, not clever. */
export function relativeDays(iso: string | null | undefined, now = new Date().toISOString()): string {
  const days = daysBetween(iso, now);
  if (days === null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days > 0) return `${days} days ago`;
  return `in ${Math.abs(days)} days`;
}
