import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDirectBinarySteps, simulateBinaryPayouts } from "./binary-pair-logic.js";

describe("resolveDirectBinarySteps", () => {
  it("returns one step for immediate binary parent only", () => {
    const steps = resolveDirectBinarySteps({
      binaryParentId: "sponsor-1",
      referrerId: "sponsor-1",
      binarySide: "left",
    });
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0], { ancestorId: "sponsor-1", side: "left" });
  });

  it("returns empty when leg side is missing", () => {
    assert.deepEqual(
      resolveDirectBinarySteps({ binaryParentId: "sponsor-1", referrerId: "sponsor-1", binarySide: null }),
      [],
    );
  });
});

describe("simulateBinaryPayouts (direct binary only)", () => {
  it("pays sponsor when direct right activates after direct left (two activations)", () => {
    const sponsor = "A";
    const M = 200;
    let bv = new Map([[sponsor, { L: 0, R: 0 }]]);
    const headroom = new Map([[sponsor, 10_000]]);

    const leftOnly = simulateBinaryPayouts(
      [{ ancestorId: sponsor, side: "left" }],
      M,
      bv,
      headroom,
      200,
      80,
    );
    assert.equal(leftOnly.binaryPayoutByUser.get(sponsor) ?? 0, 0);
    bv = leftOnly.finalBv;

    const bothLegs = simulateBinaryPayouts(
      [{ ancestorId: sponsor, side: "right" }],
      M,
      bv,
      headroom,
      200,
      80,
    );
    assert.equal(bothLegs.binaryPayoutByUser.get(sponsor), 80);
  });

  it("does not pay grand-upline when only deep leg activates (single parent step)", () => {
    const parent = "A";
    const chain = [{ ancestorId: parent, side: "left" as const }];
    const M = 200;
    const bvStart = new Map([[parent, { L: 0, R: 0 }]]);
    const headroom = new Map([[parent, 10_000]]);

    const { binaryPayoutByUser, finalBv } = simulateBinaryPayouts(chain, M, bvStart, headroom, 200, 80);
    assert.equal(binaryPayoutByUser.get(parent) ?? 0, 0);
    assert.equal(finalBv.get(parent)?.L, 200);
    assert.equal(finalBv.get(parent)?.R, 0);
  });
});
