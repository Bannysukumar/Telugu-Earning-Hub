import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import {
  activateGrowthPlan,
  getGrowthPlanSettings,
  getGrowthUser,
  GrowthPlanError,
  migrateAllUsersGrowthFields,
  updateGrowthPlanSettings,
} from "../lib/growth-plan-db.js";

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

const activateSchema = z.object({
  userId: z.string().min(1),
  /** Default false — admin gift, same as other plan activations. Set true to debit wallet. */
  deductFromWallet: z.boolean().optional().default(false),
});

router.post("/growth-plan/activate", requireAdmin, async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await activateGrowthPlan(parsed.data.userId, {
      deductFromWallet: parsed.data.deductFromWallet,
    });
    const growthUser = await getGrowthUser(parsed.data.userId);
    res.json({
      ...result,
      userId: parsed.data.userId,
      deductFromWallet: parsed.data.deductFromWallet,
      planStatus: growthUser?.growthPlan?.planStatus ?? "active",
    });
  } catch (e) {
    if (e instanceof GrowthPlanError) {
      const status =
        e.code === "USER_NOT_FOUND"
          ? 404
          : e.code === "INSUFFICIENT_BALANCE" || e.code === "ALREADY_ACTIVE" || e.code === "PLAN_INACTIVE"
            ? 400
            : 400;
      res.status(status).json({ error: e.message, code: e.code });
      return;
    }
    throw e;
  }
});

export default router;
