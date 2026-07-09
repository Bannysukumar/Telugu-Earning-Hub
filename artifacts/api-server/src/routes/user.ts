import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import {
  getUser,
  listInvestmentsByUser,
  listInvestmentsByUserIds,
  listWithdrawalsByUser,
  updateUser,
  listIncomeHistoryForUser,
  getInvestment,
  getPlan,
  type IncomeHistoryDoc,
  type UserDoc,
  toIso,
  getPaymentSettings,
  listDepositsByUser,
  createDepositAtomic,
  normalizeDepositTransactionId,
  DepositRequestError,
  type DepositDoc,
  listDirectReferralsByReferrerId,
  findUserByEmail,
  transferWalletPeerToPeer,
  listSavedBankAccounts,
  upsertSavedBankAccountForUser,
  updateSavedBankAccountById,
  deleteSavedBankAccount,
  savedBankAccountToResponse,
  BankAccountLimitError,
  DuplicateSavedBankAccountError,
  getBinaryPlanEnabled,
} from "../lib/firestore-db.js";
import { requireAuth, formatUserResponse, type AuthedUser } from "../lib/auth.js";
import { identitySignIn, identityChangePassword } from "../lib/identity-toolkit.js";
import { errorMessage, httpErrorFromUnknown } from "../lib/errors.js";
import { uploadPublicDownloadUrl, StorageUploadError } from "../lib/storage-upload.js";
import { findReferrerByCode } from "../lib/investment-mlm.js";
import { buildBinaryTreeJson } from "../lib/binary-tree.js";
import { buildSponsorTreeJson } from "../lib/sponsor-tree.js";
import {
  getGrowthPlanSettings,
  growthUserInvestmentTotals,
  listGrowthCycles,
  listGrowthCyclesByUserIds,
  mergeMemberInvestmentStats,
  type GrowthUserDoc,
} from "../lib/growth-plan-db.js";
import { buildUpiPaymentUri, pickRandomUpiId } from "../lib/upi.js";

const router: IRouter = Router();

/** Express may surface duplicate query keys as `string[]`; take the first non-empty string. */
function singleQueryString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  }
  return "";
}

const depositScreenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
    }
  },
}).single("screenshot");

function depositToJson(d: DepositDoc & { id: string }) {
  return {
    id: d.id,
    amount: d.amount,
    transactionId: d.transactionId,
    screenshotUrl: d.screenshotUrl,
    note: d.note,
    payeeUpiId: d.payeeUpiId ?? null,
    status: d.status,
    createdAt: toIso(d.createdAt),
    updatedAt: d.updatedAt ? toIso(d.updatedAt) : null,
  };
}

function paymentSettingsToJson(s: Awaited<ReturnType<typeof getPaymentSettings>>) {
  return {
    qrCodeImageUrl: s.qrCodeImageUrl,
    isPaymentEnabled: s.isPaymentEnabled,
    depositMethod: s.depositMethod,
    upiIds: s.upiIds,
    payeeName: s.payeeName,
    updatedAt: s.updatedAt,
  };
}

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;

  const [allInvestments, withdrawals, fresh, growthCycles, growthSettings] = await Promise.all([
    listInvestmentsByUser(user.id),
    listWithdrawalsByUser(user.id),
    getUser(user.id),
    listGrowthCycles(user.id),
    getGrowthPlanSettings(),
  ]);

  const growthTotals = growthUserInvestmentTotals(
    (fresh ?? user) as GrowthUserDoc,
    growthCycles,
    growthSettings,
  );
  const totalInvested =
    allInvestments.reduce((acc, inv) => acc + inv.amount, 0) + growthTotals.totalInvested;
  const totalEarned =
    allInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0) + growthTotals.totalEarned;
  const activeInvestments =
    allInvestments.filter((inv) => inv.isActive).length + growthTotals.activeInvestments;
  const completedInvestments =
    allInvestments.filter((inv) => !inv.isActive).length +
    (growthTotals.totalInvested > 0 && growthTotals.activeInvestments === 0 ? 1 : 0);

  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((acc, w) => acc + w.requestAmount, 0);

  const walletBalance = fresh ? fresh.walletBalance : 0;

  res.json({
    totalInvested,
    totalEarned,
    walletBalance,
    activeInvestments,
    completedInvestments,
    pendingWithdrawals,
  });
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
});

router.put("/profile", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  if (!parsed.data.name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  await updateUser(user.id, { name: parsed.data.name });
  const updated = await getUser(user.id);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(await formatUserResponse(updated));
});

const bankIfscField = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/\s/g, ""))
  .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC"));

const bankAccountField = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s/g, ""))
  .pipe(
    z
      .string()
      .min(9)
      .max(18)
      .regex(/^\d+$/, "Account number must contain digits only"),
  );

const createBankAccountSchema = z.object({
  bankName: z.string().trim().min(2),
  ifscCode: bankIfscField,
  accountNumber: bankAccountField,
  accountHolderName: z.string().trim().min(2),
  label: z.string().trim().max(80).optional(),
});

const updateBankAccountSchema = z
  .object({
    bankName: z.string().trim().min(2).optional(),
    ifscCode: bankIfscField.optional(),
    accountNumber: bankAccountField.optional(),
    accountHolderName: z.string().trim().min(2).optional(),
    label: z.union([z.string().trim().max(80), z.literal("")]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

router.get("/bank-accounts", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const rows = await listSavedBankAccounts(user.id);
  res.json(rows.map(savedBankAccountToResponse));
});

router.post("/bank-accounts", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = createBankAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }
  const { label, ...rest } = parsed.data;
  try {
    const row = await upsertSavedBankAccountForUser(user.id, {
      ...rest,
      ...(label?.trim() ? { label: label.trim() } : {}),
    });
    res.status(201).json(savedBankAccountToResponse(row));
  } catch (e: unknown) {
    if (e instanceof BankAccountLimitError) {
      res.status(400).json({ error: e.message });
      return;
    }
    throw e;
  }
});

router.put("/bank-accounts/:accountId", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const accountId = singleQueryString(req.params.accountId);
  if (!accountId) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  const parsed = updateBankAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }
  const patch: Parameters<typeof updateSavedBankAccountById>[2] = {};
  if (parsed.data.bankName !== undefined) patch.bankName = parsed.data.bankName;
  if (parsed.data.ifscCode !== undefined) patch.ifscCode = parsed.data.ifscCode;
  if (parsed.data.accountNumber !== undefined) patch.accountNumber = parsed.data.accountNumber;
  if (parsed.data.accountHolderName !== undefined) patch.accountHolderName = parsed.data.accountHolderName;
  if (parsed.data.label !== undefined) {
    patch.label = parsed.data.label === "" ? null : parsed.data.label;
  }
  try {
    const row = await updateSavedBankAccountById(user.id, accountId, patch);
    if (!row) {
      res.status(404).json({ error: "Bank account not found" });
      return;
    }
    res.json(savedBankAccountToResponse(row));
  } catch (e: unknown) {
    if (e instanceof DuplicateSavedBankAccountError) {
      res.status(409).json({ error: e.message });
      return;
    }
    throw e;
  }
});

router.delete("/bank-accounts/:accountId", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const accountId = singleQueryString(req.params.accountId);
  if (!accountId) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  const ok = await deleteSavedBankAccount(user.id, accountId);
  if (!ok) {
    res.status(404).json({ error: "Bank account not found" });
    return;
  }
  res.status(204).end();
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmNewPassword: z.string().min(6, "Confirm new password is required"),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "New passwords do not match",
    path: ["confirmNewPassword"],
  });

router.put("/change-password", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first.confirmNewPassword?.[0] ??
      first.newPassword?.[0] ??
      first.currentPassword?.[0] ??
      "Invalid input";
    res.status(400).json({ error: msg });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    res.status(400).json({ error: "New password must be different from your current password." });
    return;
  }

  try {
    const cred = await identitySignIn(user.email, currentPassword);
    if (cred.localId !== user.id) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const updated = await identityChangePassword(cred.idToken, newPassword);
    res.json({
      message: "Password updated successfully.",
      token: updated.idToken,
    });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    if (
      msg.includes("INVALID_PASSWORD") ||
      msg.includes("INVALID_LOGIN_CREDENTIALS") ||
      msg.includes("EMAIL_NOT_FOUND")
    ) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const { status, error } = httpErrorFromUnknown(e);
    res.status(status).json({ error });
  }
});

const walletTransferSchema = z
  .object({
    amount: z.number().finite().positive(),
    toUserId: z.string().min(1).optional(),
    toEmail: z.string().email().optional(),
    toReferralCode: z.string().min(2).max(32).optional(),
  })
  .refine((d) => [d.toUserId, d.toEmail, d.toReferralCode].filter(Boolean).length === 1, {
    message: "Specify exactly one of toUserId, toEmail, or toReferralCode",
  });

router.post("/wallet/transfer", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = walletTransferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { amount, toUserId, toEmail, toReferralCode } = parsed.data;
  let recipient: Awaited<ReturnType<typeof getUser>> = null;
  if (toUserId) recipient = await getUser(toUserId.trim());
  else if (toEmail) recipient = await findUserByEmail(toEmail);
  else if (toReferralCode) recipient = await findReferrerByCode(toReferralCode);

  if (!recipient) {
    res.status(404).json({ error: "Recipient not found." });
    return;
  }
  if (recipient.id === user.id) {
    res.status(400).json({ error: "Cannot transfer to yourself." });
    return;
  }

  let transferMeta: Awaited<ReturnType<typeof transferWalletPeerToPeer>>;
  try {
    transferMeta = await transferWalletPeerToPeer(user.id, recipient.id, amount);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const needsActivePlan = msg.includes("active investment plan");
    res.status(needsActivePlan ? 403 : 400).json({ error: msg });
    return;
  }

  const fresh = await getUser(user.id);
  res.json({
    walletBalance: fresh?.walletBalance ?? 0,
    recipientId: recipient.id,
    recipientName: recipient.name,
    feePercent: transferMeta.feePercent,
    feeAmount: transferMeta.feeAmount,
    recipientReceived: transferMeta.recipientReceived,
  });
});

router.get("/members/resolve", requireAuth, async (req, res) => {
  const userIdRaw = singleQueryString(req.query.userId);
  const emailRaw = singleQueryString(req.query.email);
  const referralRaw = singleQueryString(req.query.referralCode);
  const provided = [userIdRaw, emailRaw, referralRaw].filter(Boolean).length;
  if (provided !== 1) {
    res.status(400).json({ error: "Provide exactly one of userId, email, or referralCode." });
    return;
  }

  let member: Awaited<ReturnType<typeof getUser>> = null;
  if (userIdRaw) member = await getUser(userIdRaw);
  else if (emailRaw) member = await findUserByEmail(emailRaw);
  else member = await findReferrerByCode(referralRaw);

  if (!member) {
    res.status(404).json({ error: "Member not found." });
    return;
  }
  if (member.role === "admin") {
    res.status(400).json({ error: "Invalid member." });
    return;
  }

  res.json({
    id: member.id,
    name: member.name,
    referralCode: member.referralCode?.trim() || null,
  });
});

function formatIncomeHistoryUser(row: IncomeHistoryDoc & { id: string }, planName: string | null) {
  return {
    id: row.id,
    userId: row.userId,
    investmentId: row.investmentId,
    amount: row.amount,
    type: row.type,
    date: toIso(row.date),
    planAmount: row.planAmount,
    dayNumber: row.dayNumber,
    note: row.note ?? null,
    planName,
    feeAmount: row.feeAmount ?? null,
    netAmount: row.netAmount ?? null,
  };
}

router.get("/income-history", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : null;

  const { items, nextCursor } = await listIncomeHistoryForUser(user.id, { limit, cursor });

  const out = [];
  for (const row of items) {
    let planName: string | null = null;
    if (
      row.investmentId === "__growth_plan__" ||
      row.type === "GROWTH_ROI" ||
      row.type === "GROWTH_DIRECT"
    ) {
      planName = "Smart Growth Plan";
    } else if (
      row.type !== "WITHDRAWAL" &&
      row.investmentId &&
      row.investmentId !== "__withdrawal__" &&
      row.investmentId !== "__deposit__" &&
      row.investmentId !== "__peer_transfer__"
    ) {
      const inv = await getInvestment(row.investmentId);
      const p = inv ? await getPlan(inv.planId) : null;
      planName = p?.name ?? null;
    }
    out.push(formatIncomeHistoryUser(row, planName));
  }

  res.json({ items: out, nextCursor: nextCursor ?? null });
});

router.get("/direct-level", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const directs = await listDirectReferralsByReferrerId(user.id);
  const directIds = directs.map((d) => d.id);
  const [invByUser, growthCyclesByUser, growthSettings] = await Promise.all([
    listInvestmentsByUserIds(directIds),
    listGrowthCyclesByUserIds(directIds),
    getGrowthPlanSettings(),
  ]);
  const out = directs.map((d) => {
    const invs = invByUser.get(d.id) ?? [];
    const cycles = growthCyclesByUser.get(d.id) ?? [];
    const stats = mergeMemberInvestmentStats(invs, d as GrowthUserDoc, cycles, growthSettings);
    return {
      id: d.id,
      name: d.name,
      email: d.email,
      referralCode: d.referralCode ?? null,
      binarySide: d.binarySide === "left" || d.binarySide === "right" ? d.binarySide : null,
      createdAt: toIso(d.createdAt),
      hasActivatedInvestment: stats.hasActivatedInvestment,
      activeInvestmentsCount: stats.activeInvestmentsCount,
      totalInvested: stats.totalInvested,
    };
  });
  res.json({ directs: out });
});

router.get("/binary-tree", requireAuth, async (req, res) => {
  if (!(await getBinaryPlanEnabled())) {
    res.status(404).json({ error: "Binary plan is disabled" });
    return;
  }
  const user = (req as Request & { user: AuthedUser }).user;
  const maxRaw = Number(req.query.maxDepth);
  const maxDepth = Math.min(8, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 5));
  const root = await buildBinaryTreeJson(user, maxDepth);
  res.json({ root, maxDepth });
});

router.get("/sponsor-tree", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const maxRaw = Number(req.query.maxDepth);
  const maxDepth = Math.min(8, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 5));
  const root = await buildSponsorTreeJson(user, maxDepth);
  res.json({ root, maxDepth });
});

router.get("/payment-settings", requireAuth, async (_req, res) => {
  const s = await getPaymentSettings();
  res.json(paymentSettingsToJson(s));
});

const generatePaymentSchema = z.object({
  amount: z.number().finite().positive(),
});

router.post("/deposits/generate-payment", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = generatePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid amount greater than 0." });
    return;
  }

  const settings = await getPaymentSettings();
  if (!settings.isPaymentEnabled) {
    res.status(400).json({ error: "Deposits are currently disabled." });
    return;
  }
  if (settings.depositMethod !== "dynamic_upi") {
    res.status(400).json({ error: "Dynamic UPI payments are not enabled. Use the QR on this page." });
    return;
  }

  const selectedUpiId = pickRandomUpiId(settings.upiIds);
  if (!selectedUpiId) {
    res.status(503).json({ error: "No UPI IDs configured. Contact support." });
    return;
  }

  const amount = Math.round(parsed.data.amount * 100) / 100;
  const upiDeepLink = buildUpiPaymentUri({
    vpa: selectedUpiId,
    payeeName: settings.payeeName,
    amount,
    note: `Deposit ${user.id.slice(0, 8)}`,
  });

  res.json({
    amount,
    selectedUpiId,
    payeeName: settings.payeeName,
    upiDeepLink,
  });
});

router.get("/deposits", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const rows = await listDepositsByUser(user.id);
  const pendingDeposit = rows.find((r) => r.status === "pending") ?? null;
  res.json({
    pendingDeposit: pendingDeposit ? depositToJson(pendingDeposit) : null,
    history: rows.map(depositToJson),
  });
});

router.post("/deposits", requireAuth, (req, res, next) => {
  depositScreenshotUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Screenshot must be 5 MB or smaller." });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const file = req.file;
  const amount = Number(req.body?.amount);
  const transactionId = normalizeDepositTransactionId(String(req.body?.transactionId ?? ""));
  const noteRaw = req.body?.note;
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 2000) : null;
  const payeeUpiRaw = req.body?.payeeUpiId;
  const payeeUpiId =
    typeof payeeUpiRaw === "string" && payeeUpiRaw.trim() ? payeeUpiRaw.trim().toLowerCase() : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Amount must be a number greater than 0." });
    return;
  }
  if (!transactionId && !file?.buffer) {
    res.status(400).json({ error: "Provide your UTR / transaction ID or upload a payment screenshot." });
    return;
  }

  let screenshotUrl = "";
  if (file?.buffer) {
    const ext =
      file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
    const path = `deposit-screenshots/${user.id}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    try {
      screenshotUrl = await uploadPublicDownloadUrl(path, file.buffer, file.mimetype);
    } catch (e) {
      if (e instanceof StorageUploadError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }
  }

  try {
    const id = await createDepositAtomic({
      userId: user.id,
      amount,
      transactionId,
      screenshotUrl,
      note,
      payeeUpiId,
    });
    res.status(201).json({ id, screenshotUrl, message: "Deposit request submitted." });
  } catch (e) {
    if (e instanceof DepositRequestError) {
      const code = e.code;
      const status =
        code === "PENDING_DEPOSIT_EXISTS" || code === "DUPLICATE_TRANSACTION_ID" ? 409 : 400;
      res.status(status).json({ error: e.message, code });
      return;
    }
    throw e;
  }
});

export default router;
