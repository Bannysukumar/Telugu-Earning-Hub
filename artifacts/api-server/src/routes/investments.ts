import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import {
  getPlan,
  createInvestment,
  getInvestment,
  listInvestmentsByUser,
  type InvestmentDoc,
  getUser,
  db,
} from "../lib/firestore-db.js";
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

const createSchema = z.object({ planId: z.string().min(1) });

router.post("/", requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { planId } = parsed.data;
  const plan = await getPlan(planId);
  if (!plan || !plan.isActive) {
    res.status(404).json({ error: "Plan not found or inactive" });
    return;
  }

  // Use a transaction to check wallet balance, deduct amount, and create investment atomically
  const invId = await db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(user.id);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error("User not found");
    }
    const userData = userSnap.data() as { walletBalance?: number };
    const balance = Number(userData.walletBalance ?? 0);

    if (balance < plan.amount) {
      throw new Error("Insufficient wallet balance. Please add funds to your wallet.");
    }

    // Deduct from wallet
    tx.update(userRef, {
      walletBalance: balance - plan.amount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create investment record
    const investmentsCol = db.collection("investments");
    const invRef = investmentsCol.doc();
    tx.set(invRef, {
      userId: user.id,
      planId: plan.id,
      amount: plan.amount,
      dailyRoi: plan.dailyRoi,
      maxReturn: plan.maxReturn,
      maxDays: plan.maxDays,
      totalEarned: 0,
      daysCompleted: 0,
      systemActive: true,
      manualStatus: "active",
      isActive: true,
      startDate: Timestamp.now(),
      lastRoiUpdate: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Create income history entry for the investment
    const incomeHistoryCol = db.collection("incomeHistory");
    const incRef = incomeHistoryCol.doc();
    tx.set(incRef, {
      userId: user.id,
      investmentId: invRef.id,
      amount: -plan.amount,
      type: "INVESTMENT",
      planAmount: plan.amount,
      dayNumber: 0,
      note: `Investment activated - ${plan.name}`,
      date: FieldValue.serverTimestamp(),
    });

    return invRef.id;
  });

  const investment = await getInvestment(invId);
  if (!investment) {
    res.status(500).json({ error: "Investment not persisted" });
    return;
  }
  res.status(201).json(formatInvestment(investment, plan.name));
});

export { formatInvestment };
export default router;
