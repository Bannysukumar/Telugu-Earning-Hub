import type { Request, Response, NextFunction } from "express";
import { admin } from "./firebase-admin.js";
import { getUser, toIso, type UserDoc } from "./firestore-db.js";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@roiplatform.com";

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

export function formatUserResponse(user: AuthedUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role,
    walletBalance: user.walletBalance,
    isActive: user.isActive,
    createdAt: toIso(user.createdAt),
  };
}
