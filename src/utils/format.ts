/** Format angka mata uang Rupiah tanpa desimal. */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'Rp0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format angka desimal (default 1 digit) dengan pemisah lokal. */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Inisial nama untuk avatar (maks 2 huruf). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Potong teks untuk label diagram. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}
