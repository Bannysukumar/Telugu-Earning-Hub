import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  createWithdrawalRequestAtomic,
  listWithdrawalsByUser,
  getWithdrawalFeePercent,
  WithdrawalRequestError,
  toIso,
  type WithdrawalDoc,
} from "../lib/firestore-db.js";
import { requireAuth, type AuthedUser } from "../lib/auth.js";
import {
  evaluateGrowthWithdrawalEligibility,
  getGrowthPlanSettings,
  getGrowthUser,
} from "../lib/growth-plan-db.js";

const router: IRouter = Router();

function formatWithdrawal(w: WithdrawalDoc & { id: string }) {
  return {
    id: w.id,
    requestAmount: w.requestAmount,
    feePercent: w.feePercent,
    feeAmount: w.feeAmount,
    netAmount: w.netAmount,
    status: w.status,
    bankDetails: w.bankDetails,
    createdAt: toIso(w.createdAt),
    updatedAt: w.updatedAt ? toIso(w.updatedAt) : null,
  };
}

router.get("/fee-settings", requireAuth, async (_req, res) => {
  const withdrawalFeePercent = await getWithdrawalFeePercent();
  res.json({ withdrawalFeePercent });
});

router.get("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const withdrawals = await listWithdrawalsByUser(user.id);
  res.json(withdrawals.map(formatWithdrawal));
});

const createSchema = z.object({
  amount: z.number().min(500, "Minimum withdrawal is ₹500"),
  bankDetails: z.string().optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  const { amount, bankDetails } = parsed.data;

  const growthUser = await getGrowthUser(user.id);
  if (!growthUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const growthCheck = await evaluateGrowthWithdrawalEligibility(growthUser, amount);
  if (growthCheck.appliesGrowthRules) {
    if (!growthCheck.eligible) {
      res.status(400).json({ error: growthCheck.reason ?? "Withdrawal not allowed" });
      return;
    }
    if (amount < growthCheck.minWithdrawal) {
      res.status(400).json({ error: "Minimum withdrawal not reached" });
      return;
    }
  } else if (amount < 500) {
    res.status(400).json({ error: "Minimum withdrawal amount is ₹500" });
    return;
  }

  let feePercentOverride: number | undefined;
  if (growthCheck.appliesGrowthRules) {
    const growthSettings = await getGrowthPlanSettings();
    feePercentOverride = growthSettings.withdrawalFeePercent;
  }

  try {
    const wid = await createWithdrawalRequestAtomic({
      userId: user.id,
      requestAmount: amount,
      bankDetails: bankDetails ?? null,
      feePercentOverride,
    });
    const list = await listWithdrawalsByUser(user.id);
    const created = list.find((x) => x.id === wid);
    if (!created) {
      res.status(500).json({ error: "Withdrawal not persisted" });
      return;
    }
    res.status(201).json(formatWithdrawal(created));
  } catch (e: unknown) {
    if (e instanceof WithdrawalRequestError) {
      if (e.code === "INSUFFICIENT_BALANCE") {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e.code === "PENDING_WITHDRAWAL_EXISTS") {
        res.status(409).json({ error: e.message });
        return;
      }
      if (e.code === "WITHDRAWAL_COOLDOWN") {
        res.status(429).json({ error: e.message });
        return;
      }
      if (e.code === "USER_NOT_FOUND") {
        res.status(404).json({ error: e.message });
        return;
      }
    }
    throw e;
  }
});

export { formatWithdrawal };
export default router;
