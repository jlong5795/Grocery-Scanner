import { describe, expect, it } from "vitest";

import {
  MATCH_THRESHOLD,
  bestMatch,
  fingerprintSimilarity,
  normalizeFingerprint,
} from "./fingerprint";

describe("normalizeFingerprint", () => {
  it("lowercases, strips punctuation and package sizes", () => {
    expect(normalizeFingerprint("Jif Creamy Peanut Butter, 16 oz")).toBe(
      "jif creamy peanut butter",
    );
    expect(normalizeFingerprint("Ben & Jerry's  Half-Baked")).toBe(
      "ben and jerrys half baked",
    );
  });
});

describe("fingerprintSimilarity", () => {
  const same = (a: string, b: string) =>
    expect(fingerprintSimilarity(a, b)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  const different = (a: string, b: string) =>
    expect(fingerprintSimilarity(a, b)).toBeLessThan(MATCH_THRESHOLD);

  it("ignores word order and punctuation", () => {
    same("jif peanut butter", "peanut butter, jif");
  });

  it("tolerates plurals and a single typo in long words", () => {
    same("hunts diced tomatoes", "hunts diced tomato");
    same("cheerios cereal", "cheerois cereal");
  });

  it("keeps product variants apart", () => {
    different("jif creamy peanut butter", "jif crunchy peanut butter");
    different("peanut butter", "peanut butter cups");
    different("whole milk", "oat milk");
  });

  it("returns 0 for empty input", () => {
    expect(fingerprintSimilarity("", "milk")).toBe(0);
  });
});

describe("bestMatch", () => {
  const catalog = [
    { id: "a", fp: "jif creamy peanut butter" },
    { id: "b", fp: "jif crunchy peanut butter" },
  ];

  it("picks the closest candidate above threshold", () => {
    expect(bestMatch("peanut butter creamy jif", catalog, (c) => c.fp)?.item.id).toBe("a");
  });

  it("returns null when nothing is close enough", () => {
    expect(bestMatch("skippy peanut butter", catalog, (c) => c.fp)).toBeNull();
  });
});
