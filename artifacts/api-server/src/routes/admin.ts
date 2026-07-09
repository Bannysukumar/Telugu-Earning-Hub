import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod";
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
  toIso,
  updateInvestment,
  computeInvestmentIsActive,
  listIncomeHistoryAdmin,
  getWithdrawalFeePercent,
  getWithdrawalFeePercentForUser,
  setUserWithdrawalFeePercent,
  clearUserWithdrawalFeePercent,
  userWithdrawalFeePercentOverride,
  getPeerTransferFeePercent,
  getBinaryPlanEnabled,
  getDirectIncomeEnabled,
  getStandalonePlanCreationOnly,
  getMinWithdrawalAmount,
  getDefaultLevelIncomeOnNewPlans,
  getLevelIncomeTiers,
  setLevelIncomeTiers,
  patchGlobalSettings,
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
import { logger } from "../lib/logger.js";
import { uploadPublicDownloadUrl, StorageUploadError } from "../lib/storage-upload.js";
import { investmentUserStatus } from "./investments.js";
import {
  createInvestmentWithMlmAtomic,
  resolvedDirectBonus,
  resolvedBinaryPairVolume,
  resolvedBinaryPairPayout,
  resolvedRoiPoolPercent,
  resolvedLevelIncomeEnabled,
  isStandalonePlan,
  DEFAULT_PLAN_DIRECT_BONUS,
  DEFAULT_BINARY_PAIR_VOLUME,
  DEFAULT_BINARY_PAIR_PAYOUT,
  DEFAULT_ROI_POOL_PERCENT,
} from "../lib/investment-mlm.js";
import {
  MAX_LEVEL_INCOME_TIERS,
  validateLevelIncomeTiersInput,
  parseLevelIncomeTiers,
} from "../lib/level-income-config.js";
import { buildBinaryTreeJson } from "../lib/binary-tree.js";
import { buildSponsorTreeJson } from "../lib/sponsor-tree.js";
import { sanitizeUpiIds } from "../lib/upi.js";
import {
  getGrowthPlanSettings,
  growthCycleToAdminInvestmentJson,
  growthUserInvestmentTotals,
  listAllGrowthCyclesOrdered,
  GROWTH_PLAN_DEFAULTS,
  type GrowthCycleDoc,
  type GrowthPlanSettingsDoc,
  type GrowthUserDoc,
} from "../lib/growth-plan-db.js";

type AdminDirectMember = { id: string; name: string };

function buildDirectLegsByReferrer(users: (UserDoc & { id: string })[]): Map<string, { left: AdminDirectMember[]; right: AdminDirectMember[] }> {
  const userById = new Map(users.map((u) => [u.id, u]));
  const byReferrer = new Map<string, { left: AdminDirectMember[]; right: AdminDirectMember[] }>();

  const sortByCreated = (a: AdminDirectMember, b: AdminDirectMember) =>
    toIso(userById.get(a.id)!.createdAt).localeCompare(toIso(userById.get(b.id)!.createdAt));

  for (const u of users) {
    if (!u.referrerId) continue;
    let slot = byReferrer.get(u.referrerId);
    if (!slot) {
      slot = { left: [], right: [] };
      byReferrer.set(u.referrerId, slot);
    }
    const entry = { id: u.id, name: u.name };
    if (u.binarySide === "left") slot.left.push(entry);
    else if (u.binarySide === "right") slot.right.push(entry);
  }

  for (const slot of byReferrer.values()) {
    slot.left.sort(sortByCreated);
    slot.right.sort(sortByCreated);
  }

  return byReferrer;
}

function formatAdminUser(
  user: UserDoc & { id: string },
  userInvestments: InvestmentDoc[],
  legsByReferrer: Map<string, { left: AdminDirectMember[]; right: AdminDirectMember[] }>,
  growthCycles: (GrowthCycleDoc & { id: string })[] = [],
  growthSettings: GrowthPlanSettingsDoc = GROWTH_PLAN_DEFAULTS as GrowthPlanSettingsDoc,
) {
  const growth = (user as UserDoc & {
    growthPlan?: {
      planStatus?: string;
      planEndDate?: { toDate?: () => Date } | Date | null;
    };
  }).growthPlan;
  const growthPlanStatus = String(growth?.planStatus ?? "pending");
  let growthRemainingDays = 0;
  if (growthPlanStatus === "active" && growth?.planEndDate) {
    const end =
      growth.planEndDate instanceof Date
        ? growth.planEndDate
        : growth.planEndDate?.toDate?.() ?? null;
    if (end) {
      growthRemainingDays = Math.max(
        0,
        Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      );
    }
  }
  const legs = legsByReferrer.get(user.id) ?? { left: [], right: [] };
  const growthTotals = growthUserInvestmentTotals(user as GrowthUserDoc, growthCycles, growthSettings);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role,
    walletBalance: user.walletBalance,
    isActive: user.isActive,
    totalInvested:
      userInvestments.reduce((acc, inv) => acc + inv.amount, 0) + growthTotals.totalInvested,
    totalEarned:
      userInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0) + growthTotals.totalEarned,
    activeInvestments:
      userInvestments.filter((inv) => inv.isActive).length + growthTotals.activeInvestments,
    createdAt: toIso(user.createdAt),
    referralCode: user.referralCode?.trim() || null,
    growthPlanStatus,
    growthRemainingDays,
    directLeft: legs.left,
    directRight: legs.right,
  };
}

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

function zOptionalFiniteNonNegative(field: string) {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val.replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number({ invalid_type_error: `${field} must be a number` }).finite().nonnegative().optional());
}

function zOptionalRoiPoolPercent() {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = typeof val === "number" ? val : Number(String(val).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return val;
    return Math.round(n);
  }, z.number().int({ message: "ROI pool % must be a whole number" }).min(1).max(100).optional());
}

function zOptionalLevelIncomePercent() {
  return z.preprocess((val: unknown) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const n = typeof val === "number" ? val : Number(String(val).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return val;
    return Math.round(n);
  }, z.number().int({ message: "Level income % must be a whole number" }).min(0).max(100).optional());
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

/** Recognize `{ data: { ... } }` wrappers (Orval-style) so MLM fields are not dropped when only nested keys are present. */
function isPlanFieldBag(inner: object): boolean {
  const keys = [
    "name",
    "amount",
    "dailyRoi",
    "maxReturn",
    "maxDays",
    "description",
    "isActive",
    "directBonus",
    "binaryPairVolume",
    "binaryPairPayout",
    "roiPoolPercent",
  ] as const;
  return keys.some((k) => k in inner);
}

/** Some clients send the plan fields nested as `{ data: { name, amount, ... } }` instead of a flat body. */
function normalizeAdminPlanBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner) && isPlanFieldBag(inner)) {
    return inner;
  }
  return raw;
}

router.use(requireAdmin);

/** YYYY-MM-DD in a specific IANA zone (used for "today" vs user `createdAt`). */
function calendarDateInZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

router.get("/dashboard", async (_req, res) => {
  const allUsers = await listUsersOrdered();
  const allInvestments = await listAllInvestmentsOrdered();
  const allWithdrawals = await listAllWithdrawalsOrdered();

  const totalUsers = allUsers.filter((u) => u.role !== "admin").length;
  const activeUsers = allUsers.filter((u) => u.isActive && u.role !== "admin").length;
  const todayIndia = calendarDateInZone(new Date(), "Asia/Kolkata");
  const dailyRegistrations = allUsers.filter(
    (u) => u.role !== "admin" && calendarDateInZone(u.createdAt.toDate(), "Asia/Kolkata") === todayIndia,
  ).length;
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
    dailyRegistrations,
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
  const [users, investments, allGrowthCycles, growthSettings] = await Promise.all([
    listUsersOrdered(),
    listAllInvestmentsOrdered(),
    listAllGrowthCyclesOrdered(),
    getGrowthPlanSettings(),
  ]);
  const legsByReferrer = buildDirectLegsByReferrer(users);
  const growthCyclesByUser = new Map<string, (GrowthCycleDoc & { id: string })[]>();
  for (const cycle of allGrowthCycles) {
    const list = growthCyclesByUser.get(cycle.userId) ?? [];
    list.push(cycle);
    growthCyclesByUser.set(cycle.userId, list);
  }

  const result = users.map((user) => {
    const userInvestments = investments.filter((inv) => inv.userId === user.id);
    const userGrowthCycles = growthCyclesByUser.get(user.id) ?? [];
    return formatAdminUser(user, userInvestments, legsByReferrer, userGrowthCycles, growthSettings);
  });

  res.json(result);
});

router.get("/withdrawal-fees", async (_req, res) => {
  const [users, globalWithdrawalFeePercent] = await Promise.all([
    listUsersOrdered(),
    getWithdrawalFeePercent(),
  ]);
  const rows = users
    .filter((u) => u.role !== "admin")
    .map((u) => {
      const customWithdrawalFeePercent = userWithdrawalFeePercentOverride(u);
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        customWithdrawalFeePercent,
        effectiveWithdrawalFeePercent: customWithdrawalFeePercent ?? globalWithdrawalFeePercent,
      };
    });
  res.json({ globalWithdrawalFeePercent, users: rows });
});

const setUserWithdrawalFeeSchema = z.object({
  withdrawalFeePercent: z.number().min(0).max(100),
});

router.put("/users/:userId/withdrawal-fee", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const parsed = setUserWithdrawalFeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a fee between 0 and 100." });
    return;
  }
  const existing = await getUser(userId);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (existing.role === "admin") {
    res.status(400).json({ error: "Cannot set a custom withdrawal fee for admin accounts." });
    return;
  }
  await setUserWithdrawalFeePercent(userId, parsed.data.withdrawalFeePercent);
  const fees = await getWithdrawalFeePercentForUser(userId);
  res.json({
    userId,
    name: existing.name,
    email: existing.email,
    customWithdrawalFeePercent: fees.customPercent,
    effectiveWithdrawalFeePercent: fees.effectivePercent,
    globalWithdrawalFeePercent: fees.globalPercent,
  });
});

router.delete("/users/:userId/withdrawal-fee", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const existing = await getUser(userId);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await clearUserWithdrawalFeePercent(userId);
  const fees = await getWithdrawalFeePercentForUser(userId);
  res.json({
    userId,
    name: existing.name,
    email: existing.email,
    customWithdrawalFeePercent: fees.customPercent,
    effectiveWithdrawalFeePercent: fees.effectivePercent,
    globalWithdrawalFeePercent: fees.globalPercent,
  });
});

router.get("/users/:userId/binary-tree", async (req, res) => {
  if (!(await getBinaryPlanEnabled())) {
    res.status(404).json({ error: "Binary plan is disabled" });
    return;
  }
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const user = await getUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const maxRaw = Number(req.query.maxDepth);
  const maxDepth = Math.min(8, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 5));
  const root = await buildBinaryTreeJson(user, maxDepth);
  res.json({ root, maxDepth });
});

router.get("/users/:userId/sponsor-tree", async (req, res) => {
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const user = await getUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const maxRaw = Number(req.query.maxDepth);
  const maxDepth = Math.min(8, Math.max(1, Number.isFinite(maxRaw) ? maxRaw : 5));
  const root = await buildSponsorTreeJson(user, maxDepth);
  res.json({ root, maxDepth });
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

  const [users, investments, allGrowthCycles, growthSettings] = await Promise.all([
    listUsersOrdered(),
    listAllInvestmentsOrdered(),
    listAllGrowthCyclesOrdered(),
    getGrowthPlanSettings(),
  ]);
  const userInvestments = investments.filter((inv) => inv.userId === userId);
  const legsByReferrer = buildDirectLegsByReferrer(users);
  const userGrowthCycles = allGrowthCycles.filter((c) => c.userId === userId);

  res.json(formatAdminUser(updated, userInvestments, legsByReferrer, userGrowthCycles, growthSettings));
});

function planJson(p: PlanDoc & { id: string }) {
  const levelIncomeTiers =
    p.levelIncomeTiers && p.levelIncomeTiers.length > 0
      ? parseLevelIncomeTiers(p.levelIncomeTiers)
      : undefined;
  return {
    id: p.id,
    name: p.name,
    amount: p.amount,
    dailyRoi: p.dailyRoi,
    maxReturn: p.maxReturn,
    maxDays: p.maxDays,
    description: p.description,
    isActive: p.isActive,
    directBonus: resolvedDirectBonus(p),
    binaryPairVolume: resolvedBinaryPairVolume(p),
    binaryPairPayout: resolvedBinaryPairPayout(p),
    roiPoolPercent: resolvedRoiPoolPercent(p),
    levelIncomeEnabled: resolvedLevelIncomeEnabled(p),
    levelIncomeTiers,
    planKind: isStandalonePlan(p) ? "standalone" : "mlm",
  };
}

const planLevelIncomeTierSchema = z.object({
  level: z.number().int().min(1).max(MAX_LEVEL_INCOME_TIERS),
  percent: z.number().int().min(0).max(100),
});

function resolvePlanLevelIncomeTiers(
  enabled: boolean,
  raw: { level: number; percent: number }[] | undefined,
  globalTiers: { level: number; percent: number }[],
): { level: number; percent: number }[] | undefined {
  if (!enabled) return undefined;
  const source = raw && raw.length > 0 ? raw : globalTiers;
  const validated = validateLevelIncomeTiersInput(source);
  if (!validated.ok) return undefined;
  return validated.tiers;
}

router.get("/plans", async (_req, res) => {
  const plans = await listAllPlansOrdered();
  res.json(plans.map(planJson));
});

const createPlanSchema = z.object({
  name: zTrimmedName(),
  amount: zFinitePositive("amount"),
  dailyRoi: zFinitePositive("dailyRoi"),
  maxReturn: zFinitePositive("maxReturn"),
  maxDays: zOptionalIntPositive("maxDays"),
  description: zDescriptionOptional(),
  isActive: zOptionalBoolean(),
  directBonus: zOptionalFiniteNonNegative("directBonus"),
  binaryPairVolume: zOptionalIntPositive("binaryPairVolume"),
  binaryPairPayout: zOptionalFiniteNonNegative("binaryPairPayout"),
  roiPoolPercent: zOptionalRoiPoolPercent(),
  levelIncomeEnabled: zOptionalBoolean(),
  levelIncomeTiers: z.array(planLevelIncomeTierSchema).max(MAX_LEVEL_INCOME_TIERS).optional(),
  planKind: z.enum(["mlm", "standalone"]).optional(),
});

router.post("/plans", async (req, res) => {
  const parsed = createPlanSchema.safeParse(normalizeAdminPlanBody(req.body) ?? {});
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }

  const d = parsed.data;
  const standalone = d.planKind === "standalone";
  const levelIncomeEnabled = standalone ? false : (d.levelIncomeEnabled ?? false);

  let levelIncomeTiers: { level: number; percent: number }[] | undefined;
  if (levelIncomeEnabled) {
    const globalTiers = await getLevelIncomeTiers();
    const resolved = resolvePlanLevelIncomeTiers(true, d.levelIncomeTiers, globalTiers);
    if (!resolved) {
      const check = validateLevelIncomeTiersInput(d.levelIncomeTiers ?? globalTiers);
      res.status(400).json({ error: check.ok ? "Invalid level income schedule for this plan." : check.error });
      return;
    }
    levelIncomeTiers = resolved;
  }

  const id = await createPlan({
    name: d.name,
    amount: d.amount,
    dailyRoi: d.dailyRoi,
    maxReturn: d.maxReturn,
    maxDays: d.maxDays ?? 400,
    description: d.description ?? null,
    isActive: d.isActive ?? true,
    planKind: standalone ? "standalone" : "mlm",
    directBonus: standalone ? 0 : (d.directBonus ?? DEFAULT_PLAN_DIRECT_BONUS),
    binaryPairVolume: standalone ? 1 : (d.binaryPairVolume ?? DEFAULT_BINARY_PAIR_VOLUME),
    binaryPairPayout: standalone ? 0 : (d.binaryPairPayout ?? DEFAULT_BINARY_PAIR_PAYOUT),
    roiPoolPercent: d.roiPoolPercent ?? DEFAULT_ROI_POOL_PERCENT,
    levelIncomeEnabled,
    ...(levelIncomeTiers ? { levelIncomeTiers } : {}),
  });

  const plan = await getPlan(id);
  if (!plan) {
    res.status(500).json({ error: "Plan not persisted" });
    return;
  }

  res.status(201).json(planJson(plan));
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
  directBonus: zOptionalFiniteNonNegative("directBonus"),
  binaryPairVolume: zOptionalIntPositive("binaryPairVolume"),
  binaryPairPayout: zOptionalFiniteNonNegative("binaryPairPayout"),
  roiPoolPercent: zOptionalRoiPoolPercent(),
  levelIncomeEnabled: zOptionalBoolean(),
  levelIncomeTiers: z.array(planLevelIncomeTierSchema).max(MAX_LEVEL_INCOME_TIERS).optional(),
  planKind: z.enum(["mlm", "standalone"]).optional(),
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
  if (parsed.data.directBonus !== undefined) patch.directBonus = parsed.data.directBonus;
  if (parsed.data.binaryPairVolume !== undefined) patch.binaryPairVolume = parsed.data.binaryPairVolume;
  if (parsed.data.binaryPairPayout !== undefined) patch.binaryPairPayout = parsed.data.binaryPairPayout;
  if (parsed.data.roiPoolPercent !== undefined) patch.roiPoolPercent = parsed.data.roiPoolPercent;
  if (parsed.data.levelIncomeEnabled !== undefined) patch.levelIncomeEnabled = parsed.data.levelIncomeEnabled;
  if (parsed.data.planKind !== undefined) {
    patch.planKind = parsed.data.planKind;
    if (parsed.data.planKind === "standalone") {
      patch.directBonus = 0;
      patch.binaryPairVolume = 1;
      patch.binaryPairPayout = 0;
      patch.levelIncomeEnabled = false;
      patch.levelIncomeTiers = [];
    }
  }

  const nextLevelIncomeEnabled =
    patch.levelIncomeEnabled !== undefined ? patch.levelIncomeEnabled : resolvedLevelIncomeEnabled(existing);

  if (parsed.data.levelIncomeTiers !== undefined || patch.levelIncomeEnabled === false) {
    if (!nextLevelIncomeEnabled || patch.levelIncomeEnabled === false) {
      patch.levelIncomeTiers = [];
    } else if (parsed.data.levelIncomeTiers !== undefined) {
      const globalTiers = await getLevelIncomeTiers();
      const resolved = resolvePlanLevelIncomeTiers(true, parsed.data.levelIncomeTiers, globalTiers);
      if (!resolved) {
        const check = validateLevelIncomeTiersInput(parsed.data.levelIncomeTiers);
        res.status(400).json({ error: check.ok ? "Invalid level income schedule." : check.error });
        return;
      }
      patch.levelIncomeTiers = resolved;
    }
  } else if (patch.levelIncomeEnabled === true && !existing.levelIncomeTiers?.length) {
    const globalTiers = await getLevelIncomeTiers();
    const resolved = resolvePlanLevelIncomeTiers(true, undefined, globalTiers);
    if (resolved) patch.levelIncomeTiers = resolved;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({
      error: "No plan fields to update",
      hint: "Send a JSON object with at least one known field at the top level (not only under `data`).",
    });
    return;
  }

  await updatePlan(planId, patch);
  const updated = await getPlan(planId);
  if (!updated) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json(planJson(updated));
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

  if (withdrawal.status !== "pending") {
    res.status(400).json({
      error: `Withdrawal is already ${withdrawal.status}. Only pending requests can be approved or rejected.`,
    });
    return;
  }

  if (parsed.data.status === "rejected") {
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

const adminSettingsUpdateSchema = z
  .object({
    withdrawalFeePercent: z.number().min(0).max(100).optional(),
    peerTransferFeePercent: z.number().min(0).max(100).optional(),
    binaryPlanEnabled: z.boolean().optional(),
    directIncomeEnabled: z.boolean().optional(),
    standalonePlanCreationOnly: z.boolean().optional(),
    minWithdrawalAmount: z.number().int().min(1).optional(),
  })
  .refine(
    (d) =>
      d.withdrawalFeePercent !== undefined ||
      d.peerTransferFeePercent !== undefined ||
      d.binaryPlanEnabled !== undefined ||
      d.directIncomeEnabled !== undefined ||
      d.standalonePlanCreationOnly !== undefined ||
      d.minWithdrawalAmount !== undefined,
    {
      message: "Provide at least one setting to update",
    },
  );

router.get("/settings", async (_req, res) => {
  const [
    withdrawalFeePercent,
    peerTransferFeePercent,
    binaryPlanEnabled,
    directIncomeEnabled,
    standalonePlanCreationOnly,
    minWithdrawalAmount,
  ] = await Promise.all([
    getWithdrawalFeePercent(),
    getPeerTransferFeePercent(),
    getBinaryPlanEnabled(),
    getDirectIncomeEnabled(),
    getStandalonePlanCreationOnly(),
    getMinWithdrawalAmount(),
  ]);
  res.json({
    withdrawalFeePercent,
    peerTransferFeePercent,
    binaryPlanEnabled,
    directIncomeEnabled,
    standalonePlanCreationOnly,
    minWithdrawalAmount,
  });
});

router.put("/settings", async (req, res) => {
  const parsed = adminSettingsUpdateSchema.safeParse(normalizeAdminSettingsBody(req.body));
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || "Invalid settings payload",
    });
    return;
  }
  await patchGlobalSettings(parsed.data);
  const [
    withdrawalFeePercent,
    peerTransferFeePercent,
    binaryPlanEnabled,
    directIncomeEnabled,
    standalonePlanCreationOnly,
    minWithdrawalAmount,
  ] = await Promise.all([
    getWithdrawalFeePercent(),
    getPeerTransferFeePercent(),
    getBinaryPlanEnabled(),
    getDirectIncomeEnabled(),
    getStandalonePlanCreationOnly(),
    getMinWithdrawalAmount(),
  ]);
  res.json({
    withdrawalFeePercent,
    peerTransferFeePercent,
    binaryPlanEnabled,
    directIncomeEnabled,
    standalonePlanCreationOnly,
    minWithdrawalAmount,
  });
});

const levelIncomeTierSchema = z.object({
  level: z.number().int().min(1).max(MAX_LEVEL_INCOME_TIERS),
  percent: z.number().int().min(0).max(100),
});

const adminUpdateLevelIncomeSchema = z
  .object({
    levels: z.array(levelIncomeTierSchema).min(1).max(MAX_LEVEL_INCOME_TIERS).optional(),
    defaultOnNewPlans: z.boolean().optional(),
  })
  .refine((d) => d.levels !== undefined || d.defaultOnNewPlans !== undefined, {
    message: "Provide levels and/or defaultOnNewPlans",
  });

router.get("/level-income", async (_req, res) => {
  const [levels, defaultOnNewPlans] = await Promise.all([getLevelIncomeTiers(), getDefaultLevelIncomeOnNewPlans()]);
  res.json({ levels, maxLevels: MAX_LEVEL_INCOME_TIERS, defaultOnNewPlans });
});

router.put("/level-income", async (req, res) => {
  const parsed = adminUpdateLevelIncomeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }
  if (parsed.data.levels !== undefined) {
    const validated = validateLevelIncomeTiersInput(parsed.data.levels);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    await setLevelIncomeTiers(validated.tiers);
  }
  if (parsed.data.defaultOnNewPlans !== undefined) {
    await patchGlobalSettings({ defaultLevelIncomeOnNewPlans: parsed.data.defaultOnNewPlans });
  }
  const [levels, defaultOnNewPlans] = await Promise.all([getLevelIncomeTiers(), getDefaultLevelIncomeOnNewPlans()]);
  res.json({ levels, maxLevels: MAX_LEVEL_INCOME_TIERS, defaultOnNewPlans });
});

function paymentSettingsToAdminJson(s: Awaited<ReturnType<typeof getPaymentSettings>>) {
  return {
    qrCodeImageUrl: s.qrCodeImageUrl,
    isPaymentEnabled: s.isPaymentEnabled,
    depositMethod: s.depositMethod,
    upiIds: s.upiIds,
    payeeName: s.payeeName,
    updatedAt: s.updatedAt,
  };
}

/** Unwrap `{ data: { ... } }` bodies from some API clients. */
function normalizeAdminSettingsBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner;
  }
  return raw;
}

function normalizeAdminPaymentSettingsBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner;
  }
  return raw;
}

router.get("/payment-settings", async (_req, res) => {
  try {
    const s = await getPaymentSettings();
    res.json(paymentSettingsToAdminJson(s));
  } catch (e) {
    logger.error({ err: e }, "Failed to load payment settings");
    res.status(500).json({ error: "Could not load payment settings." });
  }
});

const adminPaymentSettingsPutSchema = z.object({
  qrCodeImageUrl: z.string().max(2048).optional(),
  isPaymentEnabled: z.boolean().optional(),
  depositMethod: z.enum(["legacy_qr", "dynamic_upi"]).optional(),
  upiIds: z.array(z.string().min(3).max(120)).optional(),
  payeeName: z.string().min(1).max(80).optional(),
});

router.put("/payment-settings", async (req, res) => {
  const body = normalizeAdminPaymentSettingsBody(req.body);
  const parsed = adminPaymentSettingsPutSchema.safeParse(body);
  if (!parsed.success) {
    sendZod400(res, parsed.error);
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({
      error:
        "Request body is empty. Send at least one of: isPaymentEnabled, depositMethod, upiIds, payeeName, qrCodeImageUrl.",
    });
    return;
  }
  const patch: {
    qrCodeImageUrl?: string;
    isPaymentEnabled?: boolean;
    depositMethod?: "legacy_qr" | "dynamic_upi";
    upiIds?: string[];
    payeeName?: string;
  } = {};
  if (parsed.data.qrCodeImageUrl !== undefined) patch.qrCodeImageUrl = parsed.data.qrCodeImageUrl;
  if (parsed.data.isPaymentEnabled !== undefined) patch.isPaymentEnabled = parsed.data.isPaymentEnabled;
  if (parsed.data.depositMethod !== undefined) patch.depositMethod = parsed.data.depositMethod;
  if (parsed.data.upiIds !== undefined) {
    patch.upiIds = sanitizeUpiIds(parsed.data.upiIds);
  }
  if (parsed.data.payeeName !== undefined) patch.payeeName = parsed.data.payeeName.trim();
  try {
    await updatePaymentSettings(patch);
    const s = await getPaymentSettings();
    res.json(paymentSettingsToAdminJson(s));
  } catch (e) {
    logger.error({ err: e }, "Failed to update payment settings");
    res.status(500).json({ error: "Could not update payment settings." });
  }
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
      payeeUpiId: d.payeeUpiId ?? null,
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
    roiPoolPercent: inv.roiPoolPercent ?? DEFAULT_ROI_POOL_PERCENT,
  };
}

router.get("/investments", async (req, res) => {
  const statusFilter = (req.query.status as string) || "all";
  const userIdFilter =
    typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : undefined;
  const searchRaw = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const [users, growthSettings, allGrowthCycles] = await Promise.all([
    listUsersOrdered(),
    getGrowthPlanSettings(),
    listAllGrowthCyclesOrdered(),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));

  type UnifiedRow =
    | { kind: "mlm"; sortDate: string; inv: InvestmentDoc & { id: string } }
    | { kind: "growth"; sortDate: string; cycle: GrowthCycleDoc & { id: string } };

  const unified: UnifiedRow[] = [];

  const mlmInvestments = await listAllInvestmentsOrdered();
  for (const inv of mlmInvestments) {
    unified.push({ kind: "mlm", sortDate: toIso(inv.createdAt), inv });
  }
  for (const cycle of allGrowthCycles) {
    unified.push({ kind: "growth", sortDate: toIso(cycle.planStartDate), cycle });
  }
  unified.sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  const matchesSearch = (userId: string) => {
    if (!searchRaw) return true;
    const u = userMap.get(userId);
    if (!u) return userId.toLowerCase().includes(searchRaw);
    return (
      userId.toLowerCase().includes(searchRaw) ||
      (u.email && u.email.toLowerCase().includes(searchRaw)) ||
      (u.name && u.name.toLowerCase().includes(searchRaw))
    );
  };

  let filtered = unified.filter((row) => {
    const userId = row.kind === "mlm" ? row.inv.userId : row.cycle.userId;
    if (userIdFilter && userId !== userIdFilter) return false;
    if (!matchesSearch(userId)) return false;
    if (statusFilter === "active") {
      return row.kind === "mlm" ? row.inv.isActive : row.cycle.planStatus === "active";
    }
    if (statusFilter === "completed") {
      return row.kind === "mlm" ? !row.inv.isActive : row.cycle.planStatus !== "active";
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const items = [];
  for (const row of pageRows) {
    if (row.kind === "mlm") {
      const u = userMap.get(row.inv.userId) ?? (await getUser(row.inv.userId));
      const p = await getPlan(row.inv.planId);
      items.push(adminInvestmentToJson(row.inv, u, p));
      continue;
    }
    const u = userMap.get(row.cycle.userId) ?? (await getUser(row.cycle.userId));
    if (!u) continue;
    items.push(growthCycleToAdminInvestmentJson(row.cycle, u, growthSettings));
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
  if (!targetUser.isActive) {
    res.status(403).json({ error: "That member account is inactive." });
    return;
  }
  if (targetUser.role === "admin") {
    res.status(403).json({ error: "Cannot activate a plan for an admin account." });
    return;
  }

  const maxReturn =
    typeof plan.maxReturn === "number" && Number.isFinite(plan.maxReturn) && plan.maxReturn > 0
      ? plan.maxReturn
      : plan.amount * 2;
  const planForMlm = { ...plan, maxReturn };

  const invId = await createInvestmentWithMlmAtomic({
    userId,
    plan: planForMlm,
    deductFromWallet: false,
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
  if (investmentId.startsWith("growth:")) {
    res.status(400).json({
      error: "Smart Growth cycles are managed from the activate form (Inactivate Smart Growth).",
    });
    return;
  }
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
    out.push(formatIncomeHistoryApi(row, planName));
  }

  res.json({ items: out, nextCursor });
});

export default router;
