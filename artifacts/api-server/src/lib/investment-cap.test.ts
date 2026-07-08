import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  investmentCapHeadroom,
  isInvestmentCapReached,
  patchAfterEarningsCredit,
} from "./investment-cap.js";

describe("investment cap", () => {
  it("stops when ROI + level income reach maxReturn", () => {
    const maxReturn = 400;
    let earned = 0;
    earned += 100;
    assert.equal(investmentCapHeadroom(earned, maxReturn), 300);
    earned += 295;
    assert.equal(investmentCapHeadroom(earned, maxReturn), 5);
    const patch = patchAfterEarningsCredit(earned + 5, maxReturn, "active");
    assert.equal(isInvestmentCapReached(patch.totalEarned, maxReturn), true);
    assert.equal(patch.systemActive, false);
    assert.equal(patch.isActive, false);
  });

  it("deactivates when manual inactive even under cap", () => {
    const patch = patchAfterEarningsCredit(100, 400, "inactive");
    assert.equal(patch.isActive, false);
  });
});
