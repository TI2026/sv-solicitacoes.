const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return timestamp;
}

export function inclusiveDailyCount(startDate: string, endDate: string): number {
  const start = utcDay(startDate);
  const end = utcDay(endDate);
  if (start === null || end === null || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function dailyAllowanceTotal(days: number, dailyRate: number): number {
  if (!Number.isInteger(days) || days < 1 || !Number.isFinite(dailyRate) || dailyRate <= 0) return 0;
  return Math.round(days * dailyRate * 100) / 100;
}
