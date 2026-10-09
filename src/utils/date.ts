import type { CalendarConfig } from '../types';

export const EPOCH = '1970-01-01';
const DAY_MS = 86_400_000;

/** Nama hari pendek (index = Date.getUTCDay(), 0 = Minggu). */
export const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
/** Nama hari panjang. */
export const DAY_NAMES_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** Nama bulan pendek. */
export const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** Nama bulan panjang. */
export const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function parseDate(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isValidISO(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(parseDate(value).getTime());
}

export function addDays(iso: string, days: number): string {
  return formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);
}

export function dayOfWeek(iso: string): number {
  return parseDate(iso).getUTCDay();
}

export function isWeekend(iso: string, weekendDays: number[]): boolean {
  return weekendDays.includes(dayOfWeek(iso));
}

export function isHoliday(iso: string, calendar: CalendarConfig): boolean {
  return calendar.holidays.some((h) => h.date === iso);
}

export function isWorkingDay(iso: string, calendar: CalendarConfig): boolean {
  return !isWeekend(iso, calendar.weekendDays) && !isHoliday(iso, calendar);
}

/** Geser maju sampai menemui hari kerja terdekat (termasuk hari itu sendiri). */
export function nextWorkingDay(iso: string, calendar: CalendarConfig): string {
  let current = iso;
  for (let i = 0; i < 3660; i += 1) {
    if (isWorkingDay(current, calendar)) return current;
    current = addDays(current, 1);
  }
  return iso;
}

/**
 * Menambah `days` hari kerja dari sebuah tanggal.
 * addWorkingDays(x, 0) mengembalikan hari kerja terdekat >= x.
 */
export function addWorkingDays(iso: string, days: number, calendar: CalendarConfig): string {
  let current = nextWorkingDay(iso, calendar);
  let remaining = Math.max(0, Math.round(days));
  while (remaining > 0) {
    current = nextWorkingDay(addDays(current, 1), calendar);
    remaining -= 1;
  }
  return current;
}

/** Menghitung jumlah hari kerja inklusif di rentang [from, to]. */
export function countWorkingDays(from: string, to: string, calendar: CalendarConfig): number {
  if (diffDays(from, to) < 0) return 0;
  let count = 0;
  let cursor = from;
  while (diffDays(cursor, to) >= 0) {
    if (isWorkingDay(cursor, calendar)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * Indeks hari kerja sebuah tanggal = jumlah hari kerja di rentang [EPOCH, tanggal).
 * Hari non-kerja memiliki indeks yang sama dengan hari kerja berikutnya,
 * sehingga aritmetika CPM (FS/SS + lag) dapat dilakukan murni di ruang indeks.
 */
export function workIndex(iso: string, calendar: CalendarConfig): number {
  const total = diffDays(EPOCH, iso);
  if (total <= 0) return 0;
  const weekend = calendar.weekendDays;
  const weeks = Math.floor(total / 7);
  let nonWorking = weeks * weekend.length;
  const partialStart = addDays(EPOCH, weeks * 7);
  for (let cursor = partialStart; diffDays(cursor, iso) > 0; cursor = addDays(cursor, 1)) {
    if (weekend.includes(dayOfWeek(cursor))) nonWorking += 1;
  }
  for (const holiday of calendar.holidays) {
    if (holiday.date >= EPOCH && holiday.date < iso && !isWeekend(holiday.date, weekend)) {
      nonWorking += 1;
    }
  }
  return Math.max(0, total - nonWorking);
}

/** Kebalikan workIndex: hari kerja ke-`index` (berbasis EPOCH). */
export function dateFromWorkIndex(index: number, calendar: CalendarConfig): string {
  const base = nextWorkingDay(EPOCH, calendar);
  if (index <= 0) return base;
  return addWorkingDays(base, index, calendar);
}

/** Awal pekan (Senin) dari tanggal tertentu. */
export function startOfWeek(iso: string): string {
  const offsetToMonday = (dayOfWeek(iso) + 6) % 7;
  return addDays(iso, -offsetToMonday);
}

/** Tanggal hari ini (waktu lokal) dalam format ISO. */
export function todayISO(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Contoh: "12 Okt 2026". */
export function formatDisplay(iso: string): string {
  if (!isValidISO(iso)) return '-';
  const d = parseDate(iso);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Contoh: "Senin, 12 Okt 2026". */
export function formatDisplayLong(iso: string): string {
  if (!isValidISO(iso)) return '-';
  const d = parseDate(iso);
  return `${DAY_NAMES_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface MonthSegment {
  label: string;
  start: string;
  days: number;
}

/** Memecah rentang tanggal menjadi segmen-segmen bulan (untuk header Gantt). */
export function monthSegments(from: string, to: string): MonthSegment[] {
  const segments: MonthSegment[] = [];
  if (diffDays(to, from) < 0) return segments;
  let cursor = from;
  while (diffDays(cursor, to) >= 0) {
    const d = parseDate(cursor);
    const lastOfMonth = formatDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const segEnd = diffDays(lastOfMonth, to) >= 0 ? lastOfMonth : to;
    segments.push({
      label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      start: cursor,
      days: diffDays(cursor, segEnd) + 1,
    });
    cursor = addDays(segEnd, 1);
  }
  return segments;
}
