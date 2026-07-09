import type { Request, Response, NextFunction } from "express";
import { admin } from "./firebase-admin.js";
import {
  getUser,
  listDirectReferralsByReferrerId,
  listInvestmentsByUserIds,
  toIso,
  type UserDoc,
} from "./firestore-db.js";
import {
  getGrowthPlanSettings,
  listGrowthCyclesByUserIds,
  mergeMemberInvestmentStats,
  type GrowthUserDoc,
} from "./growth-plan-db.js";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "bannysukumar@gmail.com";

export type AuthedUser = UserDoc & { id: string };

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await getUser(decoded.uid);
    if (!profile || !profile.isActive) {
      res.status(401).json({ error: "Account not found or deactivated" });
      return;
    }
    (req as Request & { user: AuthedUser }).user = profile;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    const user = (req as Request & { user: AuthedUser }).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

/** Cloud Scheduler / Functions: Authorization: Bearer <CRON_SECRET> OR admin JWT. */
export async function requireCronOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (secret && authHeader === `Bearer ${secret}`) {
    next();
    return;
  }
  await requireAdmin(req, res, next);
}

export async function countQualifiedDirectReferrals(sponsorId: string): Promise<number> {
  const directs = await listDirectReferralsByReferrerId(sponsorId);
  if (directs.length === 0) return 0;

  const directIds = directs.map((d) => d.id);
  const [invByUser, growthCyclesByUser, growthSettings] = await Promise.all([
    listInvestmentsByUserIds(directIds),
    listGrowthCyclesByUserIds(directIds),
    getGrowthPlanSettings(),
  ]);

  let count = 0;
  for (const d of directs) {
    const invs = invByUser.get(d.id) ?? [];
    const cycles = growthCyclesByUser.get(d.id) ?? [];
    const stats = mergeMemberInvestmentStats(invs, d as GrowthUserDoc, cycles, growthSettings);
    if (stats.activeInvestmentsCount > 0) count += 1;
  }
  return count;
}

export async function formatUserResponse(user: AuthedUser) {
  let referrerName: string | null = null;
  let referrerEmail: string | null = null;
  if (user.referrerId) {
    const referrer = await getUser(user.referrerId);
    if (referrer) {
      referrerName = referrer.name;
      referrerEmail = referrer.email;
    }
  }

  const qualifiedDirectReferrals = await countQualifiedDirectReferrals(user.id);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role,
    walletBalance: user.walletBalance,
    isActive: user.isActive,
    createdAt: toIso(user.createdAt),
    referralCode: user.referralCode ?? null,
    qualifiedDirectReferrals,
    referrerId: user.referrerId ?? null,
    referrerName,
    referrerEmail,
  };
}
