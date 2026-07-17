/**
 * Window discipline: exactly one seeded bug is active per test window, selected
 * by the `ENABLED_BUGS` env var. During `checks` this is empty, so every seeded
 * defect stays dormant and the suite is green.
 *
 * Known bug ids (backend): BH1 (http null coupon), BH2 (http signup contract),
 * BC1 (command daily-digest null preferences).
 */

export type BugId = "BH1" | "BH2" | "BC1";

const KNOWN_BUG_IDS: readonly BugId[] = ["BH1", "BH2", "BC1"];

function parseEnabledBugs(raw: string): Set<BugId> {
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const enabled = new Set<BugId>();
  for (const id of ids) {
    if ((KNOWN_BUG_IDS as readonly string[]).includes(id)) {
      enabled.add(id as BugId);
    }
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
