import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelIncomeAmountFromRoiPayout } from "./investment-mlm.js";

describe("levelIncomeAmountFromRoiPayout", () => {
  it("returns 5% of ₹100 ROI as ₹5", () => {
    assert.equal(levelIncomeAmountFromRoiPayout(100, 5), 5);
  });

  it("returns 0 when percent is 0", () => {
    assert.equal(levelIncomeAmountFromRoiPayout(100, 0), 0);
  });

  it("returns 0 when ROI payout is 0", () => {
    assert.equal(levelIncomeAmountFromRoiPayout(0, 5), 0);
  });
});
