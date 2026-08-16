/**
 * Formats a number or numeric string to Indonesian Rupiah formatting with dot separators.
 * Example: '1500000' -> '1.500.000'
 */
export function formatCurrency(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const clean = String(value).replace(/\D/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Removes all non-digit characters from a string.
 * Example: 'Rp 1.500.000' -> '1500000'
 */
export function parseCurrency(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}
