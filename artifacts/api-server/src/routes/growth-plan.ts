import { Router, type IRouter, type Request } from "express";
import { requireAuth, type AuthedUser } from "../lib/auth.js";
import {
  activateGrowthPlan,
  evaluateGrowthWithdrawalEligibility,
  formatGrowthDashboard,
  getGrowthPlanSettings,
  getGrowthUser,
  GrowthPlanError,
  listGrowthCycles,
  listGrowthDirects,
} from "../lib/growth-plan-db.js";

const router: IRouter = Router();

router.get("/settings", async (_req, res) => {
  const settings = await getGrowthPlanSettings();
  res.json({
    planName: settings.planName,
    planAmount: settings.planAmount,
    planDuration: settings.planDuration,
    dailyRoi: settings.dailyRoi,
    maxEarnings: settings.maxEarnings,
    directBonus: settings.directBonus,
    minWithdrawal: settings.minWithdrawal,
    planStatus: settings.planStatus,
    enableReentry: settings.enableReentry,
    enableRoi: settings.enableRoi,
    enableReferralBonus: settings.enableReferralBonus,
  });
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const growthUser = await getGrowthUser(user.id);
  if (!growthUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const settings = await getGrowthPlanSettings();
  const directs = await listGrowthDirects(user.id);
  res.json(formatGrowthDashboard(growthUser, settings, directs));
});

router.get("/withdrawal-eligibility", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const growthUser = await getGrowthUser(user.id);
  if (!growthUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const amount = Number(req.query.amount ?? 0);
  const check = await evaluateGrowthWithdrawalEligibility(growthUser, amount);
  res.json(check);
});

router.get("/cycles", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const cycles = await listGrowthCycles(user.id);
  res.json(
    cycles.map((c) => ({
      id: c.id,
      cycleNumber: c.cycleNumber,
      planStatus: c.planStatus,
      planAmount: c.planAmount,
      currentPlanIncome: c.currentPlanIncome,
      roiIncome: c.roiIncome,
      directIncome: c.directIncome,
      earningCap: c.earningCap,
      planStartDate: c.planStartDate?.toDate?.().toISOString?.() ?? null,
      planEndDate: c.planEndDate?.toDate?.().toISOString?.() ?? null,
    })),
  );
});

router.post("/activate", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    const result = await activateGrowthPlan(user.id);
    const growthUser = await getGrowthUser(user.id);
    const settings = await getGrowthPlanSettings();
    const directs = await listGrowthDirects(user.id);
    res.status(201).json({
      ...result,
      dashboard: growthUser ? formatGrowthDashboard(growthUser, settings, directs) : null,
    });
  } catch (e) {
    if (e instanceof GrowthPlanError) {
      res.status(400).json({ error: e.message, code: e.code });
      return;
    }
    throw e;
  }
});

router.post("/re-enter", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  try {
    const result = await activateGrowthPlan(user.id);
    const growthUser = await getGrowthUser(user.id);
    const settings = await getGrowthPlanSettings();
    const directs = await listGrowthDirects(user.id);
    res.status(201).json({
      ...result,
      dashboard: growthUser ? formatGrowthDashboard(growthUser, settings, directs) : null,
    });
  } catch (e) {
    if (e instanceof GrowthPlanError) {
      res.status(400).json({ error: e.message, code: e.code });
      return;
    }
    throw e;
  }
});

export default router;
