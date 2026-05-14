import { Timestamp } from "firebase-admin/firestore";
import {
  listActiveInvestments,
  getInvestment,
  updateInvestment,
  getUser,
  updateUser,
  addIncomeHistory,
  computeInvestmentIsActive,
  type ManualStatus,
} from "./firestore-db.js";

export function isIstWeekend(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

export type RoiJobResult = {
  message: string;
  processedCount: number;
  skippedWeekend: boolean;
  deactivatedCount: number;
};

async function deactivateForSystem(invId: string, manualStatus: ManualStatus, ts: Timestamp): Promise<void> {
  await updateInvestment(invId, {
    systemActive: false,
    manualStatus,
    isActive: computeInvestmentIsActive(false, manualStatus),
    lastRoiUpdate: ts,
  });
}

export async function runDailyRoiJob(now: Date = new Date()): Promise<RoiJobResult> {
  if (isIstWeekend(now)) {
    return {
      message: "Skipping ROI — weekend (Asia/Kolkata)",
      processedCount: 0,
      skippedWeekend: true,
      deactivatedCount: 0,
    };
  }

  const candidates = await listActiveInvestments();
  let processedCount = 0;
  let deactivatedCount = 0;
  const ts = Timestamp.now();

  for (const snapshotRow of candidates) {
    const inv = await getInvestment(snapshotRow.id);
    if (!inv?.isActive) continue;

    if (inv.manualStatus === "inactive" || !inv.systemActive) {
      if (inv.isActive) {
        await updateInvestment(inv.id, {
          isActive: computeInvestmentIsActive(inv.systemActive, inv.manualStatus),
        });
      }
      continue;
    }

    const { totalEarned, maxReturn, dailyRoi, daysCompleted, maxDays, amount } = inv;

    if (totalEarned >= maxReturn || daysCompleted >= maxDays) {
      await deactivateForSystem(inv.id, inv.manualStatus, ts);
      deactivatedCount++;
      continue;
    }

    const remaining = maxReturn - totalEarned;
    const payout = Math.min(dailyRoi, Math.max(0, remaining));
    if (payout <= 0) {
      await deactivateForSystem(inv.id, inv.manualStatus, ts);
      deactivatedCount++;
      continue;
    }

    const newTotalEarned = totalEarned + payout;
    const newDaysCompleted = daysCompleted + 1;
    const systemDone = newTotalEarned >= maxReturn || newDaysCompleted >= maxDays;
    const newSystemActive = !systemDone;

    await updateInvestment(inv.id, {
      totalEarned: newTotalEarned,
      daysCompleted: newDaysCompleted,
      systemActive: newSystemActive,
      manualStatus: inv.manualStatus,
      isActive: computeInvestmentIsActive(newSystemActive, inv.manualStatus),
      lastRoiUpdate: ts,
    });

    const u = await getUser(inv.userId);
    if (u) {
      await updateUser(inv.userId, {
        walletBalance: u.walletBalance + payout,
      });
    }

    await addIncomeHistory({
      userId: inv.userId,
      investmentId: inv.id,
      amount: payout,
      type: "ROI",
      planAmount: amount,
      dayNumber: newDaysCompleted,
      date: ts,
    });

    if (systemDone) deactivatedCount++;
    processedCount++;
  }

  return {
    message: `ROI processed for ${processedCount} investments. ${deactivatedCount} completed or deactivated.`,
    processedCount,
    skippedWeekend: false,
    deactivatedCount,
  };
}
