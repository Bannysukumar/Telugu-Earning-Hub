import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "./firebase-admin.js";
import {
  getGrowthPlanSettings,
  growthPlanStateFromData,
  istDateKey,
  type GrowthPlanUserState,
  type GrowthUserDoc,
} from "./growth-plan-db.js";

const db = admin.firestore();

export type GrowthPlanJobResult = {
  message: string;
  processedCount: number;
  expiredCount: number;
  completedCount: number;
  skippedCount: number;
};

function creditGrowthIncome(
  state: GrowthPlanUserState,
  amount: number,
  kind: "roi" | "direct",
): GrowthPlanUserState {
  const room = Math.max(0, state.earningCap - state.currentPlanIncome);
  const payout = Math.min(amount, room);
  if (payout <= 0) {
    const capped: GrowthPlanUserState = {
      ...state,
      planStatus: "completed",
      canReEnter: true,
      isEligibleWithdrawal: false,
    };
    return capped;
  }
  const next: GrowthPlanUserState = {
    ...state,
    currentPlanIncome: state.currentPlanIncome + payout,
    lifetimeIncome: state.lifetimeIncome + payout,
    withdrawableBalance: state.withdrawableBalance + payout,
    roiIncome: kind === "roi" ? state.roiIncome + payout : state.roiIncome,
    directIncome: kind === "direct" ? state.directIncome + payout : state.directIncome,
  };
  if (next.currentPlanIncome >= next.earningCap) {
    next.planStatus = "completed";
    next.canReEnter = true;
    next.isEligibleWithdrawal = false;
  }
  return next;
}

async function countActiveDirectsForUser(sponsorId: string): Promise<number> {
  const snap = await db.collection("users").where("referredBy", "==", sponsorId).get();
  let count = 0;
  for (const doc of snap.docs) {
    const gp = (doc.data() as GrowthUserDoc).growthPlan;
    if (gp?.planStatus === "active") count += 1;
  }
  return count;
}

export async function runGrowthPlanDailyJob(now: Date = new Date()): Promise<GrowthPlanJobResult> {
  const settings = await getGrowthPlanSettings();
  if (settings.planStatus !== "active") {
    return {
      message: "Smart Growth Plan disabled by admin",
      processedCount: 0,
      expiredCount: 0,
      completedCount: 0,
      skippedCount: 0,
    };
  }

  const todayKey = istDateKey(now);
  const usersSnap = await db.collection("users").get();

  let processedCount = 0;
  let expiredCount = 0;
  let completedCount = 0;
  let skippedCount = 0;

  for (const doc of usersSnap.docs) {
    const user = doc.data() as GrowthUserDoc;
    if (!user.growthPlan || user.growthPlan.planStatus === "none") continue;

    let gp = growthPlanStateFromData(user, settings);
    if (gp.planStatus !== "active") continue;
    if (!user.isActive) {
      gp = { ...gp, planStatus: "inactive", isEligibleWithdrawal: false };
      await db.collection("users").doc(doc.id).update({
        growthPlan: gp,
        updatedAt: FieldValue.serverTimestamp(),
      });
      skippedCount += 1;
      continue;
    }

    const endDate = gp.planEndDate?.toDate();
    if (endDate && now.getTime() > endDate.getTime()) {
      gp = {
        ...gp,
        planStatus: "expired",
        canReEnter: settings.enableReentry,
        isEligibleWithdrawal: false,
      };
      await db.collection("users").doc(doc.id).update({
        growthPlan: gp,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (gp.cycleId) {
        await db.collection("growthCycles").doc(gp.cycleId).update({
          planStatus: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      expiredCount += 1;
      continue;
    }

    if (gp.currentPlanIncome >= gp.earningCap) {
      gp = { ...gp, planStatus: "completed", canReEnter: settings.enableReentry, isEligibleWithdrawal: false };
      await db.collection("users").doc(doc.id).update({
        growthPlan: gp,
        updatedAt: FieldValue.serverTimestamp(),
      });
      completedCount += 1;
      continue;
    }

    if (!settings.enableRoi) {
      skippedCount += 1;
      continue;
    }

    if (gp.lastRoiProcessed === todayKey) {
      skippedCount += 1;
      continue;
    }

    const payout = Math.min(settings.dailyRoi, gp.earningCap - gp.currentPlanIncome);
    if (payout <= 0) {
      gp = { ...gp, planStatus: "completed", canReEnter: settings.enableReentry, isEligibleWithdrawal: false };
      await db.collection("users").doc(doc.id).update({
        growthPlan: gp,
        updatedAt: FieldValue.serverTimestamp(),
      });
      completedCount += 1;
      continue;
    }

    const updatedGp = creditGrowthIncome(gp, payout, "roi");
    const activeDirectCount = await countActiveDirectsForUser(doc.id);
    const isEligibleWithdrawal =
      updatedGp.planStatus === "active" && activeDirectCount >= 2 && updatedGp.currentPlanIncome < updatedGp.earningCap;

    const walletBalance = Number(user.walletBalance ?? 0) + payout;
    const ts = Timestamp.now();

    await db.collection("users").doc(doc.id).update({
      walletBalance,
      growthPlan: {
        ...updatedGp,
        activeDirectCount,
        lastRoiProcessed: todayKey,
        isEligibleWithdrawal,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (gp.cycleId) {
      await db.collection("growthCycles").doc(gp.cycleId).update({
        currentPlanIncome: updatedGp.currentPlanIncome,
        roiIncome: updatedGp.roiIncome,
        planStatus: updatedGp.planStatus,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: updatedGp.planStatus === "completed" ? ts : null,
      });
    }

    await db.collection("incomeHistory").add({
      userId: doc.id,
      investmentId: "__growth_plan__",
      amount: payout,
      type: "GROWTH_ROI",
      planAmount: gp.planAmount,
      dayNumber: Math.floor((updatedGp.currentPlanIncome - updatedGp.directIncome) / settings.dailyRoi),
      note: `${settings.planName} daily ROI`,
      date: ts,
    });

    processedCount += 1;
    if (updatedGp.planStatus === "completed") completedCount += 1;
  }

  return {
    message: `Growth ROI processed for ${processedCount} users. Expired ${expiredCount}, completed ${completedCount}, skipped ${skippedCount}.`,
    processedCount,
    expiredCount,
    completedCount,
    skippedCount,
  };
}
