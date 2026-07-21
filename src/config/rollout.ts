/**
 * Rollout flags for features that ship dark and are enabled per environment.
 *
 * Accepted syntax for `ROLLOUT_FLAGS` (comma-separated, case-insensitive,
 * order-independent):
 *
 *   ""                          nothing rolled out
 *   "catalog-breadcrumbs"       just that flag
 *   "a,b"                       both
 *   "all"                       everything; local development only
 *   "all,catalog-breadcrumbs"   everything except that flag — once `all` is
 *                               present a bare flag reads as an exclusion
 *   "all,-catalog-breadcrumbs"  same; a leading `-` or `!` always excludes
 *
 * Unknown flags are ignored rather than throwing, so a stale value left in an
 * environment can never take an unrelated feature down with it.
 */

export type RolloutFlag =
  | "catalog-breadcrumbs"
  | "catalog-pagination-v2"
  | "checkout-validation-v2"
  | "digest-timezone-buckets"
  | "orders-status-filter"
  | "products-stock-badges";

const KNOWN_FLAGS: readonly RolloutFlag[] = [
  "catalog-breadcrumbs",
  "catalog-pagination-v2",
  "checkout-validation-v2",
  "digest-timezone-buckets",
  "orders-status-filter",
  "products-stock-badges",
];

function isKnownFlag(value: string): value is RolloutFlag {
  return (KNOWN_FLAGS as readonly string[]).includes(value);
}

function parseFlags(raw: string): Set<RolloutFlag> {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const everything = tokens.some((token) => token.toLowerCase() === "all");

  const included = new Set<RolloutFlag>();
  const excluded = new Set<RolloutFlag>();

  for (const token of tokens) {
    if (token.toLowerCase() === "all") {
      continue;
    }
    const negated = token.startsWith("-") || token.startsWith("!");
    const bare = (negated ? token.slice(1) : token).trim().toLowerCase();
    if (!isKnownFlag(bare)) {
      continue;
    }
    if (negated || everything) {
      excluded.add(bare);
    } else {
      included.add(bare);
    }
  }

  const enabled = everything ? new Set<RolloutFlag>(KNOWN_FLAGS) : included;
  for (const flag of excluded) {
    enabled.delete(flag);
  }
  return enabled;
}

export function isRolloutEnabled(
  flag: RolloutFlag,
  raw: string = process.env.ROLLOUT_FLAGS ?? "",
): boolean {
  return parseFlags(raw).has(flag);
}
