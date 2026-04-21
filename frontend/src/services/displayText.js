const MOJIBAKE_PLACEHOLDERS = new Set([
  'â€”',
  'â€“',
  'Ã¢â‚¬â€',
  'Ã¢â‚¬â€œ',
]);

export function isBlankLike(value) {
  if (value === null || value === undefined) return true;
  const raw = String(value).replace(/\u00A0/g, ' ').trim();
  if (!raw) return true;
  if (/^[-–—]+$/.test(raw)) return true;
  if (MOJIBAKE_PLACEHOLDERS.has(raw)) return true;
  return false;
}

export function displayText(value, fallback = '-') {
  return isBlankLike(value) ? fallback : String(value).trim();
}

