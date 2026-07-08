import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import {
  getPlan,
  getInvestment,
  listInvestmentsByUser,
  getUser,
  userHasActiveInvestment,
  type InvestmentDoc,
} from "../lib/firestore-db.js";
import { createInvestmentWithMlmAtomic, DEFAULT_ROI_POOL_PERCENT, isStandalonePlan } from "../lib/investment-mlm.js";
import { requireAuth, type AuthedUser } from "../lib/auth.js";

const router: IRouter = Router();

export function investmentUserStatus(investment: InvestmentDoc & { id: string }): string {
  if (investment.isActive) return "active";
  if (investment.manualStatus === "inactive") return "manually_stopped";
  return "completed";
}

function formatInvestment(investment: InvestmentDoc & { id: string }, planName: string) {
  return {
    id: investment.id,
    planId: investment.planId,
    planName,
    amount: investment.amount,
    dailyRoi: investment.dailyRoi,
    maxReturn: investment.maxReturn,
    totalEarned: investment.totalEarned,
    daysCompleted: investment.daysCompleted,
    maxDays: investment.maxDays,
    systemActive: investment.systemActive,
    manualStatus: investment.manualStatus,
    isActive: investment.isActive,
    status: investmentUserStatus(investment),
    startDate:
      investment.startDate instanceof Timestamp
        ? investment.startDate.toDate().toISOString()
        : new Date().toISOString(),
    lastRoiUpdate: investment.lastRoiUpdate
      ? investment.lastRoiUpdate instanceof Timestamp
        ? investment.lastRoiUpdate.toDate().toISOString()
        : null
      : null,
    roiPoolPercent: investment.roiPoolPercent ?? DEFAULT_ROI_POOL_PERCENT,
  };
}

router.get("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;

  const results = await listInvestmentsByUser(user.id);
  const out = [];
  for (const inv of results) {
    const plan = await getPlan(inv.planId);
    out.push(formatInvestment(inv, plan?.name || "Unknown Plan"));
  }
  res.json(out);
});

const createSchema = z.object({
  planId: z.string().min(1),
  beneficiaryUserId: z.string().min(1).optional(),
});

/** Members may hold multiple investments, including several active positions on the same planId. */
router.post("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { planId, beneficiaryUserId: beneficiaryRaw } = parsed.data;
  const beneficiaryId =
    beneficiaryRaw && beneficiaryRaw.trim() !== user.id ? beneficiaryRaw.trim() : user.id;

  const plan = await getPlan(planId);
  if (!plan || !plan.isActive) {
    res.status(404).json({ error: "Plan not found or inactive" });
    return;
  }

  if (isStandalonePlan(plan)) {
    if (beneficiaryId !== user.id) {
      res.status(400).json({ error: "This plan can only be activated on your own account." });
      return;
    }
  }

  if (beneficiaryId !== user.id) {
    const target = await getUser(beneficiaryId);
    if (!target) {
      res.status(404).json({ error: "Member not found for this activation." });
      return;
    }
    if (target.role === "admin") {
      res.status(403).json({ error: "Cannot activate a plan for an admin account." });
      return;
    }
    if (!target.isActive) {
      res.status(403).json({ error: "That member account is inactive." });
      return;
    }
    const payerHasActivePlan = await userHasActiveInvestment(user.id);
    if (!payerHasActivePlan) {
      res.status(403).json({
        error: "You need an active investment plan on your account before activating a plan for another member.",
      });
      return;
    }
  }

  try {
    const invId = await createInvestmentWithMlmAtomic({
      userId: beneficiaryId,
      plan,
      deductFromWallet: true,
      walletDebitUserId: beneficiaryId === user.id ? undefined : user.id,
    });
    const investment = await getInvestment(invId);
    if (!investment) {
      res.status(500).json({ error: "Investment not persisted" });
      return;
    }
    res.status(201).json(formatInvestment(investment, plan.name));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Insufficient wallet balance")) {
      res.status(400).json({ error: msg });
      return;
    }
    throw e;
  }
});

export { formatInvestment };
export default router;
