import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import {
  getUser,
  listInvestmentsByUser,
  listWithdrawalsByUser,
  updateUser,
  listIncomeHistoryForUser,
  getInvestment,
  getPlan,
  type IncomeHistoryDoc,
  toIso,
  getPaymentSettings,
  listDepositsByUser,
  createDepositAtomic,
  normalizeDepositTransactionId,
  DepositRequestError,
  type DepositDoc,
} from "../lib/firestore-db.js";
import { requireAuth, formatUserResponse, type AuthedUser } from "../lib/auth.js";
import { uploadPublicDownloadUrl, StorageUploadError } from "../lib/storage-upload.js";

const router: IRouter = Router();

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
    status: d.status,
    createdAt: toIso(d.createdAt),
    updatedAt: d.updatedAt ? toIso(d.updatedAt) : null,
  };
}

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;

  const allInvestments = await listInvestmentsByUser(user.id);
  const totalInvested = allInvestments.reduce((acc, inv) => acc + inv.amount, 0);
  const totalEarned = allInvestments.reduce((acc, inv) => acc + inv.totalEarned, 0);
  const activeInvestments = allInvestments.filter((inv) => inv.isActive).length;
  const completedInvestments = allInvestments.filter((inv) => !inv.isActive).length;

  const withdrawals = await listWithdrawalsByUser(user.id);
  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((acc, w) => acc + w.requestAmount, 0);

  const fresh = await getUser(user.id);
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

  res.json(formatUserResponse(updated));
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
    if (row.type !== "WITHDRAWAL" && row.investmentId && row.investmentId !== "__withdrawal__" && row.investmentId !== "__deposit__") {
      const inv = await getInvestment(row.investmentId);
      const p = inv ? await getPlan(inv.planId) : null;
      planName = p?.name ?? null;
    }
    out.push(formatIncomeHistoryUser(row, planName));
  }

  res.json({ items: out, nextCursor: nextCursor ?? null });
});

router.get("/payment-settings", requireAuth, async (_req, res) => {
  const s = await getPaymentSettings();
  res.json({
    qrCodeImageUrl: s.qrCodeImageUrl,
    isPaymentEnabled: s.isPaymentEnabled,
    updatedAt: s.updatedAt,
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
  if (!file?.buffer) {
    res.status(400).json({ error: "Screenshot is required." });
    return;
  }

  const amount = Number(req.body?.amount);
  const transactionId = normalizeDepositTransactionId(String(req.body?.transactionId ?? ""));
  const noteRaw = req.body?.note;
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim().slice(0, 2000) : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Amount must be a number greater than 0." });
    return;
  }
  if (!transactionId) {
    res.status(400).json({ error: "Transaction ID is required." });
    return;
  }

  const ext =
    file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
  const path = `deposit-screenshots/${user.id}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

  let screenshotUrl: string;
  try {
    screenshotUrl = await uploadPublicDownloadUrl(path, file.buffer, file.mimetype);
  } catch (e) {
    if (e instanceof StorageUploadError) {
      res.status(400).json({ error: e.message });
      return;
    }
    throw e;
  }

  try {
    const id = await createDepositAtomic({
      userId: user.id,
      amount,
      transactionId,
      screenshotUrl,
      note,
    });
    res.status(201).json({ id, screenshotUrl, message: "Deposit request submitted." });
  } catch (e) {
    if (e instanceof DepositRequestError) {
      const code = e.code;
      const status =
        code === "PENDING_DEPOSIT_EXISTS" ? 409 : code === "DUPLICATE_TRANSACTION_ID" ? 409 : 400;
      res.status(status).json({ error: e.message, code });
      return;
    }
    throw e;
  }
});

export default router;
