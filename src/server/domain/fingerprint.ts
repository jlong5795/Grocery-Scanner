/**
 * Fingerprint normalization and similarity, the analog of yard-sale's
 * fingerprintSimilarity(). Used for cross-photo dedup within a scan, matching
 * detections to the catalog, and matching list items to store offers.
 *
 * Conservative by design: a missed match creates a harmless duplicate the user
 * can merge; a false match silently conflates two products ("creamy" vs
 * "crunchy" peanut butter must not match).
 */

/** At or above this similarity, two fingerprints are the same item. */
export const MATCH_THRESHOLD = 0.8;

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "with"]);

/** Lowercase, strip punctuation and package sizes, collapse whitespace. */
export function normalizeFingerprint(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(
      /\b\d+(\.\d+)?\s*(fl oz|oz|lbs?|g|kg|ml|l|ct|count|pk|pack)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Crude singularization so "tomatoes"/"tomato" and "chips"/"chip" line up. */
function stem(t: string): string {
  if (t.length > 4 && t.endsWith("oes")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeFingerprint(s)
      .split(" ")
      .filter((t) => t && !STOP_WORDS.has(t))
      .map(stem),
  );
}

/** True if `a` becomes `b` by swapping one pair of adjacent letters. */
function isAdjacentSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  return (
    diff.length === 2 &&
    diff[1] === diff[0]! + 1 &&
    a[diff[0]!] === b[diff[1]!] &&
    a[diff[1]!] === b[diff[0]!]
  );
}

/** Levenshtein distance, capped: returns early once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Same word, allowing one typo in longer words ("cheerio" / "cheeroi"). */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  return isAdjacentSwap(a, b) || editDistance(a, b, 1) <= 1;
}

/**
 * Similarity in [0, 1]: shared words over all distinct words (Jaccard), with
 * word order ignored. "Jif peanut butter" vs "peanut butter, jif" = 1;
 * "jif creamy peanut butter" vs "jif crunchy peanut butter" = 0.6.
 */
export function fingerprintSimilarity(a: string, b: string): number {
  const ta = [...tokenSet(a)];
  const tb = [...tokenSet(b)];
  if (ta.length === 0 || tb.length === 0) return 0;

  const usedB = new Set<number>();
  let shared = 0;
  for (const x of ta) {
    const j = tb.findIndex((y, idx) => !usedB.has(idx) && tokensMatch(x, y));
    if (j >= 0) {
      usedB.add(j);
      shared++;
    }
  }
  return shared / (ta.length + tb.length - shared);
}

/** The candidate most similar to `fingerprint`, if it clears `threshold`. */
export function bestMatch<T>(
  fingerprint: string,
  candidates: readonly T[],
  getFingerprint: (c: T) => string,
  threshold = MATCH_THRESHOLD,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const score = fingerprintSimilarity(fingerprint, getFingerprint(c));
    if (score >= threshold && (!best || score > best.score)) {
      best = { item: c, score };
    }
  }
  return best;
}
