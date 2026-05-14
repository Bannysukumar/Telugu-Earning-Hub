import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import {
  listUsersOrdered,
  getUser,
  updateUser,
  listAllPlansOrdered,
  createPlan,
  updatePlan,
  deletePlan,
  getPlan,
  listAllWithdrawalsOrdered,
  getWithdrawal,
  updateWithdrawal,
  listAllInvestmentsOrdered,
  getInvestment,
  createInvestment,
  toIso,
  updateInvestment,
  computeInvestmentIsActive,
  listIncomeHistoryAdmin,
  getWithdrawalFeePercent,
  setWithdrawalFeePercent,
  getPaymentSettings,
  updatePaymentSettings,
  listAllDepositsOrdered,
  getDeposit,
  resolveDepositAdmin,
  DepositAdminError,
  type PlanDoc,
  type UserDoc,
  type IncomeHistoryDoc,
  type InvestmentDoc,
} from "../lib/firestore-db.js";
import { requireAdmin } from "../lib/auth.js";
import { uploadPublicDownloadUrl, StorageUploadError } from "../lib/storage-upload.js";
import { investmentUserStatus } from "./investments.js";

const router: IRouter = Router();

const qrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
    }
  },
}).single("qr");

function zFinitePositive(field: string) {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val.replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number({ invalid_type_error: `${field} must be a number` }).finite().positive());
}

function zOptionalFinitePositive(field: string) {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val.replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number({ invalid_type_error: `${field} must be a number` }).finite().positive().optional());
}

/** maxDays: accept number or numeric string; round toward zero for floats. */
function zOptionalIntPositive(field: string) {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = typeof val === "number" ? val : Number(String(val).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return val;
    return Math.trunc(n);
  }, z.number().int({ message: `${field} must be a whole number` }).positive().optional());
}

function zDescriptionOptional() {
  return z.preprocess((val: unknown) => {
    if (val === null || val === undefined || val === "") return undefined;
    return String(val);
  }, z.string().optional());
}

function zOptionalBoolean() {
  return z.preprocess((val: unknown) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return val;
  }, z.boolean().optional());
}

function zTrimmedName() {
  return z.preprocess(
    (val: unknown) => (typeof val === "string" ? val.trim() : String(val ?? "").trim()),
    z.string().min(1, "Name is required"),
  );
}

function sendZod400(res: import("express").Response, err: z.ZodError) {
  res.status(400).json({
    error: "Invalid input",
    details: err.flatten(),
  });
}

/** Some clients send the plan fields nested as `{ data: { name, amount, ... } }` instead of a flat body. */
function normalizeAdminPlanBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const inner = o.data;
  if (
    inner &&
    typeof inner === "object" &&
    !Array.isArray(inner) &&
    ("name" in inner || "amount" in inner || "dailyRoi" in inner)
  ) {
    return inner;
  }
  return raw;
}

router.use(requireAdmin);

router.get("/dashboard", async (_req, res) => {
  const allUsers = await listUsersOrdered();
  const allInvestments = await listAllInvestmentsOrdered();
  const allWithdrawals = await listAllWithdrawalsOrdered();

  const totalUsers = allUsers.filter((u) => u.role !== "admin").length;
  const activeUsers = allUsers.filter((u) => u.isActive && u.role !== "admin").length;
  const totalInvested = allInvestments.reduce((acc, inv) => acc + inv.amount, 0);
  const totalEarned = allInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0);
  const activeInvestments = allInvestments.filter((inv) => inv.isActive).length;
  const completedInvestments = allInvestments.filter((inv) => !inv.isActive).length;
  const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending").length;
  const allDeposits = await listAllDepositsOrdered();
  const pendingDeposits = allDeposits.filter((d) => d.status === "pending").length;
  const totalWithdrawals = allWithdrawals
    .filter((w) => w.status === "approved")
    .reduce((acc, w) => acc + w.netAmount, 0);

  res.json({
    totalUsers,
    activeUsers,
    totalInvested,
    totalEarned,
    activeInvestments,
    completedInvestments,
    pendingWithdrawals,
    pendingDeposits,
    totalWithdrawals,
  });
});

router.get("/users", async (_req, res) => {
  const users = await listUsersOrdered();
  const investments = await listAllInvestmentsOrdered();

  const result = users.map((user) => {
    const userInvestments = investments.filter((inv) => inv.userId === user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role,
      walletBalance: user.walletBalance,
      isActive: user.isActive,
      totalInvested: userInvestments.reduce((acc, inv) => acc + inv.amount, 0),
      totalEarned: userInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0),
      activeInvestments: userInvestments.filter((inv) => inv.isActive).length,
      createdAt: toIso(user.createdAt),
    };
  });

  res.json(result);
});

const adminUpdateUserSchema = z.object({
  walletBalance: z.number().optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(2).optional(),
});

router.put("/users/:userId", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const parsed = adminUpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const existing = await getUser(userId);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.walletBalance !== undefined) patch.walletBalance = parsed.data.walletBalance;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;

  await updateUser(userId, patch as Partial<UserDoc>);
  const updated = await getUser(userId);
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const investments = await listAllInvestmentsOrdered();
  const userInvestments = investments.filter((inv) => inv.userId === userId);

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? "",
    role: updated.role,
    walletBalance: updated.walletBalance,
    isActive: updated.isActive,
    totalInvested: userInvestments.reduce((acc, inv) => acc + inv.amount, 0),
    totalEarned: userInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0),
    activeInvestments: userInvestments.filter((inv) => inv.isActive).length,
    createdAt: toIso(updated.createdAt),
  });
});

router.get("/plans", async (_req, res) => {
  const plans = await listAllPlansOrdered();
  res.json(
    plans.map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      dailyRoi: p.dailyRoi,
      maxReturn: p.maxReturn,
      maxDays: p.maxDays,
      description: p.description,
      isActive: p.isActive,
    })),
  );
});

const createPlanSchema = z.object({
  name: zTrimmedName(),
  amount: zFinitePositive("amount"),
  dailyRoi: zFinitePositive("dailyRoi"),
  maxReturn: zFinitePositive("maxReturn"),
  maxDays: zOptionalIntPositive("maxDays"),
  description: zDescriptionOptional(),
  isActive: zOptionalBoolean(),
});

router.post("/plans", async (req, res) => {
  const parsed = createPlanSchema.safeParse(normalizeAdminPlanBody(req.body) ?? {});
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }

  const d = parsed.data;
  const id = await createPlan({
    name: d.name,
    amount: d.amount,
    dailyRoi: d.dailyRoi,
    maxReturn: d.maxReturn,
    maxDays: d.maxDays ?? 400,
    description: d.description ?? null,
    isActive: d.isActive ?? true,
  });

  const plan = await getPlan(id);
  if (!plan) {
    res.status(500).json({ error: "Plan not persisted" });
    return;
  }

  res.status(201).json({
    id: plan.id,
    name: plan.name,
    amount: plan.amount,
    dailyRoi: plan.dailyRoi,
    maxReturn: plan.maxReturn,
    maxDays: plan.maxDays,
    description: plan.description,
    isActive: plan.isActive,
  });
});

const updatePlanSchema = z.object({
  name: z.preprocess((val: unknown) => {
    if (val === undefined || val === null) return undefined;
    const s = typeof val === "string" ? val.trim() : String(val).trim();
    return s === "" ? undefined : s;
  }, z.string().min(1).optional()),
  amount: zOptionalFinitePositive("amount"),
  dailyRoi: zOptionalFinitePositive("dailyRoi"),
  maxReturn: zOptionalFinitePositive("maxReturn"),
  maxDays: zOptionalIntPositive("maxDays"),
  description: zDescriptionOptional(),
  isActive: zOptionalBoolean(),
});

router.put("/plans/:planId", async (req, res) => {
  const planId = req.params.planId;
  if (!planId) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const parsed = updatePlanSchema.safeParse(normalizeAdminPlanBody(req.body) ?? {});
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }

  const existing = await getPlan(planId);
  if (!existing) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const patch: Partial<PlanDoc> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount;
  if (parsed.data.dailyRoi !== undefined) patch.dailyRoi = parsed.data.dailyRoi;
  if (parsed.data.maxReturn !== undefined) patch.maxReturn = parsed.data.maxReturn;
  if (parsed.data.maxDays !== undefined) patch.maxDays = parsed.data.maxDays;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

  await updatePlan(planId, patch);
  const updated = await getPlan(planId);
  if (!updated) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    amount: updated.amount,
    dailyRoi: updated.dailyRoi,
    maxReturn: updated.maxReturn,
    maxDays: updated.maxDays,
    description: updated.description,
    isActive: updated.isActive,
  });
});

router.delete("/plans/:planId", async (req, res) => {
  const planId = req.params.planId;
  if (!planId) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }

  const existing = await getPlan(planId);
  if (!existing) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  await deletePlan(planId);
  res.json({ message: "Plan deleted successfully" });
});

router.get("/withdrawals", async (_req, res) => {
  const withdrawals = await listAllWithdrawalsOrdered();
  const out = [];
  for (const w of withdrawals) {
    const u = await getUser(w.userId);
    out.push({
      id: w.id,
      userId: w.userId,
      userName: u?.name || "Unknown",
      userEmail: u?.email || "Unknown",
      requestAmount: w.requestAmount,
      feePercent: w.feePercent,
      feeAmount: w.feeAmount,
      netAmount: w.netAmount,
      status: w.status,
      bankDetails: w.bankDetails,
      createdAt: toIso(w.createdAt),
      updatedAt: w.updatedAt ? toIso(w.updatedAt) : null,
    });
  }
  res.json(out);
});

const updateWithdrawalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

router.put("/withdrawals/:withdrawalId", async (req, res) => {
  const withdrawalId = req.params.withdrawalId;
  if (!withdrawalId) {
    res.status(400).json({ error: "Invalid withdrawal ID" });
    return;
  }

  const parsed = updateWithdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const withdrawal = await getWithdrawal(withdrawalId);
  if (!withdrawal) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }

  if (parsed.data.status === "rejected" && withdrawal.status === "pending") {
    const u = await getUser(withdrawal.userId);
    if (u) {
      await updateUser(withdrawal.userId, {
        walletBalance: u.walletBalance + withdrawal.requestAmount,
      });
    }
  }

  await updateWithdrawal(withdrawalId, { status: parsed.data.status });
  const updated = await getWithdrawal(withdrawalId);
  if (!updated) {
    res.status(404).json({ error: "Withdrawal not found" });
    return;
  }

  const user = await getUser(updated.userId);

  res.json({
    id: updated.id,
    userId: updated.userId,
    userName: user?.name || "Unknown",
    userEmail: user?.email || "Unknown",
    requestAmount: updated.requestAmount,
    feePercent: updated.feePercent,
    feeAmount: updated.feeAmount,
    netAmount: updated.netAmount,
    status: updated.status,
    bankDetails: updated.bankDetails,
    createdAt: toIso(updated.createdAt),
    updatedAt: updated.updatedAt ? toIso(updated.updatedAt) : null,
  });
});

const adminSettingsSchema = z.object({
  withdrawalFeePercent: z.number().min(0).max(100),
});

router.get("/settings", async (_req, res) => {
  const withdrawalFeePercent = await getWithdrawalFeePercent();
  res.json({ withdrawalFeePercent });
});

router.put("/settings", async (req, res) => {
  const parsed = adminSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "withdrawalFeePercent must be between 0 and 100" });
    return;
  }
  await setWithdrawalFeePercent(parsed.data.withdrawalFeePercent);
  const withdrawalFeePercent = await getWithdrawalFeePercent();
  res.json({ withdrawalFeePercent });
});

router.get("/payment-settings", async (_req, res) => {
  const s = await getPaymentSettings();
  res.json({
    qrCodeImageUrl: s.qrCodeImageUrl,
    isPaymentEnabled: s.isPaymentEnabled,
    updatedAt: s.updatedAt,
  });
});

const adminPaymentSettingsPutSchema = z.object({
  qrCodeImageUrl: z.union([z.string().url(), z.literal("")]).optional(),
  isPaymentEnabled: z.boolean().optional(),
});

router.put("/payment-settings", async (req, res) => {
  const parsed = adminPaymentSettingsPutSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide qrCodeImageUrl and/or isPaymentEnabled" });
    return;
  }
  const patch: { qrCodeImageUrl?: string; isPaymentEnabled?: boolean } = {};
  if (parsed.data.qrCodeImageUrl !== undefined) patch.qrCodeImageUrl = parsed.data.qrCodeImageUrl;
  if (parsed.data.isPaymentEnabled !== undefined) patch.isPaymentEnabled = parsed.data.isPaymentEnabled;
  await updatePaymentSettings(patch);
  const s = await getPaymentSettings();
  res.json({
    qrCodeImageUrl: s.qrCodeImageUrl,
    isPaymentEnabled: s.isPaymentEnabled,
    updatedAt: s.updatedAt,
  });
});

router.post("/payment-settings/qr", (req, res, next) => {
  qrUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Image must be 3 MB or smaller." });
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
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "QR image is required (field name: qr)." });
    return;
  }
  const ext =
    file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
  const path = `payment-assets/qr-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  try {
    const qrCodeImageUrl = await uploadPublicDownloadUrl(path, file.buffer, file.mimetype);
    await updatePaymentSettings({ qrCodeImageUrl });
    res.json({ qrCodeImageUrl, updatedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof StorageUploadError) {
      res.status(400).json({ error: e.message });
      return;
    }
    throw e;
  }
});

router.get("/deposits", async (_req, res) => {
  const rows = await listAllDepositsOrdered();
  const out = [];
  for (const d of rows) {
    const u = await getUser(d.userId);
    out.push({
      id: d.id,
      userId: d.userId,
      userName: u?.name || "Unknown",
      userEmail: u?.email || "Unknown",
      amount: d.amount,
      transactionId: d.transactionId,
      screenshotUrl: d.screenshotUrl,
      note: d.note,
      status: d.status,
      createdAt: toIso(d.createdAt),
      updatedAt: d.updatedAt ? toIso(d.updatedAt) : null,
    });
  }
  res.json(out);
});

const adminDepositStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

router.put("/deposits/:depositId", async (req, res) => {
  const depositId = req.params.depositId;
  if (!depositId) {
    res.status(400).json({ error: "Invalid deposit ID" });
    return;
  }
  const parsed = adminDepositStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "status must be approved or rejected" });
    return;
  }
  try {
    await resolveDepositAdmin(depositId, parsed.data.status);
  } catch (e) {
    if (e instanceof DepositAdminError) {
      const status = e.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: e.message });
      return;
    }
    throw e;
  }
  const updated = await getDeposit(depositId);
  if (!updated) {
    res.status(404).json({ error: "Deposit not found" });
    return;
  }
  const u = await getUser(updated.userId);
  res.json({
    id: updated.id,
    userId: updated.userId,
    userName: u?.name || "Unknown",
    userEmail: u?.email || "Unknown",
    amount: updated.amount,
    transactionId: updated.transactionId,
    screenshotUrl: updated.screenshotUrl,
    note: updated.note,
    status: updated.status,
    createdAt: toIso(updated.createdAt),
    updatedAt: updated.updatedAt ? toIso(updated.updatedAt) : null,
  });
});

function adminInvestmentToJson(
  inv: InvestmentDoc & { id: string },
  u: (UserDoc & { id: string }) | null | undefined,
  p: (PlanDoc & { id: string }) | null | undefined,
) {
  return {
    id: inv.id,
    userId: inv.userId,
    userName: u?.name || "Unknown",
    userEmail: u?.email || "Unknown",
    planId: inv.planId,
    planName: p?.name || "Unknown Plan",
    amount: inv.amount,
    dailyRoi: inv.dailyRoi,
    maxReturn: inv.maxReturn,
    totalEarned: inv.totalEarned,
    daysCompleted: inv.daysCompleted,
    maxDays: inv.maxDays,
    systemActive: inv.systemActive,
    manualStatus: inv.manualStatus,
    isActive: inv.isActive,
    status: investmentUserStatus(inv),
    startDate: toIso(inv.startDate),
    lastRoiUpdate: inv.lastRoiUpdate ? toIso(inv.lastRoiUpdate) : null,
  };
}

router.get("/investments", async (req, res) => {
  const statusFilter = (req.query.status as string) || "all";
  const userIdFilter =
    typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : undefined;
  const searchRaw = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const users = await listUsersOrdered();
  const userMap = new Map(users.map((u) => [u.id, u]));

  let results = await listAllInvestmentsOrdered();
  results.sort((a, b) => toIso(b.createdAt).localeCompare(toIso(a.createdAt)));

  if (statusFilter === "active") results = results.filter((r) => r.isActive);
  else if (statusFilter === "completed") results = results.filter((r) => !r.isActive);

  if (userIdFilter) results = results.filter((r) => r.userId === userIdFilter);

  if (searchRaw) {
    results = results.filter((r) => {
      const u = userMap.get(r.userId);
      if (!u) {
        return r.userId.toLowerCase().includes(searchRaw);
      }
      return (
        r.userId.toLowerCase().includes(searchRaw) ||
        (u.email && u.email.toLowerCase().includes(searchRaw)) ||
        (u.name && u.name.toLowerCase().includes(searchRaw))
      );
    });
  }

  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = results.slice(start, start + pageSize);

  const items = [];
  for (const inv of pageRows) {
    const u = userMap.get(inv.userId) ?? (await getUser(inv.userId));
    const p = await getPlan(inv.planId);
    items.push(adminInvestmentToJson(inv, u, p));
  }

  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages,
  });
});

const adminCreateInvestmentSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
});

router.post("/investments", async (req, res) => {
  const parsed = adminCreateInvestmentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }

  const { userId, planId } = parsed.data;
  const plan = await getPlan(planId);
  if (!plan || !plan.isActive) {
    res.status(404).json({ error: "Plan not found or inactive" });
    return;
  }

  const targetUser = await getUser(userId);
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const maxReturn = plan.amount * 2;

  const invId = await createInvestment({
    userId,
    planId: plan.id,
    amount: plan.amount,
    dailyRoi: plan.dailyRoi,
    maxReturn,
    maxDays: plan.maxDays,
    totalEarned: 0,
    daysCompleted: 0,
    systemActive: true,
    manualStatus: "active",
    isActive: true,
    startDate: Timestamp.now(),
    lastRoiUpdate: null,
  });

  const investment = await getInvestment(invId);
  if (!investment) {
    res.status(500).json({ error: "Investment not created" });
    return;
  }

  res.status(201).json(adminInvestmentToJson(investment, targetUser, plan));
});

const patchInvestmentSchema = z.object({
  manualStatus: z.enum(["active", "inactive"]).optional(),
  systemActive: z.boolean().optional(),
});

router.patch("/investments/:investmentId", async (req, res) => {
  const { investmentId } = req.params;
  const parsed = patchInvestmentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }

  const inv = await getInvestment(investmentId);
  if (!inv) {
    res.status(404).json({ error: "Investment not found" });
    return;
  }

  const systemActive = parsed.data.systemActive ?? inv.systemActive;
  const manualStatus = parsed.data.manualStatus ?? inv.manualStatus;
  const isActive = computeInvestmentIsActive(systemActive, manualStatus);

  await updateInvestment(investmentId, {
    systemActive,
    manualStatus,
    isActive,
  });

  const updated = await getInvestment(investmentId);
  if (!updated) {
    res.status(500).json({ error: "Investment update failed" });
    return;
  }

  const u = await getUser(updated.userId);
  const p = await getPlan(updated.planId);

  res.json(adminInvestmentToJson(updated, u, p));
});

function formatIncomeHistoryApi(row: IncomeHistoryDoc & { id: string }, planName: string | null) {
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

router.get("/income-history", async (req, res) => {
  const userId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : null;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : null;

  const { items, nextCursor } = await listIncomeHistoryAdmin({ userId, limit, cursor });

  const out = [];
  for (const row of items) {
    let planName: string | null = null;
    if (row.type !== "WITHDRAWAL" && row.investmentId && row.investmentId !== "__withdrawal__" && row.investmentId !== "__deposit__") {
      const inv = await getInvestment(row.investmentId);
      const p = inv ? await getPlan(inv.planId) : null;
      planName = p?.name ?? null;
    }
    out.push(formatIncomeHistoryApi(row, planName));
  }

  res.json({ items: out, nextCursor });
});

export default router;
