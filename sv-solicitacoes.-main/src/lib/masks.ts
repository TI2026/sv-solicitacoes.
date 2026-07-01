/**
 * Input masks and validators for Brazilian formats
 */

/** CPF: 000.000.000-00 */
export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

/** Phone: (00) 00000-0000 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Vehicle plate: ABC-1D23 or ABC-1234 */
export function maskPlate(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

export function isValidPlate(plate: string): boolean {
  const clean = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Old format: AAA1234 or Mercosul: AAA1A23
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(clean);
}

/** KM: only digits, max 7 chars */
export function maskKM(value: string): string {
  return value.replace(/\D/g, '').slice(0, 7);
}

/** Currency: formats as Brazilian currency input */
export function maskCurrency(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  const num = parseInt(digits) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function currencyToNumber(formatted: string): number {
  if (!formatted) return 0;
  return parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0;
}

/** Today's date as YYYY-MM-DD in Brasília timezone */
export function todayBR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Max date allowed (today) */
export function maxDateToday(): string {
  return todayBR();
}

/** Min date allowed (today) — for future-only fields */
export function minDateToday(): string {
  return todayBR();
}

/** Bank agency: max 6 digits with optional dash */
export function maskAgency(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/** Bank account: max 13 digits with dash */
export function maskAccount(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 1) return digits;
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

/** Hours: 0-24 with .5 steps */
export function clampHours(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  if (num < 0) return '0';
  if (num > 24) return '24';
  return String(Math.round(num * 2) / 2);
}

/** Salary: positive number, max 999999.99 */
export function clampSalary(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  if (num < 0) return '0';
  if (num > 999999.99) return '999999.99';
  return value;
}
