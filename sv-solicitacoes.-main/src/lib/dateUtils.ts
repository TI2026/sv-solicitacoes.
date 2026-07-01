/**
 * Utility functions for consistent timezone handling (America/Sao_Paulo).
 */

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Converts a date string + time string (from HTML inputs) to an ISO 8601 string
 * with the correct Brasília offset. This prevents the "17:50 becomes 14:24" bug.
 *
 * HTML date input returns "2026-03-04", time input returns "17:50".
 * We interpret these as Brasília local time and produce a proper timestamptz string.
 */
export function toTimestampTZ(date: string, time: string): string {
  // Build a Date object interpreted as local Brasília time
  // We use Intl to figure out the current UTC offset for Brasília
  const naive = new Date(`${date}T${time}:00`);

  // Get the offset for Brasília at that specific date/time
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset',
  });
  const parts = formatter.formatToParts(naive);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  // tzPart.value is like "GMT-03:00" or "GMT-02:00" (during DST, though Brazil no longer uses DST)
  const offsetStr = tzPart?.value?.replace('GMT', '') || '-03:00';

  return `${date}T${time}:00${offsetStr}`;
}

/**
 * Formats a timestamptz string for display in Brasília timezone.
 */
export function formatDateTimeBR(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

/**
 * Formats just the date portion in Brasília timezone.
 */
export function formatDateBR(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoString));
}

/**
 * Check if a timestamptz is in the past (compared to real current time).
 */
export function isDateTimePast(isoString: string | null | undefined): boolean {
  if (!isoString) return false;
  return new Date(isoString).getTime() <= Date.now();
}
