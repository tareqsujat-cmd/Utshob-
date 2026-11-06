// Display helpers so numbers and dates look the same everywhere.

// 150000 -> "৳150,000"
export function formatTaka(amount) {
  return `৳${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

// "2026-11-06T10:00:00Z" -> "6 Nov 2026"
export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// -> "6 Nov 2026, 4:00 pm"
export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Provider package price: "৳850 per guest" or "৳70,000 flat"
export function formatPackagePrice(pkg) {
  return `${formatTaka(pkg.price)} ${pkg.pricingType === 'per_guest' ? 'per guest' : 'flat'}`;
}

// Days from today until a date (negative = in the past)
export function daysUntil(value) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// Date <-> the text an <input type="datetime-local"> uses ("2026-12-12T18:00", in local time).
export function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(text) {
  return text ? new Date(text).toISOString() : '';
}
// Date -> "2026-12-12" for <input type="date">
export function toDateInput(value) {
  return value ? toLocalInput(value).slice(0, 10) : '';
}

// 54.6 -> "54.6", 70 -> "70" (no long decimals in quantities)
export function formatQty(n) {
  return String(Math.round(n * 100) / 100);
}

// -> "5 min ago", "3 h ago", "2 days ago"
export function timeAgo(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
