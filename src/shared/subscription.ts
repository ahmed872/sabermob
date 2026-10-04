/**
 * The one package sold: a 3-month subscription. Keys for it are ordinary
 * activation keys (all features, no practical user limit) valid for `days`;
 * each renewal key adds `days` on top of what is left, so renewing early never
 * loses time. Price is shown to the customer on the renewal notice.
 */
export const SUBSCRIPTION = {
  days: 90,
  months: 3,
  priceEgp: 500,
  tier: 'ENTERPRISE',
  /** top-bar chip turns amber this many days before the end */
  warnDays: 10,
  /** a renewal strip with the request code appears this many days before the end */
  noticeDays: 7
} as const
