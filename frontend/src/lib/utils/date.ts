/**
 * Helper to parse date strings safely as UTC if missing timezone offset
 */
export function parseUtcDate(dateStr: string | Date | undefined | null): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  const str = String(dateStr).trim();
  // If string does not contain timezone indicator ('Z' or '+' or '-offset' at end), append 'Z' so JS treats as UTC
  const hasTimezone = str.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(str);
  return new Date(hasTimezone ? str : `${str}Z`);
}

/**
 * Formats a date & time in Waktu Indonesia Barat (WIB / Asia/Jakarta)
 * Example output: "17 Agu 2026, 01:34 WIB"
 */
export function formatWIBDateTime(dateStr: string | Date | undefined | null, includeWibSuffix: boolean = true): string {
  if (!dateStr) return '-';
  const d = parseUtcDate(dateStr);
  
  if (isNaN(d.getTime())) return '-';

  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d).replace(' pukul ', ', ').replace(/\./g, ':');

  return includeWibSuffix ? `${formatted} WIB` : formatted;
}

/**
 * Formats date only in Waktu Indonesia Barat (WIB)
 * Example output: "17 Agustus 2026"
 */
export function formatWIBDate(dateStr: string | Date | undefined | null, formatMonth: 'long' | 'short' = 'long'): string {
  if (!dateStr) return '-';
  const d = parseUtcDate(dateStr);
  
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: formatMonth,
    year: 'numeric'
  }).format(d);
}
