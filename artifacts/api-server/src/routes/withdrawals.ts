import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  bankDetailsMultilineFromSaved,
  createWithdrawalRequestAtomic,
  findSavedBankAccountById,
  getMinWithdrawalAmount,
  getPeerTransferFeePercent,
  getUser,
  getWithdrawalFeePercent,
  listWithdrawalsByUser,
  upsertSavedBankAccountForUser,
  WithdrawalRequestError,
  toIso,
  type WithdrawalDoc,
} from "../lib/firestore-db.js";
import { requireAuth, type AuthedUser } from "../lib/auth.js";
import {
  evaluateGrowthWithdrawalEligibility,
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
  const [withdrawalFeePercent, minWithdrawalAmount, peerTransferFeePercent] = await Promise.all([
    getWithdrawalFeePercent(),
    getMinWithdrawalAmount(),
    getPeerTransferFeePercent(),
  ]);
  res.json({ withdrawalFeePercent, minWithdrawalAmount, peerTransferFeePercent });
});

router.get("/eligibility-status", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const growthUser = await getGrowthUser(user.id);
  if (!growthUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const amountRaw = Number(req.query.amount ?? 0);
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 0;
  const status = await evaluateGrowthWithdrawalEligibility(growthUser, amount);
  res.json(status);
});

router.get("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const withdrawals = await listWithdrawalsByUser(user.id);
  res.json(withdrawals.map(formatWithdrawal));
});

const createSchema = z
  .object({
    amount: z.number().positive("Amount must be greater than 0"),
    bankDetails: z.string().optional(),
    bankName: z.string().optional(),
    ifscCode: z.string().optional(),
    accountNumber: z.string().optional(),
    accountHolderName: z.string().optional(),
    bankAccountId: z.string().optional(),
    bankAccountLabel: z.string().optional(),
    saveBankAccount: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.bankAccountId?.trim()) return;
    if (data.bankDetails?.trim()) return;
    const hasStructured =
      Boolean(data.bankName?.trim()) &&
      Boolean(data.ifscCode?.trim()) &&
      Boolean(data.accountNumber?.trim()) &&
      Boolean(data.accountHolderName?.trim());
    if (!hasStructured) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank account details are required",
        path: ["bankName"],
      });
    }
  });

router.post("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  const {
    amount,
    bankDetails: bankDetailsRaw,
    bankName,
    ifscCode,
    accountNumber,
    accountHolderName,
    bankAccountId,
    bankAccountLabel,
    saveBankAccount,
  } = parsed.data;

  const growthUser = await getGrowthUser(user.id);
  if (!growthUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const growthCheck = await evaluateGrowthWithdrawalEligibility(growthUser, amount);
  const minWithdrawal = growthCheck.minWithdrawal;
  if (growthCheck.appliesGrowthRules) {
    if (!growthCheck.eligible) {
      res.status(400).json({ error: growthCheck.reason ?? "Withdrawal not allowed" });
      return;
    }
  }
  if (amount < minWithdrawal) {
    res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdrawal}` });
    return;
  }

  let bankDetails: string | null = bankDetailsRaw?.trim() || null;
  let bankAccountSaveWarning: string | undefined;

  if (bankAccountId?.trim()) {
    const profile = await getUser(user.id);
    const saved = profile ? findSavedBankAccountById(profile, bankAccountId) : null;
    if (!saved) {
      res.status(400).json({ error: "Saved bank account not found" });
      return;
    }
    bankDetails = bankDetailsMultilineFromSaved(saved);
  } else if (!bankDetails && bankName && ifscCode && accountNumber && accountHolderName) {
    const structured = {
      bankName: bankName.trim(),
      ifscCode: ifscCode.trim(),
      accountNumber: accountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      label: bankAccountLabel?.trim() || undefined,
    };
    bankDetails = bankDetailsMultilineFromSaved(structured);
    if (saveBankAccount) {
      try {
        await upsertSavedBankAccountForUser(user.id, structured);
      } catch (e) {
        bankAccountSaveWarning = e instanceof Error ? e.message : "Could not save bank account";
      }
    }
  }

  if (!bankDetails) {
    res.status(400).json({ error: "Bank account details are required" });
    return;
  }

  let feePercentOverride: number | undefined;
  if (growthCheck.appliesGrowthRules) {
    feePercentOverride = await getWithdrawalFeePercent();
  }

  try {
    const wid = await createWithdrawalRequestAtomic({
      userId: user.id,
      requestAmount: amount,
      bankDetails,
      feePercentOverride,
    });
    const list = await listWithdrawalsByUser(user.id);
    const created = list.find((x) => x.id === wid);
    if (!created) {
      res.status(500).json({ error: "Withdrawal not persisted" });
      return;
    }
    res.status(201).json({
      ...formatWithdrawal(created),
      ...(bankAccountSaveWarning ? { bankAccountSaveWarning } : {}),
    });
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

export default router;
