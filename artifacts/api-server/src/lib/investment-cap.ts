import type { Timestamp } from "firebase-admin/firestore";
import { computeInvestmentIsActive, type ManualStatus } from "./firestore-db.js";

/** Whether this investment has reached its max return (admin cap). */
export function isInvestmentCapReached(totalEarned: number, maxReturn: number): boolean {
  return totalEarned >= maxReturn;
}

export function isInvestmentTermComplete(
  totalEarned: number,
  maxReturn: number,
  daysCompleted: number,
  maxDays: number,
): boolean {
  return isInvestmentCapReached(totalEarned, maxReturn) || daysCompleted >= maxDays;
}

/** Remaining ₹ that can still be credited (ROI, level income, binary, etc.) on this investment. */
export function investmentCapHeadroom(totalEarned: number, maxReturn: number): number {
  return Math.max(0, maxReturn - totalEarned);
}

export type InvestmentEarnedStatePatch = {
  totalEarned: number;
  systemActive: boolean;
  manualStatus: ManualStatus;
  isActive: boolean;
  daysCompleted?: number;
  lastRoiUpdate?: Timestamp;
};

/**
 * After any earnings credit (ROI, level income, binary, referral), apply totalEarned and
 * deactivate when the plan cap (maxReturn) or max days is reached.
 */
export function patchAfterEarningsCredit(
  totalEarned: number,
  maxReturn: number,
  manualStatus: ManualStatus,
  opts?: { daysCompleted?: number; maxDays?: number; lastRoiUpdate?: Timestamp },
): InvestmentEarnedStatePatch {
  const daysCompleted = opts?.daysCompleted;
  const maxDays = opts?.maxDays;
  const termDone =
    isInvestmentCapReached(totalEarned, maxReturn) ||
    (typeof daysCompleted === "number" &&
      typeof maxDays === "number" &&
      daysCompleted >= maxDays);
  const systemActive = !termDone;
  return {
    totalEarned,
    systemActive,
    manualStatus,
    isActive: computeInvestmentIsActive(systemActive, manualStatus),
    ...(daysCompleted !== undefined ? { daysCompleted } : {}),
    ...(opts?.lastRoiUpdate ? { lastRoiUpdate: opts.lastRoiUpdate } : {}),
  };
}
