/**
 * Seeded-bug selection via the `ENABLED_BUGS` env var. During `checks` this is
 * empty, so every seeded defect stays dormant and the suite is green.
 *
 * Known bug ids (backend): BH1 (http null coupon), BH2 (http signup contract),
 * BC1 (command daily-digest null preferences).
 *
 * Accepted syntax (comma-separated, case-insensitive, order-independent):
 *   ""            -> nothing enabled (the `checks` state).
 *   "BH1"         -> only BH1 (include). This is the correct form for a live window.
 *   "BH1,BC1"     -> exactly those ids (include).
 *   "ALL"         -> every known bug. LOCAL-DEV CONVENIENCE ONLY.
 *   "ALL,BH2"     -> every known bug EXCEPT BH2. Once `ALL` is present a bare id is
 *                    an exclusion (including it would be redundant).
 *   "ALL,-BH2"    -> same thing; a leading `-` or `!` is always an explicit exclude.
 *
 * So: without `ALL`, bare ids are includes; with `ALL`, bare ids are excludes.
 *
 * WINDOW DISCIPLINE (decision D-6): a live Remedy validation window must enable
 * EXACTLY ONE bug. `ALL` (and any multi-bug selection) exists only for local
 * exploration — enabling several defects at once cross-contaminates Sentry
 * issues and corrupts Remedy's single shared workspace. Never run a window on it.
 */

export type BugId = "BH1" | "BH2" | "BC1";

const KNOWN_BUG_IDS: readonly BugId[] = ["BH1", "BH2", "BC1"];

function isKnownBugId(value: string): value is BugId {
  return (KNOWN_BUG_IDS as readonly string[]).includes(value);
}

function parseEnabledBugs(raw: string): Set<BugId> {
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Detect `ALL` up front (order-independent) so a bare id can be classified as
  // an exclusion when the base is "everything".
  const all = tokens.some((t) => t.toUpperCase() === "ALL");

  const included = new Set<BugId>();
  const excluded = new Set<BugId>();

  for (const token of tokens) {
    if (token.toUpperCase() === "ALL") {
      continue;
    }
    const isExplicitExclusion = token.startsWith("-") || token.startsWith("!");
    const bare = (isExplicitExclusion ? token.slice(1) : token).trim().toUpperCase();
    if (!isKnownBugId(bare)) {
      // Unknown ids (and stray exclusions) are ignored rather than throwing, so a
      // typo can never silently enable the wrong defect.
      continue;
    }
    // Explicit `-`/`!` always excludes. A bare id excludes under `ALL` (include
    // would be a no-op) and otherwise includes.
    if (isExplicitExclusion || all) {
      excluded.add(bare);
    } else {
      included.add(bare);
    }
  }

  const enabled = all ? new Set<BugId>(KNOWN_BUG_IDS) : included;
  for (const id of excluded) {
    enabled.delete(id);
  }
  return enabled;
}

/**
 * Returns true if the given seeded bug is the one enabled for this window.
 * Reads `ENABLED_BUGS` from the environment at call time.
 */
export function isBugEnabled(id: BugId, raw: string = process.env.ENABLED_BUGS ?? ""): boolean {
  return parseEnabledBugs(raw).has(id);
}
