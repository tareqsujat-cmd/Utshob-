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

// -> "5 min ago", "3 h ago", "2 days ago"
export function timeAgo(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
