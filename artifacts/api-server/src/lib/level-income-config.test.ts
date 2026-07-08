import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLevelIncomeTiers, percentForLevel, validateLevelIncomeTiersInput } from "./level-income-config.js";

describe("parseLevelIncomeTiers", () => {
  it("sorts and dedupes levels", () => {
    const tiers = parseLevelIncomeTiers([
      { level: 2, percent: 3 },
      { level: 1, percent: 5 },
      { level: 2, percent: 99 },
    ]);
    assert.deepEqual(tiers, [
      { level: 1, percent: 5 },
      { level: 2, percent: 3 },
    ]);
  });
});

describe("percentForLevel", () => {
  it("returns configured percent per generation", () => {
    const tiers = parseLevelIncomeTiers([
      { level: 1, percent: 5 },
      { level: 2, percent: 2 },
    ]);
    assert.equal(percentForLevel(tiers, 1), 5);
    assert.equal(percentForLevel(tiers, 2), 2);
    assert.equal(percentForLevel(tiers, 3), 0);
  });
});

describe("validateLevelIncomeTiersInput", () => {
  it("rejects empty schedule", () => {
    const r = validateLevelIncomeTiersInput([]);
    assert.equal(r.ok, false);
  });
});
