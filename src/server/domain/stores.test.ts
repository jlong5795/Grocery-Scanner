import { describe, expect, it } from "vitest";

import { chooseStore, departmentRank } from "./stores";

const stores = [
  { id: "kroger", priority: 0 },
  { id: "aldi", priority: 1 },
];

describe("chooseStore", () => {
  it("uses the pin when there is one, regardless of price", () => {
    expect(
      chooseStore("aldi", [{ storeId: "kroger", priceCents: 100, couponSummary: null }], stores),
    ).toBe("aldi");
  });

  it("otherwise picks the cheapest offer", () => {
    expect(
      chooseStore(
        null,
        [
          { storeId: "kroger", priceCents: 399, couponSummary: null },
          { storeId: "aldi", priceCents: 249, couponSummary: null },
        ],
        stores,
      ),
    ).toBe("aldi");
  });

  it("breaks price ties by store priority", () => {
    expect(
      chooseStore(
        null,
        [
          { storeId: "aldi", priceCents: 199, couponSummary: null },
          { storeId: "kroger", priceCents: 199, couponSummary: null },
        ],
        stores,
      ),
    ).toBe("kroger");
  });

  it("falls back to a coupon, then to no store", () => {
    expect(
      chooseStore(null, [{ storeId: "aldi", priceCents: null, couponSummary: "$1 off" }], stores),
    ).toBe("aldi");
    expect(chooseStore(null, [], stores)).toBeNull();
  });
});

describe("departmentRank", () => {
  it("orders known departments and puts unknown ones last", () => {
    expect(departmentRank("Produce")).toBeLessThan(departmentRank("Frozen"));
    expect(departmentRank("Mystery aisle")).toBeGreaterThan(departmentRank("Other"));
  });
});
