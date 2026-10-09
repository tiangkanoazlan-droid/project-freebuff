import { describe, expect, it } from 'vitest';
import type { CalendarConfig } from '../types';
import {
  addWorkingDays,
  countWorkingDays,
  dateFromWorkIndex,
  isWorkingDay,
  nextWorkingDay,
  workIndex,
} from './date';

// Referensi: 2026-10-09 = Jumat, 2026-10-12 = Senin.
const calendar: CalendarConfig = {
  weekendDays: [0, 6],
  holidays: [{ id: 'h1', date: '2026-10-16', name: 'Libur Khusus' }],
};

describe('hari kerja', () => {
  it('mengenali hari kerja, akhir pekan, dan hari libur', () => {
    expect(isWorkingDay('2026-10-12', calendar)).toBe(true); // Senin
    expect(isWorkingDay('2026-10-09', calendar)).toBe(true); // Jumat
    expect(isWorkingDay('2026-10-10', calendar)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-10-11', calendar)).toBe(false); // Minggu
    expect(isWorkingDay('2026-10-16', calendar)).toBe(false); // hari libur (Jumat)
  });

  it('menambah hari kerja sambil melewati akhir pekan dan hari libur', () => {
    expect(addWorkingDays('2026-10-09', 1, calendar)).toBe('2026-10-12'); // Jum -> Sen
    expect(addWorkingDays('2026-10-15', 1, calendar)).toBe('2026-10-19'); // lewati libur 16 Okt
    expect(addWorkingDays('2026-10-10', 0, calendar)).toBe('2026-10-12'); // snap dari Sabtu
    expect(addWorkingDays('2026-10-12', 4, calendar)).toBe('2026-10-19'); //12,13,14,15 -> 19
  });

  it('menghitung hari kerja secara inklusif', () => {
    expect(countWorkingDays('2026-10-12', '2026-10-16', calendar)).toBe(4); // 16 = libur
    expect(countWorkingDays('2026-10-12', '2026-10-15', calendar)).toBe(4);
    expect(countWorkingDays('2026-10-10', '2026-10-11', calendar)).toBe(0); // akhir pekan
    expect(countWorkingDays('2026-10-16', '2026-10-12', calendar)).toBe(0); // rentang terbalik
  });

  it('mendukung akhir pekan kustom (Jumat-Sabtu)', () => {
    const custom: CalendarConfig = { weekendDays: [5, 6], holidays: [] };
    expect(isWorkingDay('2026-10-09', custom)).toBe(false); // Jumat
    expect(isWorkingDay('2026-10-10', custom)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-10-11', custom)).toBe(true); // Minggu tetap kerja
    expect(isWorkingDay('2026-10-12', custom)).toBe(true); // Senin
  });
});

describe('indeks hari kerja', () => {
  it('selisih indeks sama dengan jumlah hari kerja', () => {
    expect(workIndex('2026-10-19', calendar) - workIndex('2026-10-12', calendar)).toBe(4);
  });

  it('round-trip indeks <-> tanggal untuk hari kerja dan hari non-kerja', () => {
    expect(dateFromWorkIndex(workIndex('2026-10-12', calendar), calendar)).toBe('2026-10-12');
    expect(dateFromWorkIndex(workIndex('2026-10-10', calendar), calendar)).toBe('2026-10-12');
    expect(dateFromWorkIndex(workIndex('2026-10-16', calendar), calendar)).toBe('2026-10-19');
  });

  it('nextWorkingDay bergerak maju ke hari kerja terdekat', () => {
    expect(nextWorkingDay('2026-10-16', calendar)).toBe('2026-10-19');
    expect(nextWorkingDay('2026-10-12', calendar)).toBe('2026-10-12');
  });
});
