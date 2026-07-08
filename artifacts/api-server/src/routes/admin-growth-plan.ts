import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { getGrowthPlanSettings, updateGrowthPlanSettings, migrateAllUsersGrowthFields } from "../lib/growth-plan-db.js";

const router: IRouter = Router();

router.get("/growth-plan/settings", requireAdmin, async (_req, res) => {
  const settings = await getGrowthPlanSettings();
  res.json({
    planName: settings.planName,
    planAmount: settings.planAmount,
    planDuration: settings.planDuration,
    dailyRoi: settings.dailyRoi,
    maxEarnings: settings.maxEarnings,
    directBonus: settings.directBonus,
    withdrawalFeePercent: settings.withdrawalFeePercent,
    minWithdrawal: settings.minWithdrawal,
    planStatus: settings.planStatus,
    enableReentry: settings.enableReentry,
    enableRoi: settings.enableRoi,
    enableReferralBonus: settings.enableReferralBonus,
  });
});

const updateSchema = z.object({
  planName: z.string().min(2).optional(),
  planAmount: z.number().positive().optional(),
  planDuration: z.number().int().positive().optional(),
  dailyRoi: z.number().positive().optional(),
  maxEarnings: z.number().positive().optional(),
  directBonus: z.number().min(0).optional(),
  withdrawalFeePercent: z.number().min(0).max(100).optional(),
  minWithdrawal: z.number().positive().optional(),
  planStatus: z.enum(["active", "inactive"]).optional(),
  enableReentry: z.boolean().optional(),
  enableRoi: z.boolean().optional(),
  enableReferralBonus: z.boolean().optional(),
});

router.put("/growth-plan/settings", requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const settings = await updateGrowthPlanSettings(parsed.data);
  res.json({
    planName: settings.planName,
    planAmount: settings.planAmount,
    planDuration: settings.planDuration,
    dailyRoi: settings.dailyRoi,
    maxEarnings: settings.maxEarnings,
    directBonus: settings.directBonus,
    withdrawalFeePercent: settings.withdrawalFeePercent,
    minWithdrawal: settings.minWithdrawal,
    planStatus: settings.planStatus,
    enableReentry: settings.enableReentry,
    enableRoi: settings.enableRoi,
    enableReferralBonus: settings.enableReferralBonus,
  });
});

router.post("/growth-plan/migrate-users", requireAdmin, async (_req, res) => {
  const updated = await migrateAllUsersGrowthFields();
  res.json({ message: `Migrated ${updated} user(s) with growth plan defaults.`, updated });
});

export default router;
