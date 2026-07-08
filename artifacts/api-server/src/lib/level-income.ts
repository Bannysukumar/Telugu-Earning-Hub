import { getLevelIncomeTiers, type PlanDoc } from "./firestore-db.js";
import {
  creditMlmSegmentsToUser,
  isStandalonePlan,
  resolvedLevelIncomeEnabled,
  levelIncomeAmountFromRoiPayout,
  buildReferrerUplineIds,
  sumUserInvestmentHeadroom,
} from "./investment-mlm.js";
import { MAX_LEVEL_INCOME_TIERS, percentForLevel, parseLevelIncomeTiers } from "./level-income-config.js";

export { resolvedLevelIncomeEnabled, levelIncomeAmountFromRoiPayout, buildReferrerUplineIds } from "./investment-mlm.js";
export { MAX_LEVEL_INCOME_TIERS, parseLevelIncomeTiers, type LevelIncomeTier } from "./level-income-config.js";

async function levelIncomeTiersForPlan(plan: PlanDoc) {
  if (plan.levelIncomeTiers && plan.levelIncomeTiers.length > 0) {
    return parseLevelIncomeTiers(plan.levelIncomeTiers);
  }
  return getLevelIncomeTiers();
}

/**
 * Pays configured % of a member's daily ROI to each upline in the referrer chain,
 * counting toward each upline's 2× investment cap (same as binary / direct bonus).
 */
export async function distributeLevelIncomeFromRoi(params: {
  sourceUserId: string;
  roiPayout: number;
  plan: PlanDoc;
  sourceInvestmentId: string;
  dayNumber: number;
}): Promise<number> {
  const { sourceUserId, roiPayout, plan, dayNumber } = params;
  if (isStandalonePlan(plan) || !resolvedLevelIncomeEnabled(plan)) return 0;

  const tiers = await levelIncomeTiersForPlan(plan);
  if (tiers.every((t) => t.percent <= 0)) return 0;

  const uplines = await buildReferrerUplineIds(sourceUserId, MAX_LEVEL_INCOME_TIERS);
  let totalCredited = 0;

  for (let i = 0; i < uplines.length; i++) {
    const uplineId = uplines[i]!;
    const level = i + 1;
    const pct = percentForLevel(tiers, level);
    const amount = levelIncomeAmountFromRoiPayout(roiPayout, pct);
    if (amount <= 0) continue;

    if ((await sumUserInvestmentHeadroom(uplineId)) <= 0) continue;

    const credited = await creditMlmSegmentsToUser(uplineId, [
      {
        amount,
        type: "LEVEL_INCOME",
        note: `Level ${level} income · ${pct}% of downline ROI (day ${dayNumber})`,
      },
    ]);
    totalCredited += credited;
  }

  return totalCredited;
}
