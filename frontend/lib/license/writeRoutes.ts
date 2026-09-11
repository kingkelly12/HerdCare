/**
 * Every route that creates or changes a record.
 *
 * Kept as one list in one place rather than a check inside twenty screens: a screen someone forgets
 * to guard is a hole, and a deep link straight to `/log/milk` would walk through it. Anything not
 * listed here stays open on purpose — reading the herd, reading the money, and taking a backup are
 * never withheld over a payment.
 */
const WRITE_ROUTES: RegExp[] = [
  /^\/log(\/|$)/,
  /^\/(animal|flock|customers|suppliers|hatch|expense|income|money|schedule)\/new$/,
  /^\/animal\/[^/]+\/edit$/,
  /^\/flock\/[^/]+\/(edit|log)$/,
  /^\/customers\/[^/]+\/(deliver|pay)$/,
  /^\/suppliers\/[^/]+\/pay$/,
  /^\/hatch\/[^/]+\/(candle|hatch)$/,
];

export function isWriteRoute(pathname: string): boolean {
  return WRITE_ROUTES.some((pattern) => pattern.test(pathname));
}
