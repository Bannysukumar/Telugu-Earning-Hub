import { Timestamp } from "firebase-admin/firestore";
import {
  listActiveInvestments,
  getInvestment,
  getPlan,
  updateInvestment,
  getUser,
  updateUser,
  addIncomeHistory,
  type ManualStatus,
} from "./firestore-db.js";
import { distributeLevelIncomeFromRoi } from "./level-income.js";
import {
  investmentCapHeadroom,
  isInvestmentCapReached,
  isInvestmentTermComplete,
  patchAfterEarningsCredit,
} from "./investment-cap.js";

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

async function deactivateForSystem(
  invId: string,
  inv: { totalEarned: number; maxReturn: number; manualStatus: ManualStatus; daysCompleted: number; maxDays: number },
  ts: Timestamp,
): Promise<void> {
  await updateInvestment(
    invId,
    patchAfterEarningsCredit(inv.totalEarned, inv.maxReturn, inv.manualStatus, {
      daysCompleted: inv.daysCompleted,
      maxDays: inv.maxDays,
      lastRoiUpdate: ts,
    }),
  );
}

/** Fix investments that hit cap but are still marked active (e.g. legacy MLM credits). */
async function deactivateAllCappedInvestments(ts: Timestamp): Promise<number> {
  const active = await listActiveInvestments();
  let n = 0;
  for (const inv of active) {
    if (!isInvestmentCapReached(inv.totalEarned, inv.maxReturn) && inv.daysCompleted < inv.maxDays) {
      continue;
    }
    await deactivateForSystem(inv.id, inv, ts);
    n++;
  }
  return n;
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
      if (inv.isActive && isInvestmentCapReached(inv.totalEarned, inv.maxReturn)) {
        await deactivateForSystem(inv.id, inv, ts);
        deactivatedCount++;
      }
      continue;
    }

    const { totalEarned, maxReturn, dailyRoi, daysCompleted, maxDays, amount } = inv;

    if (isInvestmentTermComplete(totalEarned, maxReturn, daysCompleted, maxDays)) {
      await deactivateForSystem(inv.id, inv, ts);
      deactivatedCount++;
      continue;
    }

    const remaining = investmentCapHeadroom(totalEarned, maxReturn);
    const roiPct = Math.min(100, Math.max(1, Math.round(Number(inv.roiPoolPercent ?? 100))));
    const payout = Math.min(dailyRoi * (roiPct / 100), remaining);
    if (payout <= 0) {
      await deactivateForSystem(inv.id, inv, ts);
      deactivatedCount++;
      continue;
    }

    const newTotalEarned = totalEarned + payout;
    const newDaysCompleted = daysCompleted + 1;

    await updateInvestment(
      inv.id,
      patchAfterEarningsCredit(newTotalEarned, maxReturn, inv.manualStatus, {
        daysCompleted: newDaysCompleted,
        maxDays,
        lastRoiUpdate: ts,
      }),
    );

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

    const plan = await getPlan(inv.planId);
    if (plan) {
      await distributeLevelIncomeFromRoi({
        sourceUserId: inv.userId,
        roiPayout: payout,
        plan,
        sourceInvestmentId: inv.id,
        dayNumber: newDaysCompleted,
      });
    }

    if (isInvestmentTermComplete(newTotalEarned, maxReturn, newDaysCompleted, maxDays)) {
      deactivatedCount++;
    }
    processedCount++;
  }

  const swept = await deactivateAllCappedInvestments(ts);
  deactivatedCount += swept;

  return {
    message: `ROI processed for ${processedCount} investments. ${deactivatedCount} completed or deactivated (${swept} capped cleanup).`,
    processedCount,
    skippedWeekend: false,
    deactivatedCount,
  };
}
