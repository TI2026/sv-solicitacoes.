export interface DailyPeriodRecord {
  data_abastecimento?: string | null;
  daily_start_date?: string | null;
  daily_end_date?: string | null;
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  daily_quantity?: number | null;
  daily_value?: number | null;
  valor?: number | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDateValue(value: string): number {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error('DAILY_DATE_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = Date.UTC(year, month - 1, day);
  const check = new Date(result);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) throw new Error('DAILY_DATE_INVALID');
  return result;
}

/** Inclusive calendar-day count; independent from locale, DST, month or year. */
export function calculateDailyQuantity(startDate: string, endDate: string): number {
  const start = utcDateValue(startDate);
  const end = utcDateValue(endDate);
  if (end < start) throw new Error('DAILY_PERIOD_INVALID');
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function isDailyDateTimeRangeValid(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): boolean {
  try {
    const start = Date.parse(`${startDate}T${startTime}:00Z`);
    const end = Date.parse(`${endDate}T${endTime}:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  } catch {
    return false;
  }
}

export function calculateDailyTotal(quantity: number, dailyRate: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(dailyRate) || dailyRate < 0) {
    throw new Error('DAILY_VALUE_INVALID');
  }
  return Math.round(quantity * dailyRate * 100) / 100;
}

/** Read-only compatibility for historical one-date requests. */
export function normalizeDailyPeriod(record: DailyPeriodRecord) {
  const startDate = record.daily_start_date || record.data_abastecimento || '';
  const endDate = record.daily_end_date || startDate;
  const quantity = record.daily_quantity || (startDate ? calculateDailyQuantity(startDate, endDate) : 1);
  const dailyRate = Number(record.daily_value ?? record.valor ?? 0);
  const total = Number(record.valor ?? calculateDailyTotal(quantity, dailyRate));
  return { startDate, endDate, quantity, dailyRate, total };
}
